import 'package:flutter_test/flutter_test.dart';
import 'package:tr_live/screens/usd_wallet_screen.dart';

void main() {
  test('Fasulye metni: 1 Fasulye = 100 sent, gereksiz sıfır yazılmaz', () {
    expect(beanText(100), '1');
    expect(beanText('1000'), '10');
    expect(beanText(1250), '12,5');
    expect(beanText(1205), '12,05');
    expect(beanText(5), '0,05');
    expect(beanText(0), '0');
    expect(beanText(null), '0');
    expect(beanText('-250'), '-2,5');
  });

  test('Fasulye tutarı girişi sente çevrilir', () {
    expect(parseUsdCents('12'), 1200);
    expect(parseUsdCents('12,5'), 1250);
    expect(parseUsdCents('12.05'), 1205);
    expect(parseUsdCents(beanText(3750)), 3750);
    expect(parseUsdCents('1.234'), isNull);
    expect(parseUsdCents('abc'), isNull);
  });
}
