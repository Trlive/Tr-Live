import test from 'node:test';
import assert from 'node:assert/strict';

delete process.env.DATABASE_URL;
const { requirePackage, assertReviewable, packageView, DEALER_TOPUP_PACKAGES } = await import('../src/modules/dealers/dealer_topup.service.js');

test('requirePackage geçerli kodu döndürür, geçersizi reddeder', () => {
  const p = requirePackage('D_100K');
  assert.equal(p.coins, 100_000n);
  assert.throws(() => requirePackage('YOK'), /Geçersiz paket/);
  assert.throws(() => requirePackage(''), /Geçersiz paket/);
});

test('assertReviewable yalnızca pending talebe izin verir', () => {
  assert.doesNotThrow(() => assertReviewable('pending'));
  assert.throws(() => assertReviewable('approved'), /sonuçlandırılmış/);
  assert.throws(() => assertReviewable('rejected'), /sonuçlandırılmış/);
});

test('packageView indirim yüzdesini doğru hesaplar ve coins string döner', () => {
  const v = packageView({ code: 'X', coins: 100_000n, priceTry: 850, listTry: 1000, label: '100.000 Coin' });
  assert.equal(v.discountPct, 15);
  assert.equal(v.coins, '100000');
});

test('tüm paketlerde avantaj (indirim > 0) ve pozitif coin vardır', () => {
  for (const p of DEALER_TOPUP_PACKAGES) {
    assert.ok(p.coins > 0n, `${p.code} coin pozitif`);
    assert.ok(p.priceTry < p.listTry, `${p.code} toptan fiyat listeden düşük`);
  }
});
