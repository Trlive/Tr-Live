// Ajans sistemi v2: 44 seviyeli yayıncı maaş tablosu ve hesap kuralları (saf fonksiyonlar, veritabanı yok).
//
// Kurallar (yönetimin verdiği mavi tablo; elmas kotaları ×10):
//  - Yöntem 1: dönemde alınan toplam elmas → o kotaya ulaşan en yüksek seviyenin "Maaş 1".
//  - Yöntem 2: dönem kapanırken bakiyede kalan elmas → o kotaya ulaşan en yüksek seviyenin "Maaş 2";
//    bu yöntem seçilirse seviyenin elmas kotası bakiyeden düşülür (elmaslar maaşa çevrilir).
//  - Yayıncıya iki yöntemden yüksek olanı ödenir (yayıncı "elmaslarım dönüşmesin" derse yalnızca Yöntem 1).
//  - Seviyenin gün / saat (ve açıksa oyun saati) şartı tutmazsa o seviye sayılmaz; şartı tutan alt seviyeye düşülür.
//  - Ajans primi: yayıncının o ajanstayken aldığı elmasa göre (şart aranmaz) seviyenin "Ajans primi".

export const BADGES = Object.freeze(['bronz', 'gumus', 'altin', 'super', 'ozel']);
export const BADGE_NAMES = Object.freeze({ bronz: 'Bronz Yayıncı', gumus: 'Gümüş Yayıncı', altin: 'Altın Yayıncı', super: 'Süper Yayıncı', ozel: 'Özel Yayıncı' });
export const badgeRank = (b) => BADGES.indexOf(b);

const M = 1_000_000;
// [seviye, gün, saat, oyun saati, elmas, maaş1 $, maaş2 $, ajans primi $, VIP, VIP gün, rozet, özel ID gün, özel ID adet]
const RAW = [
  [1, 22, 80, 5, 0.2 * M, 10, 15, 2],
  [2, 22, 80, 5, 0.3 * M, 15, 23, 4],
  [3, 22, 80, 5, 0.5 * M, 26, 39, 8],
  [4, 22, 50, 5, 0.8 * M, 40, 60, 15],
  [5, 22, 50, 5, 1.2 * M, 58, 86, 25, 3, 10],
  [6, 22, 50, 5, 1.6 * M, 64, 96, 36, 3, 20],
  [7, 11, 40, 5, 2.2 * M, 75, 132, 51, 4, 10],
  [8, 11, 40, 5, 2.8 * M, 95, 168, 61, 4, 20],
  [9, 11, 40, 5, 3.6 * M, 125, 216, 81, 5, 10, 'bronz'],
  [10, 11, 20, 5, 5 * M, 171, 300, 114, 5, 20, 'bronz'],
  [11, 11, 20, 5, 6.25 * M, 213, 375, 143, 5, 20, 'bronz'],
  [12, 11, 20, 5, 7.5 * M, 277, 470, 150, 5, 30, 'gumus'],
  [13, 11, 20, 5, 10 * M, 373, 630, 194, 6, 10, 'gumus'],
  [14, 11, 20, 5, 12.5 * M, 470, 790, 240, 6, 20, 'gumus', 10],
  [15, 11, 20, 5, 15 * M, 565, 950, 285, 6, 20, 'gumus', 10],
  [16, null, null, 5, 20 * M, 785, 1350, 350, 6, 30, 'gumus', 10],
  [17, null, null, 5, 25 * M, 1006, 1688, 437, 7, 10, 'altin', 10],
  [18, null, null, 5, 30 * M, 1205, 2025, 525, 7, 20, 'altin', 10],
  [19, null, null, 5, 35 * M, 1400, 2362, 613, 7, 20, 'altin', 10],
  [20, null, null, 5, 40 * M, 1610, 2700, 700, 7, 25, 'altin', 10],
  [21, null, null, 5, 45 * M, 1825, 3038, 787, 7, 30, 'altin', 10],
  [22, null, null, 5, 50 * M, 2035, 3375, 875, 8, 10, 'altin', 20],
  [23, null, null, 5, 75 * M, 2971, 5062, 1313, 8, 10, 'super', 20],
  [24, null, null, 5, 100 * M, 3931, 6750, 1750, 8, 15, 'super', 20],
  [25, null, null, 5, 125 * M, 4985, 8438, 2187, 8, 15, 'super', 20],
  [26, null, null, 5, 150 * M, 5945, 10125, 2625, 8, 20, 'super', 30],
  [27, null, null, 5, 200 * M, 7861, 13500, 3500, 8, 20, 'super', 30],
  [28, null, null, 5, 250 * M, 9875, 16875, 4375, 8, 25, 'ozel', 30],
  [29, null, null, 5, 300 * M, 11881, 20250, 5250, 8, 25, 'ozel', 30],
  [30, null, null, 5, 350 * M, 14000, 23625, 6125, 8, 30, 'ozel', 30],
  [31, null, null, 5, 400 * M, 16110, 27000, 7000, 9, 10, 'ozel', 30],
  [32, null, null, 5, 450 * M, 18030, 30375, 7875, 9, 20, 'ozel', 30],
  [33, null, null, 5, 500 * M, 20145, 33750, 8750, 9, 30, 'ozel', 30],
  [34, null, null, 5, 550 * M, 22159, 37125, 9625, 9, 30, 'ozel', 30],
  [35, null, null, 5, 600 * M, 24174, 40500, 10500, 9, 30, 'ozel', 30],
  [36, null, null, 5, 650 * M, 26188, 43875, 11375, 9, 30, 'ozel', 30],
  [37, null, null, 5, 700 * M, 28203, 47250, 12250, 9, 30, 'ozel', 30],
  [38, null, null, 5, 750 * M, 30217, 50625, 13125, 9, 30, 'ozel', 30],
  [39, null, null, 5, 1000 * M, 40290, 67500, 17500, 9, 30, 'ozel', 30, 2],
  [40, null, null, 5, 1250 * M, 50362, 84375, 21875, 9, 30, 'ozel', 30, 2],
  [41, null, null, 5, 1500 * M, 60434, 101250, 26250, 9, 30, 'ozel', 30, 2],
  [42, null, null, 5, 1750 * M, 70507, 118125, 30625, 9, 30, 'ozel', 30, 2],
  [43, null, null, 5, 2000 * M, 80579, 135000, 35000, 9, 30, 'ozel', 30, 2],
  [44, null, null, 5, 2500 * M, 100724, 168750, 43750, 9, 30, 'ozel', 30, 2],
];

