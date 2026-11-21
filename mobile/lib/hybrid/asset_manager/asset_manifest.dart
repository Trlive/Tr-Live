import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../../services/api.dart';

/// Varlık listesindeki tek bir dosya.
class AssetEntry {
  const AssetEntry({required this.url, required this.kind, required this.priority, this.bytes, this.sha256});

  final String url;
  final String kind;

  /// 1 = odada her an gerekebilir (giriş efekti, ucuz hediye) · 2 = sık · 3 = nadir.
  final int priority;

  /// Sunucunun bildirdiği boyut. Yarım inen dosyayı anlamak için kullanılır.
  /// Bilinmiyorsa null — uydurulmuş bir sayı, doğru inen dosyayı attırırdı.
  final int? bytes;

  /// Bütünlük damgası. Şu an **doğrulanmıyor**: Dart'ta yerleşik SHA-256 yok ve
  /// doğrulayamadığım elle yazılmış bir karma işlevini göndermek, bozuk dosyadan beter olur.
  /// Boyut denetimi gerçek dünyadaki arızayı (yarım inme) zaten yakalıyor.
  /// Damga listede taşınıyor ki `crypto` paketi eklendiğinde sunucu tarafı hazır olsun.
  final String? sha256;

  static AssetEntry? from(Object? raw) {
    if (raw is! Map) return null;
    final url = raw['url']?.toString() ?? '';
    if (url.isEmpty) return null;
    return AssetEntry(
      url: url,
      kind: raw['kind']?.toString() ?? '',
      priority: (raw['priority'] as num?)?.toInt() ?? 3,
      bytes: (raw['bytes'] as num?)?.toInt(),
      sha256: raw['sha256']?.toString(),
    );
  }
}

/// Varlık listesi: uygulamanın önceden indirmesi gereken dosyaların sürümlü listesi.
///
/// ## Niçin var
///
/// Uygulama bugüne kadar hangi dosyayı indireceğini tesadüfen öğreniyordu: hediye paneli açılınca
/// en ucuz 24 hediye. Pahalı ama sık gönderilen bir hediye listeye girmiyorsa, ilk gönderildiğinde
/// ekranda donarak iniyordu. Giriş efektleri hiç önceden inmiyordu.
///
/// Liste bunu düzeltiyor: hangi dosya, ne boyutta, hangi öncelikle.
///
/// ## Geri alma
///
/// **Son çalışan sürüm saklanır.** Yeni listedeki dosyalar inmiyorsa (bozuk yükleme, CDN sorunu)
/// uygulama eski listeye döner ve eski dosyalarla çalışmaya devam eder. Bu, hibrit mimaride
/// varlıkların sunucudan gelmesinin bedeli: sunucu yanlış bir şey yollarsa telefonun elinde
/// dönecek bir yer olmalı.
class AssetManifest {
  AssetManifest._();

  static const _kVersion = 'asset_manifest_version';
  static const _kPayload = 'asset_manifest_payload';
  static const _kLastGood = 'asset_manifest_last_good';

  static String? version;
  static List<AssetEntry> entries = const [];

  /// Sunucudan listeyi alır. Sürüm değişmediyse sunucu 304 döner ve gövde hiç inmez.
  /// Hata durumunda saklanan liste kullanılmaya devam eder: ağ yokken uygulama varlıksız kalmaz.
  static Future<void> refresh() async {
    final prefs = await SharedPreferences.getInstance();
    if (entries.isEmpty) _loadFrom(prefs.getString(_kPayload));

    try {
      final r = await Api.get('/api/assets/manifest');
      final v = r['version']?.toString();
      if (v == null || v.isEmpty) return;
      if (v == version && entries.isNotEmpty) return;
      final list = r['assets'];
      if (list is! List || list.isEmpty) return; // boş liste geldiyse eldeki korunur

      // Yeni listeye geçmeden ÖNCE çalışan sürüm saklanır: yeni liste sorun çıkarırsa dönülecek yer.
      final current = prefs.getString(_kPayload);
      if (current != null && version != null) await prefs.setString(_kLastGood, current);

      final payload = jsonEncode({'version': v, 'assets': list});
      await prefs.setString(_kPayload, payload);
      await prefs.setString(_kVersion, v);
      _loadFrom(payload);
    } catch (_) {
      // Ağ yok ya da sunucu yanıt vermiyor: eldeki liste geçerli kalır.
    }
  }

  /// Yeni liste işe yaramadı: bir önceki çalışan sürüme dönülür.
  /// Çağıran, indirmelerin sürekli başarısız olduğunu gördüğünde kullanır.
  static Future<bool> rollback() async {
    final prefs = await SharedPreferences.getInstance();
    final good = prefs.getString(_kLastGood);
    if (good == null) return false;
    await prefs.setString(_kPayload, good);
    await prefs.remove(_kLastGood);
    _loadFrom(good);
    return true;
  }

  static void _loadFrom(String? payload) {
    if (payload == null) return;
    try {
      final m = jsonDecode(payload);
      if (m is! Map) return;
      final list = m['assets'];
      if (list is! List) return;
      version = m['version']?.toString();
      entries = [for (final e in list) ?AssetEntry.from(e)];
    } catch (_) {
      // Bozuk kayıt: liste boş kalır, bir sonraki yenilemede sunucudan gelir.
    }
  }

  /// Önceliğe göre süzülmüş dosya adresleri (indirme sırası için).
  static List<AssetEntry> upTo(int priority) =>
      [for (final e in entries) if (e.priority <= priority) e];
}
