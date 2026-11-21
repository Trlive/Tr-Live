import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tr_live/services/api.dart';
import 'package:tr_live/services/presence_service.dart';
import 'package:tr_live/widgets/common.dart';

void main() {
  test('fmtNumber binlik ayraç ekler', () {
    expect(fmtNumber('1234567'), '1.234.567');
    expect(fmtNumber(1000), '1.000');
    expect(fmtNumber('-5000'), '-5.000');
    expect(fmtNumber(null), '0');
    expect(fmtNumber('abc'), 'abc');
  });

  test('fmtMoney kuruşu para birimine çevirir', () {
    expect(fmtMoney('5000'), '50,00 USD');
    expect(fmtMoney(123456, 'EUR'), '1.234,56 EUR');
    expect(fmtMoney(null), '0,00 USD');
  });

  // Ludo tahta geometrisi sınavı kaldırıldı: oyun artık uygulamada değil, sunucudan
  // gelen pakette çalışıyor (kullanıcının "oyunlar kodlarda olmayacak" kuralı). Tahtayı
  // çizen taraf sunucu olduğu için konum doğrulaması da orada yapılmalı.
  test('fmtDuration saat ve dakika', () {
    expect(fmtDuration(59), '0 dk');
    expect(fmtDuration(3600 + 5 * 60), '1 sa 5 dk');
  });

  test('parseColor geçerli ve geçersiz', () {
    expect(parseColor('#FFD700'), const Color(0xFFFFD700));
    expect(parseColor('FFD700'), isNull);
    expect(parseColor(null), isNull);
    expect(parseColor('#GGGGGG'), isNull);
  });

  test('listOf / mapOf güvenli dönüşüm', () {
    expect(listOf(null), isEmpty);
    expect(listOf([1, {'a': 1}]), [
      {'a': 1}
    ]);
    expect(mapOf('x'), isNull);
    expect(mapOf({'a': 1}), {'a': 1});
  });

  test('absoluteUrl göreli adresi tamamlar', () {
    expect(Api.absoluteUrl(null), isNull);
    expect(Api.absoluteUrl('https://a.com/x.png'), 'https://a.com/x.png');
    expect(Api.absoluteUrl('/uploads/x.png'), '${Api.baseUrl}/uploads/x.png');
  });

  test('çevrimiçi etiketi', () {
    expect(presenceLabel(null), isNull);
    expect(presenceLabel({'online': true}), 'Çevrimiçi');
    expect(presenceLabel({'online': false, 'lastSeenAt': null}), isNull);
    final t = DateTime.now().subtract(const Duration(minutes: 5)).toUtc().toIso8601String();
    expect(presenceLabel({'online': false, 'lastSeenAt': t}), 'Son görülme 5 dk önce');
  });

  test('token alanları: yanıtta olmayan yenileme token\'ı korunur', () {
    Api.clearTokens();
    Api.setTokens({'token': 'a', 'refreshToken': 'r1', 'expiresIn': 3600});
    expect(Api.token, 'a');
    expect(Api.refreshToken, 'r1');
    expect(Api.tokenExpiresAt!.isAfter(DateTime.now()), isTrue);
    Api.setTokens({'token': 'b', 'expiresIn': 3600});
    expect(Api.token, 'b');
    expect(Api.refreshToken, 'r1');
    Api.setTokens({'token': 'c'});
    expect(Api.tokenExpiresAt, isNull, reason: 'eski tip token: süre bilinmiyor');
    Api.clearTokens();
    expect(Api.token, isNull);
  });
}