/** Varsayılan tablo (yönetim panelindeki "Varsayılana döndür" de bunu kullanır). */
export const DEFAULT_PAY_LEVELS = Object.freeze(RAW.map(([level, days, hours, gameHours, diamonds, s1, s2, ag, vip = null, vipDays = 0, badge = null, sidDays = 0, sidCount = 1]) => Object.freeze({
  level, days, hours, gameHours, diamonds: BigInt(Math.round(diamonds)),
  salary1Cents: BigInt(s1) * 100n, salary2Cents: BigInt(s2) * 100n, agencyCents: BigInt(ag) * 100n,
  vipLevel: vip, vipDays, badge, specialIdDays: sidDays, specialIdCount: sidCount,
})));

/** Ajans seviyeleri (aylık ekip elmasına göre). */
export const DEFAULT_AGENCY_GRADES = Object.freeze([
  { name: 'D', min: 0n }, { name: 'C', min: 50_000_000n }, { name: 'B', min: 200_000_000n },
  { name: 'A', min: 1_000_000_000n }, { name: 'S', min: 3_000_000_000n },
]);

export const payLevelFromRow = (r) => ({
  level: r.level, days: r.required_days, hours: r.required_hours, gameHours: r.game_hours,
  diamonds: BigInt(r.diamonds), salary1Cents: BigInt(r.salary1_cents), salary2Cents: BigInt(r.salary2_cents), agencyCents: BigInt(r.agency_cents),
  vipLevel: r.vip_level, vipDays: r.vip_days, badge: r.badge, specialIdDays: r.special_id_days, specialIdCount: r.special_id_count,
});

export const payLevelJson = (l) => ({
  level: l.level, days: l.days, hours: l.hours, gameHours: l.gameHours, diamonds: String(l.diamonds),
  salary1Cents: String(l.salary1Cents), salary2Cents: String(l.salary2Cents), agencyCents: String(l.agencyCents),
  vipLevel: l.vipLevel, vipDays: l.vipDays, badge: l.badge, specialIdDays: l.specialIdDays, specialIdCount: l.specialIdCount,
});

