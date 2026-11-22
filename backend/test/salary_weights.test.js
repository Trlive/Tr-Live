// Ağırlıklı maaş hak edişi. Para hesabı olduğu için kenar durumlar tek tek sınanıyor.
import test from 'node:test';
import assert from 'node:assert/strict';

delete process.env.DATABASE_URL;
const {
  evaluateWeightedSalary, validateWeights, weightedJson,
  DEFAULT_WEIGHTS, WEIGHT_KEYS, TOTAL_BPS,
} = await import('../src/modules/wallet/salary_weights.rules.js');

// Kademe 1'in gerçek değerleri (DEFAULT_PAY_LEVELS): 22 gün, 80 saat, 200.000 elmas, 10,00 $.
const TIER = { level: 1, days: 22, hours: 80, diamonds: 200000n, salary1Cents: 1000n };
const FULL = { validDays: 22, seconds: 80 * 3600, diamonds: 200000n };

test('tüm koşullar tamam → %100 ve temel maaşın tamamı', () => {
  const r = evaluateWeightedSalary({ tier: TIER, metrics: FULL, eventsOk: true });
  assert.equal(r.earnedBps, TOTAL_BPS);
  assert.equal(r.earnedCents, 1000n);
  assert.ok(r.parts.every((p) => p.met));
});

// ---------------------------------------------------------------------------
// SAHİBİNİN KURALI: eşik. "21 gün 59 dk bile olsa maaşın yarısı yatacak!"
// ---------------------------------------------------------------------------

test('22 gün isteniyorsa 21 gün EKSİKTİR → maaşın yarısı', () => {
  const r = evaluateWeightedSalary({
    tier: TIER, metrics: { ...FULL, validDays: 21 }, eventsOk: true,
  });
  assert.equal(r.daysOk, false, '21 gün yetmez');
  assert.equal(r.earnedBps, 5000, 'tam olarak %50');
  assert.equal(r.earnedCents, 500n, 'maaşın yarısı');
});

test('80 saat isteniyorsa 79 sa 59 dk EKSİKTİR → maaşın yarısı', () => {
  const r = evaluateWeightedSalary({
    tier: TIER, metrics: { ...FULL, seconds: 80 * 3600 - 60 }, eventsOk: true,
  });
  assert.equal(r.hoursOk, false, 'bir dakika eksik de eksiktir');
  assert.equal(r.earnedBps, 5000);
  assert.equal(r.earnedCents, 500n);
});

test('TEK SANİYE eksik bile eksiktir', () => {
  const r = evaluateWeightedSalary({
    tier: TIER, metrics: { ...FULL, seconds: 80 * 3600 - 1 }, eventsOk: true,
  });
  assert.equal(r.hoursOk, false);
  assert.equal(r.earnedBps, 5000);
});

test('gün ve saat TEK koşul: yalnızca biri eksikse de sonuç aynı (%50)', () => {
  const sadeceGun = evaluateWeightedSalary({ tier: TIER, metrics: { ...FULL, validDays: 21 }, eventsOk: true });
  const sadeceSaat = evaluateWeightedSalary({ tier: TIER, metrics: { ...FULL, seconds: 79 * 3600 }, eventsOk: true });
  const ikisi = evaluateWeightedSalary({ tier: TIER, metrics: { validDays: 10, seconds: 3600, diamonds: 200000n }, eventsOk: true });
  assert.equal(sadeceGun.earnedBps, 5000, 'yalnızca gün eksik');
  assert.equal(sadeceSaat.earnedBps, 5000, 'yalnızca saat eksik');
  assert.equal(ikisi.earnedBps, 5000, 'ikisi birden eksik');
  // Ayrı ağırlık verseydik yalnızca günü eksik olana %75 ödenirdi — istenen bu değil.
});

