// Wild King slotu — SAF RASTGELE motor (sunucu otoriter).
// Sonuç hiçbir şekilde "hedef RTP'ye çekilmez": makara durma noktaları güvenli rastgeleden (crypto.randomInt) seçilir.
// Oranlar yalnızca şerit dizilimi + ödeme tablosundan gelir (test/wild_king.test.js simülasyonla doğrular).
import { randomInt } from 'node:crypto';

export const COLS = 5, ROWS = 3, NL = 50;
export const S10 = 0, SJ = 1, SQ = 2, SK = 3, SA = 4, SR = 5, SE = 6, ST = 7, SW = 8, SF = 9, SP = 10, SH = 11;
// [3'lü, 4'lü, 5'li] çizgi bahsi çarpanı
export const PAY = [[4, 10, 25], [6, 20, 60], [8, 30, 100], [10, 40, 150], [15, 50, 250], [20, 100, 500], [25, 200, 600], [30, 300, 1000], [50, 500, 2000]];
export const LINES = ('11111 00000 22222 01210 21012 10001 12221 00122 22100 12101 10121 01110 21112 01010 21212 '
  + '11011 11211 00200 22022 02220 20002 12021 10201 02020 20202 20120 02102 02120 20102 21001 '
  + '01221 00222 22000 10212 12010 01012 21210 12200 00112 22110 20000 02222 22220 00002 10101 '
  + '12121 01222 21000 01111 21111').split(' ').map((s) => [...s].map(Number));
export const BETS = [4, 10, 20, 50, 100, 500, 1000, 5000, 8000, 10000]; // çizgi başına
export const TIERS = ['colossal', 'mega', 'big', 'mini'];
// Şerit sembol adetleri (istemci ile birebir aynı: makara animasyonu bu dizilimle çizilir)
export const STRIP_COUNTS = [[6, 11, 9, 8, 5, 8, 2, 2, 3, 2, 4, 1], [9, 6, 6, 7, 7, 6, 4, 2, 5, 1, 5, 2], [7, 4, 6, 12, 6, 6, 4, 1, 4, 2, 6, 3], [8, 5, 10, 11, 7, 5, 3, 2, 6, 1, 2, 1], [11, 9, 8, 6, 5, 6, 4, 1, 5, 4, 1, 1]];

export function buildStrips(counts = STRIP_COUNTS) {
  return counts.map((cn, c) => {
    let a = [];
    cn.forEach((n, s) => { for (let i = 0; i < n; i++) a.push(s); });
    if (!a.length) a = [S10];
    let seed = 1234 + c * 977;
    const r = () => (seed = seed * 16807 % 2147483647) / 2147483647;
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    // aynı makarada iki FREE / iki Çark pencereye (3 hücre) düşmesin
    for (let pass = 0; pass < 6; pass++) for (let i = 0; i < a.length; i++) {
      if (a[i] !== SF && a[i] !== SH) continue;
      for (const d of [1, 2]) {
        const j = (i + d) % a.length;
        if (a[j] === a[i]) {
          for (let t = 0; t < a.length; t++) {
            const k = (j + 5 + t) % a.length;
            const ok = [-2, -1, 0, 1, 2].every((o) => a[(k + o + a.length) % a.length] !== a[i]);
            if (ok && a[k] !== SF && a[k] !== SH && a[k] !== SP) { [a[j], a[k]] = [a[k], a[j]]; break; }
          }
        }
      }
    }
    return a;
  });
}
export const STRIPS = buildStrips();

export const gridFrom = (stops, strips = STRIPS) => strips.map((st, c) => [0, 1, 2].map((k) => st[(stops[c] + k) % st.length]));

