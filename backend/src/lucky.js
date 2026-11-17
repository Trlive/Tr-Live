import crypto from 'node:crypto';

// Şanslı hediye (Yoho / Bigo / Mico "çan", "yonca") — HAVUZLU sistem.
//
// Gönderilen her şanslı hediyenin bir payı o hediyenin havuzuna girer (panelde "geri dönüş oranı", varsayılan %60).
// Bu pay ikiye ayrılır:
//   • Ana havuz   — küçük ve orta kazançlar (x1, x2, x3, x5, x10, x50). Her adet çekilişe girer; çıkan kazanç ana havuzda
//                   yoksa havuzun karşılayabildiği en büyük küçük çarpan verilir (havuz hiç eksiye düşmez).
//   • Büyük ödül havuzu (jackpot) — x100, x500, x1000. Bu havuz DOLMADAN (hediye fiyatı × 100) büyük çarpan hiç çıkmaz;
//                   dolunca açılır, büyük ödül çıkınca boşalır ve yeniden dolmaya başlar ("dolunca verir").
// Çekilişin istediği toplam havuza girenden biraz fazladır (OVER_*), böylece ödemeyi havuz sınırlar: uzun vadede
// gönderene dönen Coin hiçbir zaman ayarlanan orandan fazla olmaz, platform ve alıcı payı her zaman korunur.
// Bakiyeler 1/10000 Coin biriminde tutulur (1 Coin'lik hediyede bile pay yuvarlanıp kaybolmasın).

export const BASE_TIER = Object.freeze([
  [50, 0.0016],
  [10, 0.006],
  [5, 0.012],
  [3, 0.03],
  [2, 0.06],
  [1, 0.2],
]);
export const JACKPOT_TIER = Object.freeze([
  [1000, 0.00002],
  [500, 0.00006],
  [100, 0.0004],
]);
/** Yoho kuralı: değeri 5.000 Coin altındaki hediyeler en fazla x500, 5.000 ve üstü x1000 kazandırır. */
export const BIG_PRICE = 5000n;
export const maxMultiplierFor = (price) => (BigInt(price) >= BIG_PRICE ? 1000 : 500);

/** Gösterim için tüm çarpanlar (büyükten küçüğe). */
export const LUCKY_BASE = Object.freeze([...JACKPOT_TIER, ...BASE_TIER]);
/** Büyük ödül havuzu bu kadar "hediye fiyatı" biriktirince açılır. */
export const JACKPOT_OPEN = 100;
export const OVER_BASE = 1.15;
export const OVER_JACKPOT = 1.5;
export const UNIT = 10000n; // havuz birimi: 1 Coin = 10000

const rtpOf = (t) => t.reduce((s, [m, p]) => s + m * p, 0);
const BASE_RTP = rtpOf(BASE_TIER); // 0.53
const JACKPOT_RTP = rtpOf(JACKPOT_TIER); // 0.09

/** Havuza giden paylar (baz puan): toplam (rtpBps) → ana + büyük ödül. */
export function poolRates(rtpBps, jackpotShareBps) {
  const rtp = Math.max(0, Math.trunc(rtpBps) || 0);
  const share = Math.min(Math.max(Math.trunc(jackpotShareBps) || 0, 0), 10000);
  const jackpot = Math.floor((rtp * share) / 10000);
  return { base: rtp - jackpot, jackpot };
}

/** Çekiliş olasılıkları: ana kademe ve (havuz doluyken) büyük ödül kademesi. */
export function luckyTables(rtpBps, jackpotShareBps) {
  const r = poolRates(rtpBps, jackpotShareBps);
  const kb = (r.base / 10000) * OVER_BASE / BASE_RTP;
  const kj = (r.jackpot / 10000) * OVER_JACKPOT / JACKPOT_RTP;
  return {
    base: BASE_TIER.map(([m, p]) => [m, p * kb]),
    jackpot: JACKPOT_TIER.map(([m, p]) => [m, p * kj]),
  };
}

