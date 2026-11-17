import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/painting.dart';
import 'package:flutter/widgets.dart' show WidgetsBinding, WidgetsBindingObserver;

/// Efekt yük koruması: hediye yağmurunda telefonun belleği ve video çözücüleri tükenmesin diye aynı anda oynayan
/// efekt sayısını ve bellek kullanımını sınırlar. Sınırlar telefonun belleğine göre seçilir (düşük / orta / yüksek).
///
/// Kurallar:
///  * MP4 (şeffaf video) hediyeler telefonun donanım video çözücüsünü kullanır; çözücü sayısı sınırlıdır ve aşılırsa
///    uygulama çökebilir. Aynı anda en çok [maxMp4] tek seferlik ve [maxMp4Loop] döngülü MP4 oynar; fazlası oynatılmaz.
///  * Aynı anda en çok [maxSounds] hediye sesi çalar.
///  * Sistem "bellek azaldı" derse ya da uygulamanın belleği sınırı aşarsa süslemeler [cooling] süresince durur ve
///    önbellekler boşaltılır (ses ve sohbet etkilenmez).
class FxLoad {
  FxLoad._();

  static int _totalMb = 0; // 0: bilinmiyor (orta sınıf varsayılır)
  static bool _probed = false;

  /// Telefonun toplam belleğini bir kez okur (Android: /proc/meminfo). Okunamazsa orta sınıf varsayılır.
  static Future<void> probe() async {
    if (_probed) return;
    _probed = true;
    try {
      if (!Platform.isAndroid && !Platform.isLinux) return;
      final text = await File('/proc/meminfo').readAsString();
      final m = RegExp(r'MemTotal:\s+(\d+)\s*kB').firstMatch(text);
      if (m != null) _totalMb = int.parse(m.group(1)!) ~/ 1024;
    } catch (_) {/* okunamadı: varsayılan sınıf */}
  }

  /// Testler için: toplam belleği (MB) elle verir.
  @visibleForTesting
  static void debugSetTotalMb(int mb) {
    _totalMb = mb;
    _probed = true;
  }

  /// 0: düşük (≤3 GB), 1: orta (≤6 GB ya da bilinmiyor), 2: yüksek.
  static int get tier => _totalMb == 0 ? 1 : (_totalMb <= 3300 ? 0 : (_totalMb <= 6600 ? 1 : 2));

  static T _pick<T>(T low, T mid, T high) => tier == 0 ? low : (tier == 1 ? mid : high);

  /// Aynı anda oynayabilecek tek seferlik MP4 (tam ekran hediye + koltuk efektleri).
  static int get maxMp4 => _pick(2, 3, 4);

  /// Aynı anda oynayabilecek döngülü MP4 (çerçeve vb.).
  static int get maxMp4Loop => _pick(3, 5, 8);

  /// Aynı anda oynayabilecek koltuk içi hediye animasyonu.
  static int get maxSeatFx => _pick(3, 5, 8);

  /// Aynı anda ekranda uçabilecek hediye ikonu.
  static int get maxFlights => _pick(8, 14, 22);

  /// Tek bir SVGA animasyonunun açılmış görselleri için bellek bütçesi (bayt). Aşan dosya küçültülerek açılır.
  static int get svgaBudgetBytes => _pick(40, 80, 140) * 1024 * 1024;

  /// SVGA görsellerinde tek kenar üst sınırı (piksel).
  static int get svgaMaxSide => _pick(720, 1080, 1440);

  /// Kullanılmayan (az önce oynamış) SVGA'ların bellekte bekletilen toplamı (bayt).
  static int get svgaIdleBytes => _pick(12, 32, 64) * 1024 * 1024;

  static const int maxSounds = 2;

  static int _mp4 = 0;
  static int _mp4Loop = 0;
  static int _sounds = 0;

  /// [low] true: ikincil efekt (koltuk içi). Çözücülerden biri her zaman tam ekran hediyeye ayrılır.
  static bool acquireMp4({required bool loop, bool low = false}) {
    if (loop) {
      if (_mp4Loop >= maxMp4Loop) return false;
      _mp4Loop++;
      return true;
    }
    if (_mp4 >= (low ? maxMp4 - 1 : maxMp4)) return false;
    _mp4++;
    return true;
  }