const sorted = (levels) => [...levels].sort((a, b) => a.level - b.level);

/** Seviyenin gün / saat / (açıksa) oyun saati şartları. Eksik olanların listesi (boşsa tamam). */
export function unmetRequirements(level, m, opts = {}) {
  const out = [];
  if (level.days !== null && level.days !== undefined && (m.validDays ?? 0) < level.days) out.push('days');
  if (level.hours !== null && level.hours !== undefined && (m.seconds ?? 0) < level.hours * 3600) out.push('hours');
  if (opts.requireGameHours && level.gameHours > 0 && (m.gameSeconds ?? 0) < level.gameHours * 3600) out.push('game');
  return out;
}

/** Elmas miktarının ulaştığı en yüksek seviye (requirements: false → şart aranmaz). */
export function bestLevel(levels, amount, m = {}, opts = {}, requirements = true) {
  const a = BigInt(amount ?? 0);
  let best = null;
  for (const l of sorted(levels)) {
    if (a >= l.diamonds && (!requirements || unmetRequirements(l, m, opts).length === 0)) best = l;
  }
  return best;
}

/**
 * Yayıncının maaş hesabı.
 * metrics: { seconds, validDays, gameSeconds, diamonds, balance }
 * settings: { requireGameHours, allowBalanceMethod, requireOfficialEvents, penaltyBps }
 * pref: 0 = otomatik (yüksek olan), 1 = yalnızca Yöntem 1 (elmaslar dönüşmesin)
 */
export function evaluatePay({ levels, metrics, settings = {}, pref = 0, eventsOk = true }) {
  const m = { seconds: 0, validDays: 0, gameSeconds: 0, ...metrics };
  const diamonds = BigInt(m.diamonds ?? 0);
  const balance = BigInt(m.balance ?? 0);
  const level1 = bestLevel(levels, diamonds, m, settings);
  const level2 = settings.allowBalanceMethod !== false && Number(pref) !== 1 ? bestLevel(levels, balance, m, settings) : null;
  const salary1 = level1 ? level1.salary1Cents : 0n;
  const salary2 = level2 ? level2.salary2Cents : 0n;
  let method = null;
  if (salary2 > salary1) method = 2;
  else if (level1) method = 1;
  const level = method === 2 ? level2 : method === 1 ? level1 : null;
  const base = method === 2 ? salary2 : salary1;
  const eventsMet = !settings.requireOfficialEvents || eventsOk;
  const penalty = level !== null && !eventsMet;
  const penaltyBps = BigInt(Math.min(10000, Math.max(0, Number(settings.penaltyBps ?? 0))));
  const salary = penalty ? (base * (10000n - penaltyBps)) / 10000n : base;
  // Elmas kotası tutan ama şartı eksik seviye (uygulamada "gün/saat şartı eksik" uyarısı için).
  const diamondLevel = bestLevel(levels, diamonds, m, settings, false);
  const blocked = diamondLevel && (!level1 || diamondLevel.level > level1.level) ? diamondLevel : null;
  const next = sorted(levels).find((l) => l.diamonds > diamonds) ?? null;
  return {
    level1, level2, salary1, salary2, method, level, baseCents: base, salaryCents: salary, penalty, eventsMet,
    consume: method === 2 ? level2.diamonds : 0n,
    blocked, blockedBy: blocked ? unmetRequirements(blocked, m, settings) : [],
    next, nextRemaining: next ? next.diamonds - diamonds : 0n,
  };
}

/** Ajans primi: yayıncının ajanstayken aldığı elmasa göre seviye (şart aranmaz). */
export function agencyPrim(levels, diamonds) {
  const l = bestLevel(levels, diamonds, {}, {}, false);
  return { level: l ? l.level : null, cents: l ? l.agencyCents : 0n };
}

export function gradeFor(grades, diamonds) {
  const d = BigInt(diamonds ?? 0);
  const list = [...grades].sort((a, b) => (BigInt(a.min) < BigInt(b.min) ? -1 : 1));
  let cur = list[0] ?? null; let next = null;
  for (const g of list) {
    if (d >= BigInt(g.min)) cur = g;
    else { next = g; break; }
  }
  return { current: cur, next, remaining: next ? BigInt(next.min) - d : 0n };
}

