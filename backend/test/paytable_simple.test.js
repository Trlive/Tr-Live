import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PAY_LEVELS as L, evaluateSimplePay, wholeDollarCents } from '../src/modules/games/paytable.rules.js';

const H = 3600;
const S = { allowBalanceMethod: true, requireGameHours: false, penaltyBps: 5000, instantSalaryBps: 5000 };
// Seviye 1: 200 bin elmas, 22 gün, 80 saat, Maaş 2 = 15$.
const okM = { seconds: 80 * H, validDays: 22, gameSeconds: 0, diamonds: 200_000n, balance: 200_000n };
const ev = (m, extra = {}) => evaluateSimplePay({ levels: L, settings: { ...S, ...extra.settings }, metrics: m, pref: extra.pref ?? 0 });

test('tam dolara aşağı yuvarlama', () => {
  assert.equal(wholeDollarCents(750n), 700n);
  assert.equal(wholeDollarCents(1150n), 1100n);
  assert.equal(wholeDollarCents(1500n), 1500n);
  assert.equal(wholeDollarCents(99n), 0n);
  assert.equal(wholeDollarCents(0n), 0n);
  assert.equal(wholeDollarCents(-5n), 0n);
});

test('tüm şartlar tamamsa maaşın tamamı: 15$', () => {
  const e = ev(okM);
  assert.equal(e.salaryCents, 1500n);
  assert.equal(e.shortfall, false);
  assert.equal(e.level.level, 1);
  assert.equal(e.method, 2);
  assert.equal(e.consume, 200_000n); // kota kadar elmas Fasulyeye çevrilir
  assert.equal(e.blocked, null);
});

test('gün/saat eksikse %50 ama tam dolara aşağı: 7,50$ → 7$', () => {
  const e = ev({ ...okM, seconds: 40 * H, validDays: 10 });
  assert.equal(e.salaryCents, 700n);
  assert.equal(e.shortfall, true);
  assert.deepEqual(e.blockedBy, ['days', 'hours']);
  assert.equal(e.consume, 200_000n);
});

test('yalnızca saat eksik de yeter: biri bile eksikse %50', () => {
  assert.equal(ev({ ...okM, seconds: 79 * H }).salaryCents, 700n);
  assert.equal(ev({ ...okM, validDays: 21 }).salaryCents, 700n);
});

test('elmas bozdurulmuşsa (bakiye kotadan az) şartlar tam olsa bile %50 ve elmas düşülmez', () => {
  const e = ev({ ...okM, balance: 50_000n });
  assert.equal(e.salaryCents, 700n);
  assert.equal(e.method, 1);
  assert.equal(e.consume, 0n);
});

test('"elmaslarım dönüşmesin" (pref 1): elmas düşülmez, bozdurmama şartı sağlanmış sayılmaz → %50', () => {
  const e = ev(okM, { pref: 1 });
  assert.equal(e.salaryCents, 700n);
  assert.equal(e.consume, 0n);
});

test('kota dolmadıysa ödeme yok', () => {
  const e = ev({ ...okM, diamonds: 199_999n });
  assert.equal(e.salaryCents, 0n);
  assert.equal(e.level, null);
  assert.equal(e.next.level, 1);
  assert.equal(e.nextRemaining, 1n);
});

test('oran ayarlanabilir; 0 → eksikse ödeme yok; 10000 → eksik olsa da tam; geçersiz değer 0 sayılır', () => {
  const missing = { ...okM, validDays: 1 };
  assert.equal(ev(missing, { settings: { instantSalaryBps: 0 } }).salaryCents, 0n);
  assert.equal(ev(missing, { settings: { instantSalaryBps: 10000 } }).salaryCents, 1500n);
  assert.equal(ev(missing, { settings: { instantSalaryBps: 'abc' } }).salaryCents, 0n);
  assert.equal(ev(missing, { settings: { instantSalaryBps: 99999 } }).salaryCents, 1500n); // 10000'e kırpılır
});

