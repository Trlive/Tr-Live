/// Oda ekranının biçimlendirme kuralları — saf mantık.
///
/// `_RoomScreenState` içinden çıkarıldı: hiçbiri örnek durumuna dokunmuyordu, yalnızca orada
/// durdukları için test edilemiyorlardı.
library;

import 'package:flutter/material.dart';
import '../../../../widgets/common.dart';

/// Büyük sayıyı kısaltır: 12.500 → "12,5K", 3.400.000 → "3,4M", 5.000.000 → "5M".
///
/// Binlik kısaltma **10.000'den** başlar, 1.000'den değil: 2.500 Coin'lik bir hediyeyi "2,5K"
/// diye göstermek, tam sayıyı görmek isteyen kullanıcıyı rahatsız ediyordu. 10.000 altındaki
/// değerler nokta ayracıyla tam yazılır.
///
/// Kesir **yuvarlanmaz, kırpılır**: 1.999.999 → "1,9M". Yukarı yuvarlamak kullanıcıya elinde
/// olmayan bakiyeyi göstermek olurdu.
///
/// Üç haneye ulaşan değerlerde kesir düşer (120,4M yerine "120M"): dar ekranda taşmasın.
String shortAmount(String v) {
  final n = BigInt.tryParse(v) ?? BigInt.zero;
  String f(BigInt x, int d, String u) {
    final whole = x ~/ BigInt.from(d);
    final frac = (x % BigInt.from(d)) * BigInt.from(10) ~/ BigInt.from(d);
    return whole >= BigInt.from(100) || frac == BigInt.zero ? '$whole$u' : '$whole,$frac$u';
  }

  if (n >= BigInt.from(1000000000)) return f(n, 1000000000, 'B');
  if (n >= BigInt.from(1000000)) return f(n, 1000000, 'M');
  if (n >= BigInt.from(10000)) return f(n, 1000, 'K');
  return fmtNumber(n.toString());
}

/// İlk harfi büyütür.
///
/// Türkçe'ye özel: `i` → `İ`, `ı` → `I`. `toUpperCase()` tek başına `i`'yi `I` yapar ve
/// "istanbul" → "Istanbul" olur; doğrusu "İstanbul".
String capitalizeFirst(String t) {
  if (t.isEmpty) return t;
  final f = t[0];
  final up = f == 'i' ? 'İ' : f == 'ı' ? 'I' : f.toUpperCase();
  return up + t.substring(1);
}

/// Sohbet balonunun arka plan rengi — seviyeye göre.
///
/// Renkler **şeffaf**: oda arka planı balonun altından görünmeye devam eder, seviye yalnızca
/// hafif bir ton verir. Opak renkler oda temasını örtüyordu.
Color bubbleColorForLevel(int level) {
  if (level >= 60) return const Color(0x33F2B92A); // altın
  if (level >= 45) return const Color(0x33BE185D);
  if (level >= 30) return const Color(0x336D28D9);
  if (level >= 20) return const Color(0x331D4ED8);
  if (level >= 10) return const Color(0x330F766E);
  return const Color(0x30000000);
}

/// Kullanıcı nesnesinden balon rengi. Seviye okunamazsa 1 kabul edilir (en düşük ton).
Color bubbleColorOf(Map<String, dynamic>? user) =>
    bubbleColorForLevel((user?['coinLevel'] as num?)?.toInt() ?? 1);
