import 'package:flutter_test/flutter_test.dart';
import 'package:tr_live/hybrid/sdui/v2/registry/source_registry.dart';
import 'package:tr_live/hybrid/sdui/v2/schema/sdui_node.dart';

void main() {
  group('şablon bağlama', () {
    test('alan değeri yerine konur', () {
      expect(bindText('{title}', {'title': 'Merhaba'}), 'Merhaba');
      expect(bindText('{a} — {b}', {'a': 'X', 'b': 'Y'}), 'X — Y');
    });

    test('bilinmeyen alan BOŞ olur, süslü parantez kullanıcıya gösterilmez', () {
      expect(bindText('{yok}', {'title': 'x'}), '');
      expect(bindText('Ön {yok} arka', const {}), 'Ön  arka');
    });

    test('ifade, çağrı ve iç içe erişim BAĞLANMAZ — şablon dili yok', () {
      // Bunların hiçbiri alan adı deseni değil: olduğu gibi kalır, çalıştırılmaz.
      expect(bindText('{a.b}', {'a': {'b': 1}}), '{a.b}');
      expect(bindText('{f()}', const {}), '{f()}');
      expect(bindText('{a ? b : c}', const {}), '{a ? b : c}');
      expect(bindText('{1}', const {}), '{1}');
    });

    test('süslü parantez yoksa metne dokunulmaz', () {
      expect(bindText('düz metin', {'title': 'x'}), 'düz metin');
    });

    test('sayı ve mantıksal değerler metne çevrilir', () {
      expect(bindText('{n}', {'n': 42}), '42');
      expect(bindText('{b}', {'b': true}), '✓');
      expect(bindText('{b}', {'b': false}), '');
    });

    test('null alan boş olur', () {
      expect(bindText('{x}', {'x': null}), '');
    });
  });

  group('veri kaynağı kaydı', () {
    test('yalnızca tanımlı kaynaklar bilinir', () {
      for (final k in ['events', 'inbox', 'relations', 'dealerCatalog']) {
        expect(SduiSources.knows(k), isTrue, reason: k);
      }
      // Şemadan kaldırılanlar uygulamada da olmamalı.
      for (final k in ['faq', 'tasks', 'familyMembers', 'agencyReport', null]) {
        expect(SduiSources.knows(k), isFalse, reason: '$k');
      }
    });

    test('tanınmayan kaynak BOŞ liste döndürür, atmaz', () async {
      expect(await SduiSources.load('boyle-bir-kaynak-yok'), isEmpty);
      expect(await SduiSources.load(null), isEmpty);
    });
  });

  group('düğüm okuma', () {
    test('bozuk çocuk atlanır, kardeşlerini düşürmez', () {
      final n = SduiNode.from({
        'type': 'column',
        'children': [
          {'type': 'title', 'text': 'a'},
          {'bozuk': true},
          'dize',
          {'type': 'title', 'text': 'b'},
        ],
      });
      expect(n, isNotNull);
      expect(n!.children.length, 2);
      expect(n.children[1].str('text'), 'b');
    });

    test('şema sürümü uyuşmazsa ekran çizilmez', () {
      expect(SduiScreenDoc.from({'schemaVersion': 3, 'root': {'type': 'column'}}), isNull);
      expect(SduiScreenDoc.from({'schemaVersion': 2, 'root': {'type': 'column'}}), isNotNull);
    });

    test('okuma yardımcıları atmaz, varsayılana düşer', () {
      final n = SduiNode.from({'type': 'x', 'a': 'metin', 'b': 5})!;
      expect(n.intOf('a'), isNull);
      expect(n.str('b'), isNull);
      expect(n.boolOf('yok'), isFalse);
      expect(n.listOf('yok'), isEmpty);
    });
  });
}