test('birden çok seviyede kota dolmuşsa en çok ödeyen seçilir (şartı tutan alt seviye, eksik üst seviyenin yarısından yüksekse)', () => {
  const lv = (level, days, hours, diamonds, s2) => ({ level, days, hours, gameHours: 0, diamonds, salary1Cents: s2 / 2n, salary2Cents: s2, agencyCents: 0n });
  const levels = [lv(1, 5, 10, 100n, 1500n), lv(2, 20, 50, 200n, 2200n)];
  const m = { seconds: 10 * H, validDays: 5, gameSeconds: 0, diamonds: 200n, balance: 200n };
  const e = evaluateSimplePay({ levels, settings: S, metrics: m });
  // Seviye 1 tam (15$) > seviye 2 eksik (11$).
  assert.equal(e.level.level, 1);
  assert.equal(e.salaryCents, 1500n);
  assert.equal(e.shortfall, false);
  const levels2 = [lv(1, 5, 10, 100n, 1500n), lv(2, 20, 50, 200n, 4000n)];
  const e2 = evaluateSimplePay({ levels: levels2, settings: S, metrics: m });
  assert.equal(e2.level.level, 2); // 4000'in yarısı 2000 > 1500
  assert.equal(e2.salaryCents, 2000n);
  assert.equal(e2.shortfall, true);
});

test('tek haneli dolar kesri: 23$ seviyede eksik şart → 11$ (11,50$ aşağı)', () => {
  const lv = { level: 1, days: 22, hours: 80, gameHours: 0, diamonds: 100n, salary1Cents: 1500n, salary2Cents: 2300n, agencyCents: 0n };
  const e = evaluateSimplePay({ levels: [lv], settings: S, metrics: { seconds: 0, validDays: 0, gameSeconds: 0, diamonds: 100n, balance: 100n } });
  assert.equal(e.salaryCents, 1100n);
});

test('resmi etkinlik cezası (ayar açıksa) hesaplanan tutarın üstüne biner', () => {
  const e = evaluateSimplePay({ levels: L, settings: { ...S, requireOfficialEvents: true }, eventsOk: false, metrics: okM });
  assert.equal(e.penalty, true);
  assert.equal(e.salaryCents, 750n); // 15$ × %50 ceza
});

// ---- Ay sonu elmas kuralı (monthEndDiamondConvert, v2.152.22) ----
const conv = { settings: { monthEndDiamondConvert: true } };

test('ay sonu kuralı: 290 bin elmas → 1. seviye (200 bin) tam maaş, kota kadar elmas düşülür', () => {
  const e = ev({ ...okM, diamonds: 290_000n, balance: 290_000n }, conv);
  assert.equal(e.level.level, 1);
  assert.equal(e.salaryCents, 1500n);
  assert.equal(e.consume, 200_000n); // kalan 90 bin dönem kapanınca Coin'e çevrilir
});

test('ay sonu kuralı: 199 bin elmas → kota dolmadı, maaş yok', () => {
  const e = ev({ ...okM, diamonds: 199_000n, balance: 199_000n }, conv);
  assert.equal(e.level, null);
  assert.equal(e.salaryCents, 0n);
  assert.equal(e.consume, 0n);
});

test('ay sonu kuralı: kota dolmuş ama elmas bozdurulmuş (bakiye < kota) → maaş YOK (kural kapalıyken %50 idi)', () => {
  const m = { ...okM, diamonds: 250_000n, balance: 150_000n };
  assert.equal(ev(m).salaryCents, 700n, 'eski kural: bozdurma şartı eksik → %50');
  const e = ev(m, conv);
  assert.equal(e.salaryCents, 0n);
  assert.equal(e.consume, 0n);
});

test('ay sonu kuralı: "elmaslarım dönüşmesin" tercihi (pref 1) yok sayılır, elmas düşülerek ödenir', () => {
  const e = ev(okM, { ...conv, pref: 1 });
  assert.equal(e.salaryCents, 1500n);
  assert.equal(e.method, 2);
  assert.equal(e.consume, 200_000n);
});

test('ay sonu kuralı: gün/saat eksikse %50 yine geçerli, kota elması yine düşülür', () => {
  const e = ev({ ...okM, seconds: 40 * H }, conv);
  assert.equal(e.salaryCents, 700n);
  assert.equal(e.consume, 200_000n);
});