/** Izgarayı değerlendirir. lb = çizgi bahsi. */
export function evalGrid(g, lb, factor = 1) {
  const R = { win: 0, lines: [], cells: [], scat: [], free: 0, jp: -1, jpCells: [], wheel: [] };
  const cells = new Set();
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) { const s = g[c][r]; if (s === SF) R.scat.push(c + ',' + r); else if (s === SH) R.wheel.push(c + ',' + r); }
  for (let li = 0; li < NL; li++) {
    const ln = LINES[li], s = ln.map((r, c) => g[c][r]);
    if (s[0] === SP && s.every((x) => x === SP)) { if (R.jp < 0) { R.jp = li; R.jpCells = ln.map((r, c) => c + ',' + r); } continue; }
    let best = 0, bn = 0, bs = -1, wr = 0;
    while (wr < 5 && s[wr] === SW) wr++;
    if (wr >= 3) { best = PAY[SW][wr - 3] * lb; bn = wr; bs = SW; }
    let t = -1; for (const x of s) if (x !== SW) { t = x; break; }
    if (t >= 0 && t <= ST) {
      let n = 0; while (n < 5 && (s[n] === t || s[n] === SW)) n++;
      if (n >= 3 && PAY[t][n - 3] * lb > best) { best = PAY[t][n - 3] * lb; bn = n; bs = t; }
    }
    if (best > 0) best = Math.floor(best * factor);
    if (best > 0) { R.win += best; R.lines.push({ li, n: bn, sym: bs, amt: best }); for (let c = 0; c < bn; c++) cells.add(c + ',' + ln[c]); }
  }
  R.cells = [...cells];
  return R;
}

export const FREE_TABLE = { 3: 3, 4: 6, 5: 10 };
export const freeCount = (n) => (n < 3 ? 0 : n >= 5 ? FREE_TABLE[5] : FREE_TABLE[n]);

/** Tek spin (saf rastgele). */
export function spinOnce(lb, rand = randomInt, factor = 1) {
  const stops = STRIPS.map((s) => rand(s.length));
  const g = gridFrom(stops);
  const R = evalGrid(g, lb, factor);
  R.free = freeCount(R.scat.length);
  return { g, R, stops };
}

// ---- Çılgın Slot (koleksiyon bonusu) ----
export const CRZ_SYMS = ['x2', 'x3', 'x5', 'x10', 'x20', 'x50', '+1', 'blank'];
export const CRZ_MULT = { x2: 2, x3: 3, x5: 5, x10: 10, x20: 20, x50: 50 };
export const CRZ_WEIGHTS = [24, 18, 12, 7, 3, 1, 10, 25];
export const CRZ_LIVES = 3;
export const COLLECT_NEED = 20;
export function crzPick(rand = randomInt) {
  const t = CRZ_WEIGHTS.reduce((a, b) => a + b, 0);
  let x = rand(t * 1000) / 1000;
  for (let i = 0; i < CRZ_WEIGHTS.length; i++) { x -= CRZ_WEIGHTS[i]; if (x < 0) return CRZ_SYMS[i]; }
  return 'blank';
}
export function crzEval(res, base, factor = 1) {
  const ms = res.filter((k) => CRZ_MULT[k]);
  const extra = res.filter((k) => k === '+1').length;
  let gain = 0;
  if (ms.length === 3 && ms[0] === ms[1] && ms[1] === ms[2]) gain = base * CRZ_MULT[ms[0]];
  else { const c = {}; ms.forEach((k) => { c[k] = (c[k] || 0) + 1; }); for (const k in c) if (c[k] === 2) gain = Math.round(base * CRZ_MULT[k] * 0.25); }
  return { gain: Math.floor(gain * factor), extra };
}

// ---- Jackpot ----
export const JP_SHARES = { colossal: 70, mega: 15, big: 10, mini: 5 };
export const JP_MINS = { colossal: 500000, mega: 250000, big: 50000, mini: 5000 }; // toplam bahis (çizgi × 50)
export const tierFor = (total) => TIERS.find((k) => total >= JP_MINS[k]) || null;
// Düzenlenebilir ayarların varsayılanı
export const DEFAULT_SETTINGS = { enabled: true, mode: 'auto', rtp: 92, hit: 30, maxWinX: 500, freeChance: 0.4, jpChance: 0.01, payFactor: 1, contribPct: 1, jpFloor: 0, maxBetIdx: 9, gambleOn: true, gambleMax: 5, gambleWinPct: 50 };
// Çarpansız (payFactor = 1) teorik geri ödeme (simülasyondan): hat + free + çılgın slot ≈ %98,6
export const NATURAL_RTP = 98.6;
export const theoreticalRtp = (f, contribPct) => Math.round((NATURAL_RTP * f + contribPct) * 10) / 10;

