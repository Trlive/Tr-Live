import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  newOrderNo, ORDER_NO_RE, tryToKurus, kurusToTry, microToUsdt, usdtAmountMicro, tierFor, nextTier, quoteBonus, MAX_BONUS_BPS,
  toScaled4, fromScaled4, costOut, profitSummary, paytrToken, paytrCallbackValid, parseTrc20Incoming, USDT_TRC20_CONTRACT,
} from '../src/modules/payments/payments.rules.js';

test('sipariş no: TR + 16 karakter, benzersiz', () => {
  const s = new Set();
  for (let i = 0; i < 2000; i++) { const n = newOrderNo(); assert.match(n, ORDER_NO_RE); s.add(n); }
  assert.equal(s.size, 2000);
});

test('TL ↔ kuruş', () => {
  assert.equal(tryToKurus('2500'), 250000n);
  assert.equal(tryToKurus('2500.5'), 250050n);
  assert.equal(tryToKurus('2500.00'), 250000n);
  assert.equal(tryToKurus('0.015'), 2n, 'kuruştan küçük kısım yukarı');
  assert.equal(tryToKurus('12.3400'), 1234n);
  assert.throws(() => tryToKurus('-5'));
  assert.throws(() => tryToKurus('1,5'));
  assert.equal(kurusToTry(250050n), '2500.50');
  assert.equal(microToUsdt(59523810n), '59.523810');
});

test('USDT tutarı: yukarı yuvarlanır + benzersiz ek', () => {
  // 2500 TL, kur 42,00 → 59,5238… → 59,53 USDT; ek 7 → 59,530007
  assert.equal(usdtAmountMicro(250000n, 4200n, 7), 59_530_007n);
  assert.equal(usdtAmountMicro(420000n, 4200n, 1), 100_000_001n, 'tam bölünen tutar yuvarlanmaz');
  assert.throws(() => usdtAmountMicro(1n, 0n, 1));
  assert.throws(() => usdtAmountMicro(1n, 4200n, 0));
  assert.throws(() => usdtAmountMicro(1n, 4200n, 10000));
});

const T = [{ name: 'Bronz', minKurus: 0n, bonusBps: 0 }, { name: 'Gümüş', minKurus: 10_000_000n, bonusBps: 200 }, { name: 'Altın', minKurus: 50_000_000n, bonusBps: 400 }];
test('kademe: eşiği geçen en yüksek; sonraki kademe', () => {
  assert.equal(tierFor(T, 0n).name, 'Bronz');
  assert.equal(tierFor(T, 9_999_999n).name, 'Bronz');
  assert.equal(tierFor(T, 10_000_000n).name, 'Gümüş');
  assert.equal(tierFor([...T].reverse(), 60_000_000n).name, 'Altın', 'sıra fark etmez');
  assert.equal(nextTier(T, 10_000_000n).name, 'Altın');
  assert.equal(nextTier(T, 99_000_000n), null);
  assert.equal(tierFor(T.slice(1), 5n), null);
});

test('bonus: paket + kademe + kampanya; üst sınır', () => {
  const q = quoteBonus({ coins: 4_800_000n, packageBonus: 100_000n, tierBps: 200, campaignBps: 500 });
  assert.equal(q.bonus, 100_000n + 96_000n + 240_000n);
  assert.deepEqual([q.detail.tier, q.detail.campaign], ['96000', '240000']);
  const cap = quoteBonus({ coins: 10_000n, tierBps: 5000, campaignBps: 5000 });
  assert.equal(cap.bonus, (10_000n * BigInt(MAX_BONUS_BPS)) / 10000n, 'toplam oran sınırı');
  assert.equal(quoteBonus({ coins: 999n, tierBps: -50 }).bonus, 0n, 'eksi oran yok');
});

