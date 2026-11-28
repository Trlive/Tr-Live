import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PAY_LEVELS as L, evaluatePay, evaluateVideoPay } from '../src/modules/games/paytable.rules.js';

const H = 3600;
const S = { allowBalanceMethod: true, requireGameHours: false, penaltyBps: 5000 };
// Seviye 1: 200 bin elmas, 22 gün, 80 saat: Maaş 1 = 10$, Maaş 2 = 15$.
const short = { seconds: 40 * H, validDays: 10, gameSeconds: 0, diamonds: 200_000n, balance: 200_000n }; // kota tamam, gün/saat eksik
const full = { seconds: 80 * H, validDays: 22, gameSeconds: 0, diamonds: 200_000n, balance: 200_000n };

test('kesinti kapalıyken (0) gün/saat eksikse eski davranış: seviye sayılmaz, maaş yok', () => {
  const e = evaluatePay({ levels: L, settings: S, metrics: short });
  assert.equal(e.salaryCents, 0n);
  assert.equal(e.level, null);
  assert.equal(e.shortfall, false);
});

test('%40 kesinti: kota tamam, gün/saat eksik → Yöntem 2 maaşının %60\'ı (15$ → 9$), elmas kotası düşülür', () => {
  const e = evaluatePay({ levels: L, settings: { ...S, audioShortfallCutBps: 4000 }, metrics: short });
  assert.equal(e.salaryCents, 900n);
  assert.equal(e.method, 2);
  assert.equal(e.shortfall, true);
  assert.equal(e.level.level, 1);
  assert.equal(e.consume, 200_000n);
});

test('şartlar tamamsa kesinti uygulanmaz: tam 15$', () => {
  const e = evaluatePay({ levels: L, settings: { ...S, audioShortfallCutBps: 4000 }, metrics: full });
  assert.equal(e.salaryCents, 1500n);
  assert.equal(e.shortfall, false);
});

test('gelir bozulmuş (bakiye yok) ve gün/saat eksik: Yöntem 1 maaşının %60\'ı (10$ → 6$), elmas düşülmez', () => {
  const e = evaluatePay({ levels: L, settings: { ...S, audioShortfallCutBps: 4000 }, metrics: { ...short, balance: 0n } });
  assert.equal(e.salaryCents, 600n);
  assert.equal(e.method, 1);
  assert.equal(e.shortfall, true);
  assert.equal(e.consume, 0n);
});

test('"elmaslarım dönüşmesin" (pref 1): bakiye yöntemi kullanılmaz, kesinti Yöntem 1 üzerinden', () => {
  const e = evaluatePay({ levels: L, settings: { ...S, audioShortfallCutBps: 4000 }, metrics: short, pref: 1 });
  assert.equal(e.salaryCents, 600n);
  assert.equal(e.method, 1);
  assert.equal(e.consume, 0n);
});

const lv = (level, days, hours, diamonds, s1, s2) => ({ level, days, hours, gameHours: 0, diamonds, salary1Cents: s1, salary2Cents: s2, agencyCents: 0n });

test('şartı tutan alt seviyenin maaşı, kesintili üst seviyeden yüksekse o ödenir', () => {
  const levels = [lv(1, 5, 10, 100n, 1000n, 1500n), lv(2, 20, 50, 200n, 1100n, 1600n)];
  const m = { seconds: 10 * H, validDays: 5, gameSeconds: 0, diamonds: 200n, balance: 0n };
  const e = evaluatePay({ levels, settings: { ...S, audioShortfallCutBps: 4000 }, metrics: m });
  assert.equal(e.level.level, 1);
  assert.equal(e.salaryCents, 1000n); // seviye 2'nin kesintilisi 660 < 1000
  assert.equal(e.shortfall, false);
});

test('kesintili üst seviye, şartı tutan alt seviyeden yüksekse üst seviye kesintiyle ödenir', () => {
  const levels = [lv(1, 5, 10, 100n, 1000n, 1500n), lv(2, 20, 50, 200n, 2000n, 3000n)];
  const m = { seconds: 10 * H, validDays: 5, gameSeconds: 0, diamonds: 200n, balance: 0n };
  const e = evaluatePay({ levels, settings: { ...S, audioShortfallCutBps: 4000 }, metrics: m });
  assert.equal(e.level.level, 2);
  assert.equal(e.salaryCents, 1200n); // 2000 × %60
  assert.equal(e.shortfall, true);
});

test('oran 0-10000 ile sınırlanır; %100 kesinti = ödeme yok; geçersiz değer = kesinti yok', () => {
  assert.equal(evaluatePay({ levels: L, settings: { ...S, audioShortfallCutBps: 10000 }, metrics: short }).salaryCents, 0n);
  assert.equal(evaluatePay({ levels: L, settings: { ...S, audioShortfallCutBps: 99999 }, metrics: short }).salaryCents, 0n);
  assert.equal(evaluatePay({ levels: L, settings: { ...S, audioShortfallCutBps: -5 }, metrics: short }).salaryCents, 0n);
  assert.equal(evaluatePay({ levels: L, settings: { ...S, audioShortfallCutBps: 'abc' }, metrics: short }).salaryCents, 0n);
});

test('resmi etkinlik cezası kesintinin üstüne biner (%50 ceza: 9$ → 4,50$)', () => {
  const e = evaluatePay({ levels: L, settings: { ...S, requireOfficialEvents: true, audioShortfallCutBps: 4000 }, eventsOk: false, metrics: short });
  assert.equal(e.penalty, true);
  assert.equal(e.salaryCents, 450n);
});

test('sesli kesinti ayarı görüntülü maaşa SIZMAZ (görüntülünün kendi oranı vardır)', () => {
  const m = { seconds: 40 * H, validDays: 10, gameSeconds: 0, diamonds: 200_000n };
  const v = evaluateVideoPay({ levels: L, settings: { ...S, audioShortfallCutBps: 4000 }, metrics: m, video: { shortfallCutBps: 0 } });
  assert.equal(v.salaryCents, 0n);
  assert.equal(v.shortfall, false);
  const v2 = evaluateVideoPay({ levels: L, settings: { ...S, audioShortfallCutBps: 4000 }, metrics: m, video: { shortfallCutBps: 5000 } });
  assert.equal(v2.salaryCents, 500n); // yalnızca görüntülünün %50'si: 10$ × %50
});