// ---- Oyunun kendi kazanç kontrolü (orijinal oyundaki ayarlar: hedef RTP, isabet oranı, üst limit, free/jackpot şansı) ----
// mode 'auto' = bu kontrol; mode 'pure' = saf rastgele (BAL şeritleri).
export const DEF_STRIP_COUNTS = [[9, 12, 9, 8, 3, 7, 4, 1, 2, 1, 4, 1], [11, 7, 6, 8, 7, 5, 4, 1, 4, 1, 5, 1], [10, 6, 7, 10, 6, 5, 4, 1, 3, 2, 6, 1], [8, 6, 10, 10, 7, 4, 3, 1, 5, 1, 5, 1], [10, 7, 7, 6, 5, 5, 5, 1, 4, 3, 7, 1]];
const STRIP_CACHE = { auto: buildStrips(DEF_STRIP_COUNTS), pure: STRIPS };
export const stripCountsFor = (mode) => (mode === 'pure' ? STRIP_COUNTS : DEF_STRIP_COUNTS);
const rnd = (n, rand = randomInt) => rand(n);
function injectJP(g, rand) { LINES[rnd(NL, rand)].forEach((r, c) => { g[c][r] = SP; }); }
function injectFree(g, n, rand) {
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) if (g[c][r] === SF) g[c][r] = SQ;
  const cols = [0, 1, 2, 3, 4]; for (let i = cols.length - 1; i > 0; i--) { const j = rnd(i + 1, rand); [cols[i], cols[j]] = [cols[j], cols[i]]; }
  cols.slice(0, n).forEach((c) => { g[c][rnd(3, rand)] = SF; });
}
/** st = { wag, paid, spins, wins } (tüm oyuncular). Döner: { g, R, stops }. */
export function controlledSpin(lb, st, cfg, isFree, rand = randomInt) {
  const factor = cfg.payFactor ?? 1;
  const strips = cfg.mode === 'pure' ? STRIP_CACHE.pure : STRIP_CACHE.auto;
  const draw = () => { const stops = strips.map((s) => rnd(s.length, rand)); return { stops, g: gridFrom(stops, strips) }; };
  const total = lb * NL, tgt = cfg.rtp / 100, bank = tgt * st.wag - st.paid, cap = cfg.maxWinX * total;
  const evalR = (g) => { const R = evalGrid(g, lb, factor); R.free = freeCount(R.scat.length); return R; };
  if (cfg.mode === 'pure') { const { g, stops } = draw(); return { g, R: evalR(g), stops }; }
  const tier = tierFor(total), hitT = cfg.hit / 100, hitNow = st.spins > 30 ? st.wins / st.spins : hitT;
  const want = rand(10000) / 10000 < Math.min(0.97, Math.max(0.03, hitT + (hitT - hitNow) * 3)) ? 'win' : 'lose';
  const doJp = !!tier && rand(1e6) / 1e6 < cfg.jpChance / 100;
  const doFree = !isFree && rand(1e6) / 1e6 < cfg.freeChance / 100;
  const budget = Math.min(cap, Math.max(total * 0.8, bank + total * 2));
  const cand = []; let lose = null, last = null;
  for (let i = 0; i < 320; i++) {
    const { g, stops } = draw();
    if (doJp) injectJP(g, rand);
    if (doFree) injectFree(g, [3, 3, 3, 3, 4, 4, 5][rnd(7, rand)], rand);
    const R = evalR(g); const o = { g, R, stops }; last = o;
    if (R.jp >= 0 && !doJp) continue;
    if (R.win > cap) continue;
    if (R.win === 0 && R.free === 0 && R.jp < 0 && !lose) lose = o;
    if (doJp || doFree) { if (R.win <= budget || i > 60) return o; continue; }
    if (R.free > 0) { if (want !== 'lose' && bank > total * 8 && rand(2) === 0) return o; continue; }
    if (want === 'lose') { if (R.win === 0) return o; continue; }
    if (R.win > 0 && R.win <= budget) { cand.push(o); if (cand.length >= (bank > total * 5 ? 12 : 1)) break; }
  }
  if (cand.length) { if (bank > total * 5 && rand(100) < 55) { cand.sort((a, b) => b.R.win - a.R.win); return cand[0]; } return cand[rnd(cand.length, rand)]; }
  return lose || last;
}
