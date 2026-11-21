import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tr_live/features/live_rooms/domain/rules/room_format.dart';

void main() {
  group('sayı kısaltma', () {
    test('10.000 altı tam yazılır', () {
      // 2.500 Coin'lik hediyeyi "2,5K" diye göstermek, tam sayıyı görmek isteyen kullanıcıyı
      // rahatsız ediyordu: kısaltma 10.000'den başlar.
      expect(shortAmount('0'), '0');
      expect(shortAmount('999'), '999');
      expect(shortAmount('9999'), '9.999');
    });

    test('binler', () {
      expect(shortAmount('10000'), '10K');
      expect(shortAmount('12500'), '12,5K');
      expect(shortAmount('999999'), '999K');
    });

    test('milyonlar', () {
      expect(shortAmount('1000000'), '1M');
      expect(shortAmount('3400000'), '3,4M');
      // Amiral hediyemiz: 5.000.000 Coin.
      expect(shortAmount('5000000'), '5M');
    });

    test('milyarlar', () {
      expect(shortAmount('1000000000'), '1B');
      expect(shortAmount('2500000000'), '2,5B');
    });

    test('kesir yuvarlanmaz, kırpılır', () {
      // Yukarı yuvarlamak, kullanıcıya elinde olmayan bakiyeyi göstermek olurdu.
      expect(shortAmount('1999999'), '1,9M');
      expect(shortAmount('19999'), '19,9K');
    });

    test('üç haneye ulaşınca kesir düşer (dar ekranda taşmasın)', () {
      expect(shortAmount('120400000'), '120M');
      expect(shortAmount('100000'), '100K');
    });

    test('bozuk girdi sıfır sayılır (ekranda hata yerine 0 görünür)', () {
      expect(shortAmount('abc'), '0');
      expect(shortAmount(''), '0');
    });

    test('çok büyük sayı taşmadan çalışır (BigInt)', () {
      // int ile yazılsaydı bu değer taşar ve eksi bir sayı görünürdü.
      expect(shortAmount('9223372036854775808'), '9223372036B');
    });
  });

  group('ilk harf büyütme', () {
    test('Türkçe i → İ', () {
      // toUpperCase() tek başına "istanbul" → "Istanbul" yapar; doğrusu "İstanbul".
      expect(capitalizeFirst('istanbul'), 'İstanbul');
    });

    test('Türkçe ı → I', () {
      expect(capitalizeFirst('ılık'), 'Ilık');
    });

    test('diğer harfler normal', () {
      expect(capitalizeFirst('merhaba'), 'Merhaba');
      expect(capitalizeFirst('Ali'), 'Ali');
    });

    test('boş metin değişmez', () {
      expect(capitalizeFirst(''), '');
    });

    test('harf olmayan ilk karakter bozulmaz', () {
      expect(capitalizeFirst('1. sıra'), '1. sıra');
    });
  });

  group('balon rengi', () {
    test('seviye arttıkça renk değişir', () {
      final tiers = [1, 10, 20, 30, 45, 60].map(bubbleColorForLevel).toList();
      expect(tiers.toSet().length, 6, reason: 'her kademe ayrı renk olmalı');
    });

    test('bütün renkler şeffaf (oda arka planı görünmeye devam eder)', () {
      // Opak renkler oda temasını örtüyordu.
      for (final lvl in [1, 10, 20, 30, 45, 60, 300]) {
        final a = bubbleColorForLevel(lvl).a;
        expect(a, lessThan(1.0), reason: 'seviye $lvl opak');
      }
    });

    test('kademe sınırları: alt sınır dahil', () {
      expect(bubbleColorForLevel(10), equals(bubbleColorForLevel(19)));
      expect(bubbleColorForLevel(10), isNot(equals(bubbleColorForLevel(9))));
      expect(bubbleColorForLevel(60), equals(bubbleColorForLevel(300)));
    });

    test('seviye okunamazsa en düşük kademe', () {
      expect(bubbleColorOf(null), bubbleColorForLevel(1));
      expect(bubbleColorOf({'coinLevel': null}), bubbleColorForLevel(1));
      expect(bubbleColorOf({}), bubbleColorForLevel(1));
    });

    test('kullanıcıdan seviye okunur', () {
      expect(bubbleColorOf({'coinLevel': 45}), bubbleColorForLevel(45));
    });

    test('renkler sabit (gözle doğrulanmış değerler değişmesin)', () {
      expect(bubbleColorForLevel(60), const Color(0x33F2B92A));
      expect(bubbleColorForLevel(1), const Color(0x30000000));
    });
  });
}
