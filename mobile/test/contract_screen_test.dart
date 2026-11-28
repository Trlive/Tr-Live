import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:tr_live/screens/contract_screen.dart';
import 'package:tr_live/services/api.dart';

http.Response _json(Object o, [int code = 200]) => http.Response.bytes(utf8.encode(jsonEncode(o)), code, headers: {'content-type': 'application/json'});

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  final view = {'kind': 'dealer', 'title': 'Coin Bayilik Sözleşmesi', 'version': '1.0', 'text': '## MADDE 1\nMetin; ğüşıöç.', 'sha256': 'a' * 64, 'method': 'clickwrap'};

  testWidgets('tek dokunuşla kabul: gösterilen metnin özeti gönderilir, ekran kapanır', (tester) async {
    Map<String, dynamic>? sent;
    Api.client = MockClient((req) async {
      if (req.method == 'POST') {
        sent = jsonDecode(req.body) as Map<String, dynamic>;
        expect(req.url.path, '/api/contracts/dealer/accept');
        return _json({'ok': true, 'contractNo': 'BAY-000001', 'already': false}, 201);
      }
      return _json(view);
    });
    bool? result;
    await tester.pumpWidget(MaterialApp(home: Builder(builder: (c) => TextButton(onPressed: () async => result = await openContract(c, 'dealer'), child: const Text('aç')))));
    await tester.tap(find.text('aç'));
    await tester.pumpAndSettle();
    expect(find.text('MADDE 1'), findsOneWidget, reason: 'markdown başlığı düz metin');
    await tester.tap(find.text('Okudum, kabul ediyorum'));
    // Kabul, cihaz bilgisini (yerel depo, telefon kanalları) toplar: gerçek zamanlı çalışsın diye runAsync. Bildirim kendi
    // zamanlayıcısıyla canlandığı için pumpAndSettle bitmez: sabit adımlarla ilerletilir.
    for (var i = 0; i < 40 && result == null; i++) {
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(sent?['sha256'], 'a' * 64);
    expect(result, isTrue);
    await tester.pump(const Duration(seconds: 6)); // bildirimin kapanma zamanlayıcısı bitsin
  });

  testWidgets('salt okunur mod: kabul düğmesi yok', (tester) async {
    Api.client = MockClient((req) async => _json(view));
    await tester.pumpWidget(const MaterialApp(home: ContractScreen(kind: 'broadcaster', readOnly: true)));
    await tester.pumpAndSettle();
    expect(find.text('Okudum, kabul ediyorum'), findsNothing);
  });
}
