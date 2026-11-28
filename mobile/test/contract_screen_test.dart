import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:tr_live/screens/contract_screen.dart';
import 'package:tr_live/services/api.dart';

void main() {
  final longText = List.generate(200, (i) => 'Madde $i. Sözleşme metni satırı; ğüşıöç.').join('\n');

  testWidgets('sonuna kadar okunmadan onay kutusu ve düğme kapalı; sona gelince açılır', (tester) async {
    final calls = <String>[];
    Api.client = MockClient((req) async {
      calls.add('${req.method} ${req.url.path}');
      return http.Response.bytes(
        utf8.encode(jsonEncode({'kind': 'broadcaster', 'title': 'Yayıncı Sözleşmesi', 'version': '1.0', 'text': longText, 'sha256': 'a' * 64, 'method': 'password', 'phone': null})),
        200,
        headers: {'content-type': 'application/json'},
      );
    });
    await tester.pumpWidget(const MaterialApp(home: ContractScreen(kind: 'broadcaster')));
    await tester.pumpAndSettle();
    expect(calls, contains('GET /api/contracts/broadcaster'));

    CheckboxListTile box() => tester.widget<CheckboxListTile>(find.byType(CheckboxListTile));
    FilledButton button() => tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Şifremle onayla'));
    expect(box().onChanged, isNull, reason: 'okunmadan işaretlenemez');
    expect(button().onPressed, isNull);
    expect(find.text('Onaylamak için metni sonuna kadar okuyun.'), findsOneWidget);

    await tester.drag(find.byType(SingleChildScrollView), const Offset(0, -100000));
    await tester.pumpAndSettle();
    expect(box().onChanged, isNotNull, reason: 'sona gelince işaretlenebilir');
    expect(button().onPressed, isNull, reason: 'kutu işaretlenmeden düğme kapalı');

    await tester.tap(find.byType(CheckboxListTile));
    await tester.pumpAndSettle();
    expect(button().onPressed, isNotNull);
  });

  testWidgets('kısa metin ekrana sığarsa kaydırma gerekmez', (tester) async {
    Api.client = MockClient((req) async => http.Response.bytes(
          utf8.encode(jsonEncode({'kind': 'dealer', 'title': 'Bayilik', 'version': '1.0', 'text': 'Kısa metin.', 'sha256': 'b' * 64, 'method': 'sms', 'phone': '+905551112233', 'phoneMasked': '+905••••33'})),
          200,
          headers: {'content-type': 'application/json'},
        ));
    await tester.pumpWidget(const MaterialApp(home: ContractScreen(kind: 'dealer')));
    await tester.pumpAndSettle();
    expect(tester.widget<CheckboxListTile>(find.byType(CheckboxListTile)).onChanged, isNotNull);
    expect(find.text('SMS koduyla onayla'), findsOneWidget);
  });
}
