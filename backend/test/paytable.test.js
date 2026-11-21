import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PAY_LEVELS as L, evaluatePay, agencyPrim, bestLevel, validatePayLevels, validateGrades, gradeFor, prettyIdCandidate, SPECIAL_ID_RE,
  DEFAULT_AGENCY_GRADES, payLevelJson,
} from '../src/modules/games/paytable.rules.js';

const H = 3600;
const S = { allowBalanceMethod: true, requireGameHours: false, penaltyBps: 5000 };

test('maaş tablosu: 44 seviye, kotalar artan ve ×10', () => {
  assert.equal(L.length, 44);
  assert.equal(L[0].diamonds, 200_000n);
  assert.equal(L[43].diamonds, 2_500_000_000n);
  for (let i = 1; i < L.length; i += 1) assert.ok(L[i].diamonds > L[i - 1].diamonds);
  assert.equal(L[0].salary1Cents, 1000n);
  assert.equal(L[0].salary2Cents, 1500n);
  assert.equal(L[15].days, null); // 16+ gün/saat şartı yok
  assert.equal(L[38].specialIdCount, 2);
});

test('Yöntem 1: şartlar tutmazsa alt seviyeye düşer', () => {
  // 3M elmas, 25 gün, 99 saat → seviye 8 (2,8M; 11 gün 40 saat)
  let e = evaluatePay({ levels: L, settings: S, metrics: { seconds: 99 * H, validDays: 25, diamonds: 3_000_000n, balance: 0n } });
  assert.equal(e.level1.level, 8);
  assert.equal(e.method, 1);
  assert.equal(e.salaryCents, 9500n);
  // aynı elmas, 10 gün → 7-15 için 11 gün, 1-6 için 22 gün gerekir → maaş yok
  e = evaluatePay({ levels: L, settings: S, metrics: { seconds: 99 * H, validDays: 10, diamonds: 3_000_000n, balance: 0n } });
  assert.equal(e.level1, null);
  assert.equal(e.salaryCents, 0n);
  assert.equal(e.blocked.level, 8);
  assert.deepEqual(e.blockedBy, ['days']);
});

test('Yöntem 2: bakiye daha yüksek maaş veriyorsa seçilir, tercih 1 ise seçilmez', () => {
  const m = { seconds: 99 * H, validDays: 25, diamonds: 3_000_000n, balance: 5_000_000n };
  let e = evaluatePay({ levels: L, settings: S, metrics: m });
  assert.equal(e.method, 2);
  assert.equal(e.level2.level, 10);
  assert.equal(e.salaryCents, 30000n);
  assert.equal(e.consume, 5_000_000n);
  e = evaluatePay({ levels: L, settings: S, metrics: m, pref: 1 });
  assert.equal(e.method, 1);
  assert.equal(e.consume, 0n);
  e = evaluatePay({ levels: L, settings: { ...S, allowBalanceMethod: false }, metrics: m });
  assert.equal(e.method, 1);
});

test('16+ seviyede gün/saat şartı yok; oyun saati açıksa aranır', () => {
  const m = { seconds: 0, validDays: 0, gameSeconds: 0, diamonds: 20_000_000n, balance: 0n };
  assert.equal(evaluatePay({ levels: L, settings: S, metrics: m }).level1.level, 16);
  assert.equal(evaluatePay({ levels: L, settings: { ...S, requireGameHours: true }, metrics: m }).level1, null);
  assert.equal(evaluatePay({ levels: L, settings: { ...S, requireGameHours: true }, metrics: { ...m, gameSeconds: 5 * H } }).level1.level, 16);
});

test('resmi etkinlik şartı tutmazsa kesinti', () => {
  const e = evaluatePay({ levels: L, settings: { ...S, requireOfficialEvents: true }, eventsOk: false, metrics: { seconds: 99 * H, validDays: 25, diamonds: 3_000_000n } });
  assert.equal(e.penalty, true);
  assert.equal(e.salaryCents, 4750n);
});

test('ajans primi şartsız, elmasa göre', () => {
  assert.deepEqual(agencyPrim(L, 199_999n), { level: null, cents: 0n });
  assert.deepEqual(agencyPrim(L, 3_050_000n), { level: 8, cents: 6100n });
  assert.equal(bestLevel(L, 2_200_000_000n, {}, {}, false).level, 43);
});

test('doğrulama ve yardımcılar', () => {
  const ok = validatePayLevels(L.map(payLevelJson));
  assert.equal(ok.length, 44);
  assert.throws(() => validatePayLevels([{ diamonds: '10', salary1Cents: '1', salary2Cents: '1', agencyCents: '1' }, { diamonds: '5', salary1Cents: '1', salary2Cents: '1', agencyCents: '1' }]));
  assert.throws(() => validatePayLevels([{ diamonds: '10', salary1Cents: '1', salary2Cents: '1', agencyCents: '1', badge: 'x' }]));
  assert.throws(() => validateGrades([{ name: 'D', min: '5' }]));
  assert.equal(gradeFor(DEFAULT_AGENCY_GRADES, 60_000_000n).current.name, 'C');
  assert.equal(gradeFor(DEFAULT_AGENCY_GRADES, 60_000_000n).remaining, 140_000_000n);
  for (let i = 0; i < 50; i += 1) {
    const id = prettyIdCandidate();
    assert.match(id, /^[1-9]\d{5}$/);
    assert.ok(SPECIAL_ID_RE.test(id));
  }
});