test('tam sınırda TUTAR: 22 gün ve 80 saat tamı tamına yeterli', () => {
  const r = evaluateWeightedSalary({
    tier: TIER, metrics: { validDays: 22, seconds: 80 * 3600, diamonds: 200000n }, eventsOk: true,
  });
  assert.equal(r.daysOk, true);
  assert.equal(r.hoursOk, true);
  assert.equal(r.earnedBps, TOTAL_BPS);
});

test('kısmi kredi YOK: 20 gün ile 1 gün aynı sonucu verir', () => {
  const yirmi = evaluateWeightedSalary({ tier: TIER, metrics: { ...FULL, validDays: 20 }, eventsOk: true });
  const bir = evaluateWeightedSalary({ tier: TIER, metrics: { ...FULL, validDays: 1 }, eventsOk: true });
  assert.equal(yirmi.earnedBps, bir.earnedBps, 'eşikli hesapta aradaki fark ödemeyi değiştirmez');
  assert.equal(yirmi.earnedBps, 5000);
});

test('elmas hedefi eksikse kendi ağırlığı kadar düşer', () => {
  const r = evaluateWeightedSalary({ tier: TIER, metrics: { ...FULL, diamonds: 199999n }, eventsOk: true });
  assert.equal(r.diamondTargetOk, false, 'bir elmas eksik de eksiktir');
  assert.equal(r.earnedBps, 10000 - 3000);
  assert.equal(r.earnedCents, 700n);
});

test('görev koşulu eksikse kendi ağırlığı kadar düşer', () => {
  const r = evaluateWeightedSalary({ tier: TIER, metrics: FULL, eventsOk: false });
  assert.equal(r.earnedBps, 10000 - 2000);
  assert.equal(r.tasksOk, false);
});

test('hiçbir koşul tutmadı → %0 (negatif olmaz)', () => {
  const r = evaluateWeightedSalary({
    tier: TIER, metrics: { validDays: 0, seconds: 0, diamonds: 0n }, eventsOk: false,
  });
  assert.equal(r.earnedBps, 0);
  assert.equal(r.earnedCents, 0n);
});

test('hedefin ÜSTÜNE çıkmak %100den fazla kazandırmaz', () => {
  const r = evaluateWeightedSalary({
    tier: TIER, metrics: { validDays: 31, seconds: 300 * 3600, diamonds: 99999999n }, eventsOk: true,
  });
  assert.equal(r.earnedBps, TOTAL_BPS);
  assert.equal(r.earnedCents, 1000n);
});

test('kademede şart yoksa (null gün/saat) o koşul tutmuş sayılır', () => {
  const top = { level: 44, days: null, hours: null, diamonds: 2500000000n, salary1Cents: 10072400n };
  const r = evaluateWeightedSalary({
    tier: top, metrics: { validDays: 0, seconds: 0, diamonds: 2500000000n }, eventsOk: true,
  });
  assert.equal(r.earnedBps, TOTAL_BPS, 'aranmayan şart kaybettirmez');
  assert.equal(r.earnedCents, 10072400n);
});

test('sözleşme kademesi yoksa null döner — uydurma temel maaş üretilmez', () => {
  assert.equal(evaluateWeightedSalary({ tier: null, metrics: FULL }), null);
  assert.equal(evaluateWeightedSalary({ tier: undefined, metrics: FULL }), null);
});

test('kırılım hangisinin eksik olduğunu söylüyor', () => {
  const r = evaluateWeightedSalary({ tier: TIER, metrics: { ...FULL, validDays: 21 }, eventsOk: true });
  const a = r.parts.find((p) => p.key === 'attendance');
  assert.equal(a.met, false);
  assert.equal(a.daysOk, false, 'gün eksik');
  assert.equal(a.hoursOk, true, 'saat tamam');
  assert.equal(a.completedDays, 21);
  assert.equal(a.requiredDays, 22);
  assert.equal(a.earnedBps, 0, 'tutmayan koşul hiç puan katmaz');
  // Oran yalnızca gösterim için: ödemeyi etkilemiyor.
  assert.equal(a.daysRatioBps, 9545);
});

