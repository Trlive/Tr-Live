import 'package:flutter/painting.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tr_live/services/fx_load.dart';

void main() {
  setUp(FxLoad.debugReset);

  test('telefon belleğine göre sınıf ve sınırlar', () {
    FxLoad.debugSetTotalMb(2800);
    expect(FxLoad.tier, 0);
    expect(FxLoad.maxMp4, 2);
    expect(FxLoad.maxSeatFx, 3);
    FxLoad.debugSetTotalMb(5600);
    expect(FxLoad.tier, 1);
    FxLoad.debugSetTotalMb(11000);
    expect(FxLoad.tier, 2);
    expect(FxLoad.maxFlights, greaterThan(14));
    FxLoad.debugSetTotalMb(0);
    expect(FxLoad.tier, 1, reason: 'bilinmiyorsa orta sınıf');
    expect(FxLoad.rssLimitMb, 1200);
    FxLoad.debugSetTotalMb(1500);
    expect(FxLoad.rssLimitMb, 650, reason: 'alt sınır');
    FxLoad.debugSetTotalMb(12000);
    expect(FxLoad.rssLimitMb, 1700, reason: 'üst sınır');
  });

  test('MP4 çözücü sayısı sınırlı; koltuk efekti tam ekrana bir yer bırakır', () {
    FxLoad.debugSetTotalMb(5600); // orta: 3 tek seferlik
    expect(FxLoad.acquireMp4(loop: false, low: true), isTrue);
    expect(FxLoad.acquireMp4(loop: false, low: true), isTrue);
    expect(FxLoad.acquireMp4(loop: false, low: true), isFalse, reason: 'son yer tam ekran hediyenin');
    expect(FxLoad.mp4Available(), isTrue);
    expect(FxLoad.acquireMp4(loop: false), isTrue);
    expect(FxLoad.acquireMp4(loop: false), isFalse);
    expect(FxLoad.mp4Available(), isFalse);
    FxLoad.releaseMp4(loop: false);
    expect(FxLoad.mp4Available(), isTrue);
    // Döngülü (çerçeve) ayrı sayılır.
    for (var i = 0; i < FxLoad.maxMp4Loop; i++) {
      expect(FxLoad.acquireMp4(loop: true), isTrue);
    }
    expect(FxLoad.acquireMp4(loop: true), isFalse);
    // Fazla bırakma sayacı eksiye düşürmez.
    for (var i = 0; i < 20; i++) {
      FxLoad.releaseMp4(loop: false);
    }
    expect(FxLoad.acquireMp4(loop: false), isTrue);
  });

  test('aynı anda en çok iki hediye sesi', () {
    expect(FxLoad.acquireSound(), isTrue);
    expect(FxLoad.acquireSound(), isTrue);
    expect(FxLoad.acquireSound(), isFalse);
    FxLoad.releaseSound();
    expect(FxLoad.acquireSound(), isTrue);
  });

  test('resim önbelleği sınırı cihaz sınıfına göre', () {
    TestWidgetsFlutterBinding.ensureInitialized();
    FxLoad.debugSetTotalMb(2900); // düşük
    FxLoad.applyImageCacheLimit();
    expect(PaintingBinding.instance.imageCache.maximumSizeBytes, 48 * 1024 * 1024);
    FxLoad.debugSetTotalMb(8000); // yüksek
    FxLoad.applyImageCacheLimit();
    expect(PaintingBinding.instance.imageCache.maximumSizeBytes, 160 * 1024 * 1024);
    FxLoad.debugSetTotalMb(0); // bilinmiyor → orta = Flutter varsayılanı
    FxLoad.applyImageCacheLimit();
    expect(PaintingBinding.instance.imageCache.maximumSizeBytes, 100 * 1024 * 1024);
  });
}
