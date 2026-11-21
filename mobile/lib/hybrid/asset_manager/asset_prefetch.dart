import 'dart:async';
import '../../services/api.dart';
import '../../services/media_cache.dart';
import '../feature_flags/feature_flags.dart';
import 'asset_manifest.dart';

/// Varlıkların önceden indirilmesini listeye göre yürütür.
///
/// Eski yol (`MediaCache.warmGifts`) yerinde duruyor ve bayrak kapalıyken **aynen** çalışıyor.
/// Bu, bayrak kuralının gereği: kapatılacak bir şey kalmazsa bayrağın anlamı kalmaz.
class AssetPrefetch {
  AssetPrefetch._();

  static bool _done = false;
  static int _failed = 0;
  static int _tried = 0;

  /// Uygulama açılışında ve Wi-Fi'ye geçildiğinde çağrılır.
  ///
  /// Ölçülü bağlantıda (mobil veri) **hiçbir şey indirilmez**: kullanıcının kotasını önceden
  /// indirmeyle harcamak, en iyi ihtimalle rahatsız edicidir. O dosyalar gerektiğinde iner.
  static Future<void> run({bool force = false}) async {
    if (_done && !force) return;

    // Bayrak kapalı: eski davranış, bit düzeyinde aynı.
    if (!Flags.on('asset_bundles')) {
      await MediaCache.warmGifts(force: force);
      return;
    }

    if (!await MediaCache.unmetered()) return;
    await AssetManifest.refresh();
    if (AssetManifest.entries.isEmpty) {
      // Liste alınamadı: eski yola düş. Varlıksız kalmaktansa eski, kaba yöntem iyidir.
      await MediaCache.warmGifts(force: force);
      return;
    }
    _done = true;

    // Önce odada her an gerekebilecekler (giriş efektleri, ucuz hediyeler), sonra gerisi.
    final urgent = AssetManifest.upTo(1);
    final rest = [for (final e in AssetManifest.entries) if (e.priority > 1) e];
    _pull(urgent, first: true);
    _pull(rest.take(120).toList(), first: false);
  }

  static void _pull(List<AssetEntry> list, {required bool first}) {
    for (final e in list) {
      final url = Api.absoluteUrl(e.url);
      if (url == null || url.isEmpty) continue;
      _tried++;
      unawaited(MediaCache.get(url, expectedBytes: e.bytes).then(
        (_) {},
        onError: (_) => _noteFailure(),
      ));
    }
  }

  /// Yeni liste baştan sona başarısızsa (bozuk yükleme, yanlış CDN adresi) eski sürüme dönülür.
  ///
  /// Eşik bilerek yüksek: tek tük hata normaldir (telefon uykuya geçer, ağ kesilir). Geri alma
  /// yalnızca **listenin kendisi** bozuk olduğunda anlamlı — yani neredeyse hiçbir dosya inmiyorsa.
  static Future<void> _noteFailure() async {
    _failed++;
    if (_tried < 20 || _failed < _tried * 0.9) return;
    if (await AssetManifest.rollback()) {
      _failed = 0;
      _tried = 0;
      _done = false;
    }
  }
}