test('büyük elmas sayıları BigInt ile taşınıyor', () => {
  const big = { level: 44, days: 0, hours: 0, diamonds: 2500000000n, salary1Cents: 10072400n };
  const eksik = evaluateWeightedSalary({ tier: big, metrics: { diamonds: 2499999999n }, eventsOk: true });
  assert.equal(eksik.diamondTargetOk, false, 'milyarda bir elmas eksik de eksiktir');
  const tam = evaluateWeightedSalary({ tier: big, metrics: { diamonds: 2500000000n }, eventsOk: true });
  assert.equal(tam.diamondTargetOk, true);
});

test('para yuvarlaması AŞAĞI: hak edilmemiş 1 sent ödenmez', () => {
  const tiny = { level: 1, days: 0, hours: 0, diamonds: 100n, salary1Cents: 1n };
  const r = evaluateWeightedSalary({ tier: tiny, metrics: { diamonds: 50n }, eventsOk: true });
  assert.equal(r.earnedBps, 7000, 'elmas eksik → 10000-3000');
  assert.equal(r.earnedCents, 0n, '1 sentin %70i aşağı yuvarlanır');
});

test('ağırlıklar panelden değişebilir: %60 isteniyorsa devam 4000', () => {
  const w = validateWeights({ attendance: 4000, diamonds: 3600, tasks: 2400 });
  const r = evaluateWeightedSalary({ tier: TIER, metrics: { ...FULL, validDays: 21 }, eventsOk: true, weights: w });
  assert.equal(r.earnedBps, 6000, 'gün eksikse %60 kalır');
  assert.equal(r.earnedCents, 600n);
});

// ---------------- Ağırlık doğrulama ----------------

test('ağırlık toplamı 10000 değilse REDDEDİLİR', () => {
  assert.throws(() => validateWeights({ attendance: 5000, diamonds: 3000, tasks: 1000 }), /toplamı 10000 olmalı/);
  assert.throws(() => validateWeights({ attendance: 9000, diamonds: 9000, tasks: 9000 }), /toplamı 10000 olmalı/);
});

test('ağırlıklar: eksik anahtar, bilinmeyen anahtar, aralık dışı', () => {
  assert.throws(() => validateWeights({ attendance: 10000 }), /ağırlığı 0-10000/);
  assert.throws(() => validateWeights({ ...DEFAULT_WEIGHTS, bilinmeyen: 0 }), /Bilinmeyen maaş koşulu/);
  // Eski biçim (days/hours) artık tanınmıyor: sessizce yarım uygulanmasın.
  assert.throws(() => validateWeights({ days: 2500, hours: 2500, diamonds: 3000, tasks: 2000 }), /Bilinmeyen maaş koşulu|ağırlığı 0-10000/);
  assert.throws(() => validateWeights({ attendance: -1, diamonds: 3000, tasks: 7001 }), /ağırlığı 0-10000/);
  assert.throws(() => validateWeights({ attendance: 1.5, diamonds: 3000, tasks: 5498.5 }), /tam sayı olmalı/);
  assert.throws(() => validateWeights('tümü'), /geçersiz/);
  assert.throws(() => validateWeights([5000, 3000, 2000]), /geçersiz/);
});

test('ağırlıklar: metin sayılar kabul, null varsayılana döner', () => {
  assert.deepEqual(validateWeights({ attendance: '5000', diamonds: '3000', tasks: '2000' }), { ...DEFAULT_WEIGHTS });
  assert.deepEqual(validateWeights(null), { ...DEFAULT_WEIGHTS });
  assert.deepEqual(validateWeights(undefined), { ...DEFAULT_WEIGHTS });
});