/** Hızlı, kriptografik tohumlu sözde rastgele üretici (yüz binlerce çekiliş için crypto tek tek yavaş kalır). */
export function seededRandom(seed = crypto.randomBytes(16)) {
  let a = seed.readUInt32LE(0) || 1; let b = seed.readUInt32LE(4) || 2; let c = seed.readUInt32LE(8) || 3; let d = seed.readUInt32LE(12) || 4;
  return () => {
    // xoshiro128** (32 bit)
    const r = Math.imul(Math.imul(b, 5) << 7 | Math.imul(b, 5) >>> 25, 9) >>> 0;
    const t = b << 9;
    c ^= a; d ^= b; b ^= c; a ^= d; c ^= t;
    d = d << 11 | d >>> 21;
    return r / 4294967296;
  };
}

const pick = (table, x) => {
  for (const [m, p] of table) {
    if (x < p) return { m, rest: -1 };
    x -= p;
  }
  return { m: 0, rest: x };
};

/**
 * Havuzlu çekiliş. Önce bu gönderimin payı havuzlara eklenir, sonra her adet çekilir.
 * Girdi: units, price (BigInt Coin), pool { base, jackpot } (BigInt, 1/10000 Coin), rtpBps, jackpotShareBps,
 *        maxWin (BigInt Coin, tek gönderim üst sınırı), rng.
 * Dönüş: { win (BigInt Coin), multiplier, best, hits {çarpan: adet}, wins, jackpotHits, pool { base, jackpot }, added }.
 */
export function drawLuckyPool({ units, price, pool, rtpBps, jackpotShareBps, maxWin, rng = seededRandom() }) {
  const p = BigInt(price);
  const n = Math.max(0, Math.trunc(Number(units)) || 0);
  const rates = poolRates(rtpBps, jackpotShareBps);
  const spend = p * BigInt(n);
  const addBase = spend * BigInt(rates.base);
  const addJackpot = spend * BigInt(rates.jackpot);
  let base = BigInt(pool?.base ?? 0) + addBase;
  let jackpot = BigInt(pool?.jackpot ?? 0) + addJackpot;
  const tables = luckyTables(rtpBps, jackpotShareBps);
  const openAt = p * BigInt(JACKPOT_OPEN) * UNIT;
  const cap = BigInt(maxWin ?? 0) > 0n ? BigInt(maxWin) * UNIT : null;
  const maxMult = maxMultiplierFor(p);
  const hits = {};
  let paid = 0n; // 1/10000 Coin
  let multiplier = 0; let best = 0; let wins = 0; let jackpotHits = 0;
  const record = (m) => {
    hits[m] = (hits[m] ?? 0) + 1;
    multiplier += m; wins += 1; if (m > best) best = m;
    paid += BigInt(m) * p * UNIT;
  };
  // Tek gönderim üst sınırı içinde kalan pay.
  const room = () => (cap === null ? null : cap - paid);
  const fits = (m, balance) => {
    const cost = BigInt(m) * p * UNIT;
    const r = room();
    return cost <= balance && (r === null || cost <= r);
  };
  for (let i = 0; i < n; i += 1) {
    let x = rng();
    // Büyük ödül kademesi yalnızca havuz doluyken.
    if (jackpot >= openAt) {
      const j = pick(tables.jackpot, x);
      if (j.m) {
        const m = JACKPOT_TIER.map(([v]) => v).find((v) => v <= j.m && v <= maxMult && fits(v, jackpot));
        if (m) {
          jackpot -= BigInt(m) * p * UNIT;
          jackpotHits += 1;
          record(m);
        }
        continue;
      }
      x = j.rest;
    }
    const b = pick(tables.base, x);
    if (!b.m) continue;
    // Ana havuz yetmezse karşılayabildiği en büyük küçük çarpan (hiçbiri yetmezse boş).
    const m = BASE_TIER.map(([v]) => v).find((v) => v <= b.m && fits(v, base));
    if (!m) continue;
    base -= BigInt(m) * p * UNIT;
    record(m);
  }
  return {
    win: paid / UNIT, multiplier, best, hits, wins, jackpotHits,
    pool: { base, jackpot }, added: { base: addBase, jackpot: addJackpot },
  };
}

/** Kullanıcıya gösterilen havuz durumu (Coin cinsinden). */
export function poolView(giftId, price, pool) {
  const openAt = BigInt(price) * BigInt(JACKPOT_OPEN);
  const jackpot = BigInt(pool?.jackpot ?? 0) / UNIT;
  return { giftId, jackpot: jackpot.toString(), openAt: openAt.toString(), open: jackpot >= openAt };
}
