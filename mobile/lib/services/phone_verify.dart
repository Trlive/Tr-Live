import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'api.dart';
import 'error_log.dart';

/// Telefon (Firebase SMS) ve e-posta doğrulamasının sunucudaki ayarları ve Firebase ile SMS doğrulaması.
/// Firebase ayarları sunucudan gelir (yönetim > uygulama ayarları); APK'ya gömülü değildir.
class Verify {
  Verify._();
  static Map<String, dynamic>? _cfg;
  static DateTime _at = DateTime.fromMillisecondsSinceEpoch(0);

  static Future<Map<String, dynamic>> _config() async {
    if (_cfg != null && DateTime.now().difference(_at) < const Duration(minutes: 2)) return _cfg!;
    try {
      _cfg = await Api.get('/api/app/config');
      _at = DateTime.now();
    } catch (_) {
      _cfg ??= const {};
    }
    return _cfg!;
  }

  /// Firebase ayarları (null = SMS doğrulaması kapalı).
  static Future<Map<String, dynamic>?> phoneConfig() async {
    final p = (await _config())['phoneVerify'];
    return p is Map ? Map<String, dynamic>.from(p) : null;
  }

  static Future<bool> phoneOn() async => await phoneConfig() != null;
  static Future<bool> emailOn() async => (await _config())['emailVerify'] == true;

  static Future<FirebaseAuth> _auth() async {
    final c = await phoneConfig();
    if (c == null) throw StateError('SMS doğrulaması kapalı');
    if (Firebase.apps.isEmpty) {
      await Firebase.initializeApp(
        options: FirebaseOptions(
          apiKey: '${c['apiKey']}',
          appId: '${c['appId']}',
          messagingSenderId: '${c['senderId'] ?? ''}',
          projectId: '${c['projectId']}',
        ),
      );
    }
    final a = FirebaseAuth.instance;
    try {
      await a.setLanguageCode('tr');
    } catch (_) {}
    return a;
  }

  /// SMS gönderir. Android kodu kendisi okuyabilirse [onAuto] ile doğrudan kimlik token'ı gelir.
  static Future<void> sendSms(
    String phoneE164, {
    required void Function(String verificationId, int? resendToken) onSent,
    required void Function(String idToken) onAuto,
    required void Function(String message) onError,
    int? resendToken,
    String? language,
  }) async {
    final FirebaseAuth a;
    try {
      a = await _auth();
      if (language != null) await a.setLanguageCode(language);
    } catch (e) {
      onError(_message(e));
      return;
    }
    await a.verifyPhoneNumber(
      phoneNumber: phoneE164,
      timeout: const Duration(seconds: 60),
      forceResendingToken: resendToken,
      verificationCompleted: (cred) async {
        try {
          final t = await _signIn(a, cred);
          if (t != null) onAuto(t);
        } catch (e) {
          onError(_message(e));
        }
      },
      verificationFailed: (e) => onError(_message(e)),
      codeSent: onSent,
      codeAutoRetrievalTimeout: (_) {},
    );
  }

  /// Girilen 6 haneli kodu doğrular, sunucuya gönderilecek kimlik token'ını döndürür.
  static Future<String> confirmCode(String verificationId, String code) async {
    final a = await _auth();
    final t = await _signIn(a, PhoneAuthProvider.credential(verificationId: verificationId, smsCode: code));
    if (t == null) throw StateError('token');
    return t;
  }

  static Future<String?> _signIn(FirebaseAuth a, PhoneAuthCredential cred) async {
    final r = await a.signInWithCredential(cred);
    final t = await r.user?.getIdToken(true);
    // Firebase oturumu tutulmaz: hesap bizim sunucumuzda, Firebase yalnızca numarayı doğrular.
    await a.signOut();
    return t;
  }

  /// Firebase hata kodlarını anlaşılır Türkçe anahtarlara çevirir (ekranda tx ile çevrilir).
  static String _message(Object e) {
    final code = e is FirebaseAuthException ? e.code : '';
    final raw = e is FirebaseAuthException ? '${e.message ?? ''}' : '$e';
    // Asıl neden kayda yazılır (Hata kayıtları) — SMS gelmediğinde nedeni buradan görülür.
    ErrorLog.add('SMS doğrulaması', '$code $raw');
    // Firebase'in en sık kurulum hataları: plan, SHA parmak izi, telefon girişi kapalı.
    if (raw.contains('BILLING_NOT_ENABLED')) return 'SMS gönderilemedi: Firebase projesi Blaze planında değil.';
    if (raw.contains('SHA') || raw.contains('play_integrity') || code == 'app-not-authorized') {
      return 'SMS gönderilemedi: uygulamanın SHA parmak izi Firebase\'e eklenmemiş.';
    }
    if (code == 'operation-not-allowed') return 'SMS gönderilemedi: Firebase\'te telefon girişi kapalı.';
    return switch (code) {
      'invalid-verification-code' => 'Kod hatalı. Tekrar dene.',
      'session-expired' || 'code-expired' => 'Kodun süresi doldu. Yeni kod iste.',
      'invalid-phone-number' => 'Telefon numarası geçersiz.',
      'too-many-requests' || 'quota-exceeded' => 'Çok fazla deneme yapıldı. Bir süre sonra tekrar dene.',
      'network-request-failed' => 'İnternet bağlantını kontrol et.',
      'app-not-authorized' || 'missing-client-identifier' || 'invalid-app-credential' => 'SMS doğrulaması bu uygulama için henüz ayarlanmadı.',
      _ => 'SMS doğrulaması başarısız oldu. Tekrar dene.',
    };
  }
}

/// Girilen numarayı uluslararası biçime çevirir (+905551112233). [dial]: ülke kodu (ör. +90).
/// Türkiye numaraları 0 / 90 / 5 ile yazılabilir; + ile yazılan numara olduğu gibi alınır. Geçersizse null.
String? toE164(String input, {String dial = '+90'}) {
  var s = input.replaceAll(RegExp(r'[\s\-().]'), '');
  if (s.isEmpty) return null;
  if (s.startsWith('00')) s = '+${s.substring(2)}';
  if (!s.startsWith('+')) {
    final d = dial.replaceAll('+', '');
    if (d == '90') {
      if (RegExp(r'^0?5\d{9}$').hasMatch(s)) s = '+90${s.replaceFirst(RegExp(r'^0'), '')}';
      if (RegExp(r'^905\d{9}$').hasMatch(s)) s = '+$s';
    } else {
      s = '+$d${s.replaceFirst(RegExp(r'^0'), '')}';
    }
  }
  if (!RegExp(r'^\+[1-9]\d{7,14}$').hasMatch(s)) return null;
  if (s.startsWith('+90') && !RegExp(r'^\+905\d{9}$').hasMatch(s)) return null;
  return s;
}
