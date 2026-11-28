import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import 'api.dart';
import 'device_info.dart';
import 'login_link.dart';
import 'error_log.dart';
import 'inbox_service.dart';
import 'music_service.dart';
import 'presence_service.dart';
import 'room_dock.dart';
import 'session.dart';
import 'token_store.dart';
import 'socket_service.dart';

class AuthService {
  static const _key = 'token';
  static const _refreshKey = 'refresh_token';
  static const _expKey = 'token_exp';

  /// Güncel token'ları telefona yazar (uygulama kapanıp açılınca oturum sürsün). Token'lar şifreli depoda (TokenStore);
  /// bitiş zamanı gizli değil, düz depoda kalır.
  static Future<void> persistTokens() async {
    final prefs = await SharedPreferences.getInstance();
    final exp = Api.tokenExpiresAt;
    await TokenStore.write(_key, Api.token);
    await TokenStore.write(_refreshKey, Api.refreshToken);
    if (exp != null) {
      await prefs.setInt(_expKey, exp.millisecondsSinceEpoch);
    } else {
      await prefs.remove(_expKey);
    }
  }

  static Future<void> _save(Map<String, dynamic> r) async {
    Api.clearTokens();
    Api.setTokens(r);
    await persistTokens();
    final u = mapOf(r['user']);
    if (u != null) Session.me.value = u;
    SocketService.instance.start();
    ErrorLog.flushSaved();
  }

  /// Giriş. [totpCode]: hesapta iki adımlı doğrulama açıksa gereken 6 haneli kod
  /// (ya da kurtarma kodu).
  ///
  /// Kod gerekiyorsa sunucu `totp_required` döner; çağıran bunu [TotpRequired] olarak yakalar
  /// ve kod alanını açar. Bu yanıt yalnızca **şifre doğruyken** gelir — yanlış şifrede gelseydi,
  /// bir hesabın 2FA'sının açık olup olmadığı şifre bilmeden öğrenilebilirdi.
  static Future<void> login(String username, String password, {String? totpCode}) async {
    try {
      // Beklenir: token'lar kaydedilmeden giriş "bitti" sayılmasın (eskiden beklenmiyordu; kayıt hatası sessizce kayboluyordu).
      await _save(await Api.post('/api/auth/login', {
        'username': username,
        'password': password,
        'device': await DeviceInfo.collect(),
        if (totpCode != null && totpCode.isNotEmpty) 'totpCode': totpCode,
      }));
    } on ApiException catch (e) {
      if (e.code == 'totp_required') throw TotpRequired();
      rethrow;
    }
  }

  /// Telefon numarasıyla kayıt: numara + şifre + görünen ad. [idToken]: SMS doğrulaması açıksa Firebase kimlik token'ı.
  static Future<void> registerPhone(String phone, String password, String displayName, {String? idToken}) async => _save(await Api.post('/api/auth/register-phone', {
        'phone': phone,
        'password': password,
        'displayName': displayName,
        if (idToken != null) 'idToken': idToken,
        'device': await DeviceInfo.collect(),
      }));

  /// Sunucuda açık olan giriş yöntemleri (Google / Facebook ayarlanmadıysa düğmesi gizlenir).
  static Future<Map<String, dynamic>> providers() async {
    try {
      return await Api.get('/api/auth/providers');
    } catch (_) {
      return const {'google': false, 'facebook': false, 'phone': true};
    }
  }

  /// Google / Facebook ile giriş: giriş sayfası tarayıcıda açılır; onay verilince tarayıcı uygulamaya bir dönüş
  /// bağlantısıyla (tek kullanımlık kod) döner ve oturum o kodla alınır. Bu arada sunucuya durum da sorulur
  /// (iptal / hata hemen görünsün). [cancelled] true olursa bekleme biter. En fazla 5 dakika beklenir.
  static Future<void> social(String provider, {required bool Function() cancelled, void Function()? onWaitingApp}) async {
    final rnd = Random.secure();
    final poll = base64Url.encode(List<int>.generate(36, (_) => rnd.nextInt(256))).replaceAll('=', '');
    final start = await Api.post('/api/auth/oauth/start', {'provider': provider, 'poll': poll});
    final state = start['state']?.toString() ?? '';
    final url = Uri.tryParse(start['url']?.toString() ?? '');
    if (state.isEmpty || url == null) throw ApiException('Giriş başlatılamadı.');
    String? code;
    var linkArrived = Completer<void>();
    final sub = LoginLink.instance.links.listen((q) {
      if (q['state'] != state) return;
      final c = q['code'];
      if (c != null && c.isNotEmpty) code = c;
      if (!linkArrived.isCompleted) linkArrived.complete();
    });
    try {
      if (!await launchUrl(url, mode: LaunchMode.externalApplication)) throw ApiException('Tarayıcı açılamadı.');
      final until = DateTime.now().add(const Duration(minutes: 5));
      while (DateTime.now().isBefore(until)) {
        // Dönüş bağlantısı gelince hemen, gelmezse 3 sn'de bir sorulur.
        await Future.any([linkArrived.future, Future<void>.delayed(const Duration(seconds: 3))]);
        if (linkArrived.isCompleted) linkArrived = Completer<void>();
        if (cancelled()) return;
        Map<String, dynamic> r;
        try {
          r = await Api.post('/api/auth/oauth/poll', {'state': state, 'poll': poll, if (code != null) 'code': code, 'device': await DeviceInfo.collect()});
        } on ApiException catch (e) {
          final s = e.statusCode;
          if (s != null && s < 500 && s != 429) rethrow; // kesin hata (ör. geçersiz kod)
          continue; // bağlantı anlık koptuysa tekrar sorulur
        }
        if (cancelled()) return;
        switch (r['status']) {
          case 'done':
            await _save(r);
            return;
          case 'error':
            throw ApiException((r['message'] ?? 'Giriş yapılamadı.').toString());
          case 'expired':
            throw ApiException('Giriş isteğinin süresi doldu. Tekrar deneyin.');
          case 'waiting_app':
            // Onay verildi ama dönüş bağlantısı gelmedi (tarayıcı otomatik açmadı).
            onWaitingApp?.call();
        }
      }
      throw ApiException('Giriş tamamlanmadı. Tekrar deneyin.');
    } finally {
      await sub.cancel();
    }
  }

