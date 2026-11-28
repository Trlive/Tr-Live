import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceDue, netOfAdvance, MIN_ADVANCE_CENTS } from '../src/modules/wallet/instant_salary.rules.js';
import { DEFAULT_PAY_LEVELS as L, evaluateSimplePay } from '../src/modules/games/paytable.rules.js';

test('bu turda ödenecek: hedef − daha önce ödenen; 1$ altı yazılmaz', () => {
  assert.equal(MIN_ADVANCE_CENTS, 100n);
  assert.equal(advanceDue({ targetCents: 700n, alreadyCents: 0n }), 700n);
  assert.equal(advanceDue({ targetCents: 700n, alreadyCents: 700n }), 0n); // aynı şey iki kez ödenmez
  assert.equal(advanceDue({ targetCents: 750n, alreadyCents: 700n }), 0n); // fark 0,50$ < 1$
  assert.equal(advanceDue({ targetCents: 1500n, alreadyCents: 700n }), 800n); // şartlar tamamlanınca fark (0,50$ dahil)
  assert.equal(advanceDue({ targetCents: 500n, alreadyCents: 700n }), 0n); // hedef düşse bile geri alınmaz
  assert.equal(advanceDue({ targetCents: -5n, alreadyCents: 0n }), 0n);
});

test('dönem kapanışı: kalan = hak ediş − avans; negatife düşmez', () => {
  assert.equal(netOfAdvance({ entitledCents: 1500n, advanceCents: 700n }), 800n);
  assert.equal(netOfAdvance({ entitledCents: 1500n, advanceCents: undefined }), 1500n); // avans yoksa değişmez
  assert.equal(netOfAdvance({ entitledCents: 1500n, advanceCents: 1500n }), 0n);
  assert.equal(netOfAdvance({ entitledCents: 700n, advanceCents: 1000n }), 0n); // fazla ödeme geri alınmaz, eksiye düşmez
});

const H = 3600;
const S = { allowBalanceMethod: true, requireGameHours: false, penaltyBps: 5000, instantSalaryBps: 5000 };
const at = (m) => evaluateSimplePay({ levels: L, settings: S, metrics: m }).salaryCents;

test('uçtan uca: 200 bin kota → önce 7$, gün/saat tamamlanınca kalan 8$ (toplam 15$), ay sonu kalan 0', () => {
  // Gün 10: kota doldu, elmas bozdurulmadı, gün/saat eksik → %50 = 7,50$ → tam dolara 7$.
  const t1 = at({ seconds: 30 * H, validDays: 8, gameSeconds: 0, diamonds: 200_000n, balance: 200_000n });
  const a1 = advanceDue({ targetCents: t1, alreadyCents: 0n });
  assert.equal(a1, 700n);
  // Kota kadar elmas Fasulyeye çevrildi; değerlendirme etkin bakiyeyi (bakiye + düşülen) kullanır: şart bozulmaz.
  // Ay sonuna doğru gün/saat tamamlandı → tam maaş 15$; fark 8$ (yuvarlamadan kalan 0,50$ dahil).
  const t2 = at({ seconds: 80 * H, validDays: 22, gameSeconds: 0, diamonds: 200_000n, balance: 0n + 200_000n });
  const a2 = advanceDue({ targetCents: t2, alreadyCents: a1 });
  assert.equal(a2, 800n);
  assert.equal(a1 + a2, 1500n);
  // Dönem kapanışı: hak ediş 15$, avanslar 15$ → yatırılacak kalan 0.
  assert.equal(netOfAdvance({ entitledCents: t2, advanceCents: a1 + a2 }), 0n);
});

test('şartlar hiç tamamlanmazsa 7$ kalır, ay sonunda kesir yatmaz', () => {
  const m = { seconds: 30 * H, validDays: 8, gameSeconds: 0, diamonds: 200_000n, balance: 200_000n };
  const a1 = advanceDue({ targetCents: at(m), alreadyCents: 0n });
  assert.equal(a1, 700n);
  assert.equal(netOfAdvance({ entitledCents: at(m), advanceCents: a1 }), 0n); // ay sonunda ek ödeme yok
});

test('şartlar kota dolduğu anda tamamsa 15$ tek seferde yatar', () => {
  const t = at({ seconds: 80 * H, validDays: 22, gameSeconds: 0, diamonds: 200_000n, balance: 200_000n });
  assert.equal(advanceDue({ targetCents: t, alreadyCents: 0n }), 1500n);
});

test('seviye atlayınca yalnızca fark yatar', () => {
  // Seviye 2 (300 bin): Maaş 2 = 23$. Önce seviye 1 tam (15$), sonra seviye 2 tam (23$) → 8$ fark.
  const m2 = { seconds: 80 * H, validDays: 22, gameSeconds: 0, diamonds: 300_000n, balance: 300_000n };
  const t2 = at(m2);
  assert.equal(t2, 2300n);
  assert.equal(advanceDue({ targetCents: t2, alreadyCents: 1500n }), 800n);
});