test('tek koşula 10000: sahibi isterse maaşı tek şarta bağlayabilir', () => {
  const w = validateWeights({ attendance: 10000, diamonds: 0, tasks: 0 });
  const r = evaluateWeightedSalary({ tier: TIER, metrics: { ...FULL, validDays: 21 }, eventsOk: false, weights: w });
  assert.equal(r.earnedBps, 0, 'devam eksikse hiç maaş yok');
  const tam = evaluateWeightedSalary({ tier: TIER, metrics: FULL, eventsOk: false, weights: w });
  assert.equal(tam.earnedBps, 10000, 'devam tamsa görev aranmıyor');
});

test('varsayılan ağırlıkların toplamı 10000 ve devam 5000 (= yarısı)', () => {
  assert.equal(WEIGHT_KEYS.reduce((a, k) => a + DEFAULT_WEIGHTS[k], 0), TOTAL_BPS);
  assert.equal(DEFAULT_WEIGHTS.attendance, 5000, 'gün/saat eksikse tam yarısı yatsın');
});

test('weightedJson BigInt sızdırmaz', () => {
  const j = weightedJson(evaluateWeightedSalary({ tier: TIER, metrics: FULL, eventsOk: true }));
  assert.ok(JSON.stringify(j).includes('"earnedCents":"1000"'));
  assert.equal(weightedJson(null), null);
  assert.equal(typeof j.required.diamonds, 'string');
});

// ---------------- Ay başı aktarım penceresi ----------------
//
// shouldRun saf fonksiyon: tarihi ve ayarları dışarıdan alıyor, böylece "ayın 3'ünde
// çalışır, 4'ünde çalışmaz" davranışı saati beklemeden sınanabiliyor.

const { shouldRun } = await import('../src/modules/wallet/salary_transfer.service.js');

const ON = { salaryAutoTransfer: true, salaryTransferDayFrom: 1, salaryTransferDayTo: 3 };
const at = (iso) => new Date(iso);

test('aktarım penceresi: ayın 1, 2 ve 3ünde çalışır', () => {
  for (const d of ['01', '02', '03']) {
    assert.equal(shouldRun({ settings: ON, now: at(`2026-12-${d}T04:00:00Z`) }).run, true, `ayın ${d}i`);
  }
});

test('aktarım penceresi: ayın 4ünde ve son gününde ÇALIŞMAZ', () => {
  assert.equal(shouldRun({ settings: ON, now: at('2026-12-04T04:00:00Z') }).run, false);
  assert.equal(shouldRun({ settings: ON, now: at('2026-12-31T23:00:00Z') }).run, false);
});

test('bayrak kapalıysa pencere içinde bile çalışmaz', () => {
  const off = { ...ON, salaryAutoTransfer: false };
  const r = shouldRun({ settings: off, now: at('2026-12-01T04:00:00Z') });
  assert.equal(r.run, false);
  assert.equal(r.reason, 'kapalı');
});

test('ayar yoksa (eski kurulum) çalışmaz — varsayılan KAPALI', () => {
  assert.equal(shouldRun({ settings: {}, now: at('2026-12-01T04:00:00Z') }).run, false);
});

test('pencere panelden değiştirilebilir', () => {
  const wide = { salaryAutoTransfer: true, salaryTransferDayFrom: 5, salaryTransferDayTo: 7 };
  assert.equal(shouldRun({ settings: wide, now: at('2026-12-01T04:00:00Z') }).run, false);
  assert.equal(shouldRun({ settings: wide, now: at('2026-12-06T04:00:00Z') }).run, true);
});

test('pencere UTC gününe göre: sunucu saat dilimi değişse de aynı davranır', () => {
  // 2026-12-03T23:30Z hâlâ ayın 3ü (UTC) → çalışır. Yerel saate baksaydık +03'te
  // ayın 4ü olur ve aktarım atlanırdı.
  assert.equal(shouldRun({ settings: ON, now: at('2026-12-03T23:30:00Z') }).run, true);
});