  static Future<void> register(String username, String password, String displayName) async => _save(await Api.post('/api/auth/register', {
        'username': username,
        'password': password,
        'displayName': displayName,
        'device': await DeviceInfo.collect(),
      }));

  static Future<void> restore() async {
    // İLK iş: yenilenen token'lar her durumda diske yazılsın. Eskiden bu satır sondaydı; okuma hata verirse ya da açılıştaki
    // süre sınırı (main.dart, 5 sn) aşılırsa hiç kurulmuyordu. O oturumda yenilenen token'lar kaydedilmiyor, sonraki açılışta
    // eski yenileme token'ı gönderiliyor ve sunucu bunu "tekrar kullanım" sayıp oturumu güvenlik gereği kapatıyordu.
    Api.onTokensChanged = persistTokens;
    final prefs = await SharedPreferences.getInstance();
    await TokenStore.clearIfFreshInstall(const [_key, _refreshKey]);
    final read = await Future.wait([TokenStore.read(_key), TokenStore.read(_refreshKey)]);
    // Okuma sürerken giriş yapılmış / yenilenmiş olabilir: bellekteki daha yeni değer ezilmez.
    Api.token ??= read[0];
    Api.refreshToken ??= read[1];
    final exp = prefs.getInt(_expKey);
    Api.tokenExpiresAt ??= exp == null ? null : DateTime.fromMillisecondsSinceEpoch(exp);
  }

  /// Eski sürümden güncellenen uygulama: 30 günlük tek token'ı cihaz oturumuna çevirir (yeniden giriş gerekmez).
  /// Başarısız olursa sorun değil; eski token süresi dolana kadar çalışır, sonraki açılışta yeniden denenir.
  static Future<void> upgradeLegacySession() async {
    if (Api.token == null || Api.refreshToken != null) return;
    try {
      final r = await Api.post('/api/auth/session', {'device': await DeviceInfo.collect()});
      if (r['refreshToken'] is String) {
        Api.setTokens(r);
        await persistTokens();
      }
    } catch (_) {/* sonraki açılışta tekrar denenir */}
  }

  /// Çıkış: sunucudaki cihaz oturumu da kapatılır (internet yoksa yalnızca telefondaki oturum silinir).
  static Future<void> logout() async {
    // Açık (veya küçültülmüş) oda varsa: oturum hâlâ geçerliyken odadan çık, sonra odayı ve müziği kapat.
    // Aksi halde oda arka planda açık kalıyor, sonraki girişte eski oda yeni kullanıcıyla açılıyordu.
    final rid = RoomDock.request.value?.roomId;
    if (rid != null && Api.token != null) {
      try {
        await Api.post('/api/rooms/$rid/leave').timeout(const Duration(seconds: 5));
      } catch (_) {/* çıkış yine de sürer */}
    }
    final rt = Api.refreshToken;
    if (rt != null) {
      try {
        await Api.post('/api/auth/logout', {'refreshToken': rt}).timeout(const Duration(seconds: 4));
      } catch (_) {/* sunucuya ulaşılamasa da telefondaki oturum silinir */}
    }
    RoomDock.close();
    try {
      await MusicService.instance.unbind();
    } catch (_) {}
    SocketService.instance.stop();
    Inbox.stop();
    PresenceService.clear();
    Api.clearTokens();
    Session.clear();
    final prefs = await SharedPreferences.getInstance();
    await TokenStore.write(_key, null);
    await TokenStore.write(_refreshKey, null);
    await prefs.remove(_expKey);
  }
}

/// Hesapta iki adımlı doğrulama açık: giriş ekranı kod alanını açar.
///
/// Ayrı bir sınıf, çünkü bu bir hata değil akışın normal bir adımı: kullanıcıya kırmızı hata
/// kutusu göstermek yerine kod istenir ve şifre alanı korunur.
class TotpRequired implements Exception {
  @override
  String toString() => 'Doğrulama kodu gerekli.';
}