test('stok maliyeti: ağırlıklı ortalama, yuvarlama artığı stokta kalmaz', () => {
  assert.equal(toScaled4('2500.00'), 25_000_000n);
  assert.equal(toScaled4('0.5'), 5000n);
  assert.equal(fromScaled4(25_000_000n), '2500.0000');
  assert.equal(fromScaled4(-5n), '-0.0005');
  // 480.000 Coin 2500 TL'ye alındı; 120.000 satıldı → 625 TL maliyet.
  assert.equal(fromScaled4(costOut(toScaled4('2500'), 480000n, 120000n)), '625.0000');
  // Bonusla stok 500.000 Coin, maliyet 2500 → 100.000 satışın maliyeti 500.
  assert.equal(fromScaled4(costOut(toScaled4('2500'), 500000n, 100000n)), '500.0000');
  // Son Coin: kalan maliyetin tamamı.
  assert.equal(costOut(10_003n, 3n, 3n), 10_003n);
  assert.equal(costOut(0n, 10n, 5n), 0n);
  assert.equal(costOut(100n, 0n, 5n), 0n);
  // Üç parçada satış: toplam maliyet = başlangıç maliyeti (kayıp/fazla yok).
  let cost = toScaled4('1000'); let bal = 7n; let sum = 0n;
  for (const part of [2n, 2n, 3n]) { const c = costOut(cost, bal, part); sum += c; cost -= c; bal -= part; }
  assert.equal(sum, toScaled4('1000')); assert.equal(cost, 0n);
});

test('kâr özeti ve marj', () => {
  const p = profitSummary({ revenue4: toScaled4('1000'), cogs4: toScaled4('625') });
  assert.deepEqual(p, { revenue: '1000.0000', cogs: '625.0000', profit: '375.0000', marginBps: 3750 });
  assert.equal(profitSummary({ revenue4: 0n, cogs4: 0n }).marginBps, null);
});

test('PayTR: token ve geri çağrı imzası (belgedeki formül)', () => {
  const k = { merchantKey: 'KEY123', merchantSalt: 'SALT456' };
  const tok = paytrToken({ merchantId: '1', merchantKey: k.merchantKey, merchantSalt: k.merchantSalt, userIp: '1.2.3.4', merchantOid: 'TRABC', email: 'a@b.co',
    paymentAmount: '250000', userBasket: 'W10=', noInstallment: '1', maxInstallment: '0', currency: 'TL', testMode: '1' });
  const exp = crypto.createHmac('sha256', 'KEY123').update('11.2.3.4TRABCa@b.co250000W10=10TL1SALT456').digest('base64');
  assert.equal(tok, exp);
  const hash = crypto.createHmac('sha256', 'KEY123').update('TRABCSALT456success250000').digest('base64');
  assert.equal(paytrCallbackValid(k, { merchant_oid: 'TRABC', status: 'success', total_amount: '250000', hash }), true);
  assert.equal(paytrCallbackValid(k, { merchant_oid: 'TRABC', status: 'success', total_amount: '250001', hash }), false, 'tutar değişirse imza tutmaz');
  assert.equal(paytrCallbackValid(k, { merchant_oid: 'TRABC', status: 'success', total_amount: '250000', hash: 'x' }), false);
  assert.equal(paytrCallbackValid(k, {}), false);
});

test('TRC20: yalnızca bizim adrese gelen resmi USDT', () => {
  const addr = 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE';
  const tx = (o) => ({ transaction_id: 'ab'.repeat(32), from: 'TX', to: addr, value: '59530007', block_timestamp: 1_800_000_000_000,
    token_info: { address: USDT_TRC20_CONTRACT, decimals: 6 }, ...o });
  const out = parseTrc20Incoming({ data: [
    tx(),
    tx({ to: 'TOTHER' }),
    tx({ token_info: { address: 'TFAKE', decimals: 6 } }),
    tx({ value: '1.5' }),
    tx({ transaction_id: 'zz' }),
    tx({ token_info: { address: USDT_TRC20_CONTRACT, decimals: 18 } }),
  ] }, addr);
  assert.equal(out.length, 1);
  assert.equal(out[0].micro, 59_530_007n);
  assert.equal(out[0].txid, 'ab'.repeat(32));
  assert.deepEqual(parseTrc20Incoming(null, addr), []);
});
