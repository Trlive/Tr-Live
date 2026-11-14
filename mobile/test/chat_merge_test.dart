import 'package:flutter_test/flutter_test.dart';
import 'package:tr_live/widgets/chat_merge.dart';

Map<String, dynamic> s(String id) => {'id': id, 'text': id};
Map<String, dynamic> j(String id) => {'id': id, 'join': true};

List<String> ids(List<Map<String, dynamic>> l) => [for (final m in l) '${m['id']}'];

void main() {
  test('yeniden yüklemede "odaya girdi" satırları yerinde kalır', () {
    final current = [j('ben'), s('m1'), j('a'), s('m2'), j('b')];
    final server = [s('m1'), s('m2'), s('m3')];
    expect(ids(mergeChatHistory(current, server)), ['ben', 'm1', 'a', 'm2', 'b', 'm3']);
  });

  test('budanan mesajın ardındaki yerel satır başa geçer', () {
    final current = [s('m1'), j('a'), s('m2'), j('b')];
    final server = [s('m2'), s('m3')];
    expect(ids(mergeChatHistory(current, server)), ['a', 'm2', 'b', 'm3']);
  });

  test('yerel satır yoksa sunucu sırası', () {
    expect(ids(mergeChatHistory([s('m1')], [s('m1'), s('m2')])), ['m1', 'm2']);
    expect(ids(mergeChatHistory([], [s('m1')])), ['m1']);
  });
}