// ---------------- Doğrulama (yönetim paneli) ----------------
const bad = (m) => Object.assign(new Error(m), { status: 400 });

function bigField(v, field) {
  if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) return BigInt(v);
  if (typeof v === 'string' && /^\d{1,15}$/.test(v.trim())) return BigInt(v.trim());
  throw bad(`${field} geçersiz.`);
}
function intField(v, field, min, max, nullable = false) {
  if (nullable && (v === null || v === undefined || v === '')) return null;
  const n = typeof v === 'string' && /^\d{1,6}$/.test(v.trim()) ? Number(v) : v;
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${field} ${min}-${max} arasında tam sayı olmalı.`);
  return n;
}

export function validatePayLevels(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 60) throw bad('Maaş tablosu 1-60 seviye olmalı.');
  let prev = -1n;
  return input.map((x, i) => {
    if (!x || typeof x !== 'object') throw bad(`${i + 1}. seviye geçersiz.`);
    const n = i + 1;
    const diamonds = bigField(x.diamonds, `${n}. seviye elmas kotası`);
    if (diamonds <= prev) throw bad(`${n}. seviyenin elmas kotası bir öncekinden büyük olmalı.`);
    prev = diamonds;
    const vipLevel = intField(x.vipLevel, `${n}. seviye VIP`, 1, 11, true);
    const badge = x.badge === null || x.badge === undefined || x.badge === '' ? null : String(x.badge);
    if (badge !== null && !BADGES.includes(badge)) throw bad(`${n}. seviye rozeti geçersiz.`);
    return {
      level: n,
      days: intField(x.days, `${n}. seviye gün şartı`, 0, 31, true),
      hours: intField(x.hours, `${n}. seviye saat şartı`, 0, 744, true),
      gameHours: intField(x.gameHours ?? 0, `${n}. seviye oyun saati`, 0, 744),
      diamonds,
      salary1Cents: bigField(x.salary1Cents, `${n}. seviye Maaş 1`),
      salary2Cents: bigField(x.salary2Cents, `${n}. seviye Maaş 2`),
      agencyCents: bigField(x.agencyCents, `${n}. seviye ajans primi`),
      vipLevel,
      vipDays: vipLevel === null ? 0 : intField(x.vipDays ?? 0, `${n}. seviye VIP günü`, 0, 365),
      badge,
      specialIdDays: intField(x.specialIdDays ?? 0, `${n}. seviye özel ID günü`, 0, 365),
      specialIdCount: intField(x.specialIdCount ?? 1, `${n}. seviye özel ID adedi`, 1, 5),
    };
  });
}

export function validateGrades(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 8) throw bad('Ajans seviyesi sayısı 1-8 olmalı.');
  let prev = -1n;
  return input.map((g, i) => {
    const name = String(g?.name ?? '').trim();
    if (!name || name.length > 8) throw bad('Ajans seviyesi adı 1-8 karakter olmalı.');
    const min = bigField(g?.min, 'Ajans seviyesi eşiği');
    if (i === 0 && min !== 0n) throw bad('İlk ajans seviyesi 0 ile başlamalı.');
    if (min <= prev) throw bad('Ajans seviyesi eşikleri artan olmalı.');
    prev = min;
    return { name, min };
  });
}

// ---------------- Özel ID ----------------
/** Göz alıcı 6 haneli özel ID adayı (AABBCC, ABABAB, ABCABC, AAABBB, ABCCBA, ABBBBA). */
export function prettyIdCandidate(rand = Math.random) {
  const digit = (exclude = [], first = false) => {
    for (;;) {
      const d = Math.floor(rand() * 10);
      if ((first && d === 0) || exclude.includes(d)) continue;
      return d;
    }
  };
  const a = digit([], true); const b = digit([a]); const c = digit([a, b]);
  const patterns = [
    [a, a, b, b, c, c], [a, b, a, b, a, b], [a, b, c, a, b, c], [a, a, a, b, b, b], [a, b, c, c, b, a], [a, b, b, b, b, a],
  ];
  return patterns[Math.floor(rand() * patterns.length)].join('');
}

export const SPECIAL_ID_RE = /^[1-9]\d{1,6}$/;
