import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_TIER, JACKPOT_TIER, JACKPOT_OPEN, LUCKY_BASE, UNIT, luckyTables, poolRates, poolView, seededRandom, drawLuckyPool,
} from '../src/modules/gifts/lucky.rules.js';

const rtpOf = (table) => table.reduce((s, [m, p]) => s + m * p, 0);
const seed = (hex) => Buffer.from(hex, 'hex');

test('şanslı hediye: tohumlu üretici tekrarlanabilir ve [0,1) aralığında', () => {
  const s = seed('00112233445566778899aabbccddeeff');
  const a = seededRandom(s); const b = seededRandom(s);
  for (let i = 0; i < 1000; i += 1) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
});

test('şanslı hediye: havuz payları ve tablolar', () => {
  assert.deepEqual(poolRates(6000, 2500), { base: 4500, jackpot: 1500 });
  assert.deepEqual(poolRates(0, 2500), { base: 0, jackpot: 0 });
  const t = luckyTables(6000, 2500);
  // Çekilişin istediği, havuza girenden biraz fazla (ödemeyi havuz sınırlar).
  assert.ok(rtpOf(t.base) > 0.45 && rtpOf(t.base) < 0.6);
  assert.ok(rtpOf(t.jackpot) > 0.15 && rtpOf(t.jackpot) < 0.3);
  const hi = luckyTables(9000, 8000);
  assert.ok(hi.base.reduce((s, [, p]) => s + p, 0) + hi.jackpot.reduce((s, [, p]) => s + p, 0) < 1);
  assert.equal(Math.max(...LUCKY_BASE.map(([m]) => m)), 1000);
  assert.ok(JACKPOT_TIER.every(([m]) => m >= 100) && BASE_TIER.every(([m]) => m < 100));
});

function simulate(rtpBps, share, sends, price = 10n, hex = '0f1e2d3c4b5a69788796a5b4c3d2e1f0') {
  const rng = seededRandom(seed(hex));
  let pool = { base: 0n, jackpot: 0n };
  let spent = 0n; let won = 0n; let units = 0; let wonUnits = 0; const big = {};
  for (let i = 0; i < sends; i += 1) {
    const u = [1, 1, 9, 19, 99][Math.floor(rng() * 5)];
    const r = drawLuckyPool({ units: u, price, pool, rtpBps, jackpotShareBps: share, maxWin: 5000000n, rng });
    assert.ok(r.pool.base >= 0n && r.pool.jackpot >= 0n, 'havuz eksiye düşmez');
    assert.equal(Object.entries(r.hits).reduce((s, [m, c]) => s + Number(m) * c, 0) * Number(price), Number(r.win));
    pool = r.pool; spent += price * BigInt(u); won += r.win; units += u; wonUnits += r.wins;
    for (const m of [100, 500, 1000]) if (r.hits[m]) big[m] = (big[m] ?? 0) + r.hits[m];
  }
  return { rtp: Number((won * 10000n) / spent) / 10000, hit: wonUnits / units, big, pool, spent, won };
}

test('şanslı hediye: ödenen hiçbir zaman havuza girenden fazla değil, uzun vadede ayarlanan orana oturur', () => {
  for (const [bps, share] of [[6000, 2500], [9000, 2500], [3000, 5000], [6000, 0]]) {
    const s = simulate(bps, share, 60000);
    assert.ok(s.rtp <= bps / 10000 + 1e-9, `RTP ${bps}: ${s.rtp}`);
    assert.ok(s.rtp > bps / 10000 - 0.03, `RTP ${bps}: ${s.rtp}`);
  }
});

test('şanslı hediye: giren = ödenen + havuzda kalan (birim hassasiyetinde)', () => {
  const rng = seededRandom(seed('aa112233445566778899aabbccddeeff'));
  let pool = { base: 0n, jackpot: 0n }; let inn = 0n; let out = 0n;
  for (let i = 0; i < 20000; i += 1) {
    const r = drawLuckyPool({ units: 9, price: 7n, pool, rtpBps: 6000, jackpotShareBps: 2500, maxWin: 5000000n, rng });
    inn += r.added.base + r.added.jackpot; out += r.win * UNIT; pool = r.pool;
  }
  assert.equal(inn, out + pool.base + pool.jackpot);
});

test('şanslı hediye: büyük ödül havuzu dolmadan x100+ çıkmaz, dolunca çıkar', () => {
  const rng = seededRandom(seed('11112233445566778899aabbccddeeff'));
  const price = 10n;
  // Dolu değil: binlerce çekilişte büyük çarpan yok.
  const empty = drawLuckyPool({ units: 5000, price, pool: { base: 0n, jackpot: 0n }, rtpBps: 6000, jackpotShareBps: 0, maxWin: 10n ** 9n, rng });
  assert.equal(empty.jackpotHits, 0);
  assert.ok(!Object.keys(empty.hits).some((m) => Number(m) >= 100));
  // Dolu (fiyat × 1000): büyük çarpanlar çıkar ve havuzdan düşer.
  const full = price * 1000n * UNIT;
  const r = drawLuckyPool({ units: 20000, price, pool: { base: 0n, jackpot: full }, rtpBps: 6000, jackpotShareBps: 2500, maxWin: 10n ** 9n, rng });
  assert.ok(r.jackpotHits > 0, 'dolu havuzda büyük ödül çıkmalı');
  const v = poolView('g', price, { jackpot: price * BigInt(JACKPOT_OPEN) * UNIT });
  assert.equal(v.open, true);
  assert.equal(poolView('g', price, { jackpot: 1n }).open, false);
});

test('şanslı hediye: küçük kazançlar sık; RTP 0 → hiçbir şey', () => {
  const s = simulate(6000, 2500, 20000);
  assert.ok(s.hit > 0.2 && s.hit < 0.4, `isabet ${s.hit}`);
  const z = drawLuckyPool({ units: 1000, price: 10n, pool: { base: 0n, jackpot: 0n }, rtpBps: 0, jackpotShareBps: 2500, maxWin: 1000n });
  assert.equal(z.win, 0n);
  assert.equal(z.wins, 0);
  // Tek gönderim üst sınırı aşılmaz.
  const c = drawLuckyPool({ units: 5000, price: 10n, pool: { base: 10n ** 12n, jackpot: 10n ** 12n }, rtpBps: 9000, jackpotShareBps: 2500, maxWin: 300n });
  assert.ok(c.win <= 300n);
});