  /// Yeni bir tek seferlik MP4 için yer var mı (yer ayırmadan bakar).
  static bool mp4Available({bool low = false}) => _mp4 < (low ? maxMp4 - 1 : maxMp4);

  static void releaseMp4({required bool loop}) {
    if (loop) {
      if (_mp4Loop > 0) _mp4Loop--;
    } else if (_mp4 > 0) {
      _mp4--;
    }
  }

  static bool acquireSound() {
    if (_sounds >= maxSounds) return false;
    _sounds++;
    return true;
  }

  static void releaseSound() {
    if (_sounds > 0) _sounds--;
  }

  @visibleForTesting
  static void debugReset() {
    _mp4 = 0;
    _mp4Loop = 0;
    _sounds = 0;
    _coolUntil = DateTime(2000);
    _rssAt = DateTime(2000);
    _tight = false;
  }

  // ---- bellek baskısı ----
  static DateTime _coolUntil = DateTime(2000);

  /// Bellek baskısı sayacı: artınca ekrandaki süslemeler kendini kaldırır (dinleyenler için).
  static final ValueNotifier<int> pressure = ValueNotifier<int>(0);

  /// Boşaltılacak ek önbellekler (ör. SVGA): bağımlılık oluşmasın diye buraya kaydolurlar.
  static final List<VoidCallback> _purgers = [];
  static void addPurger(VoidCallback f) {
    if (!_purgers.contains(f)) _purgers.add(f);
  }

  /// true iken yeni süsleme (uçan ikon, koltuk efekti, tam ekran animasyon) başlatılmaz.
  static bool get cooling => DateTime.now().isBefore(_coolUntil);

  /// Sistem "bellek azaldı" dedi ya da bellek sınırı aşıldı: önbellekler boşaltılır, süslemeler kısa süre durur.
  static void memoryPressure({Duration pause = const Duration(seconds: 12)}) {
    final until = DateTime.now().add(pause);
    if (until.isAfter(_coolUntil)) _coolUntil = until;
    try {
      PaintingBinding.instance.imageCache.clear();
      PaintingBinding.instance.imageCache.clearLiveImages();
    } catch (_) {/* henüz kurulmadıysa yoksay */}
    for (final f in List<VoidCallback>.of(_purgers)) {
      try {
        f();
      } catch (_) {/* yoksay */}
    }
    pressure.value++;
  }

  static DateTime _rssAt = DateTime(2000);
  static bool _tight = false;

  /// Uygulamanın kullandığı bellek sınırı (MB): toplam belleğin ~%38'i, 650–1700 MB arasında.
  static int get rssLimitMb {
    if (_totalMb == 0) return 1200;
    final v = (_totalMb * 0.38).round();
    return v < 650 ? 650 : (v > 1700 ? 1700 : v);
  }

  /// Uygulamanın belleği sınırı aştı mı (yarım saniyede bir ölçülür). Aştıysa önbellekler boşaltılır.
  static bool get memoryTight {
    final now = DateTime.now();
    if (now.difference(_rssAt) < const Duration(milliseconds: 500)) return _tight;
    _rssAt = now;
    try {
      final tight = ProcessInfo.currentRss ~/ (1024 * 1024) > rssLimitMb;
      if (tight && !_tight) memoryPressure(pause: const Duration(seconds: 6));
      _tight = tight;
    } catch (_) {
      _tight = false;
    }
    return _tight;
  }

  /// Yeni bir süsleme başlatılabilir mi.
  static bool get canDecorate => !cooling && !memoryTight;

  static bool _installed = false;

  /// Sistemin "bellek azaldı" bildirimini dinlemeye başlar ve telefonun belleğini okur (uygulama açılışında bir kez).
  static void install() {
    if (_installed) return;
    _installed = true;
    probe();
    WidgetsBinding.instance.addObserver(_MemoryWatch());
  }
}

class _MemoryWatch with WidgetsBindingObserver {
  @override
  void didHaveMemoryPressure() => FxLoad.memoryPressure();
}
