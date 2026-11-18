// Wild King slotu (gömülü, sunucu otoriter): sonuç, bakiye, free spin, jackpot, Çılgın Slot ve kart kumarı sunucuda.
// İstemci /g/wild/ altından sunulur; API /api/wildking/* (oyun bileti + etkinlik izni). Bakiye bizim Coin'imizdir.
import fs from 'node:fs';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import { query, tx } from '../database.js';
import { requireAuth, requireSuperAdmin } from '../auth.js';
import { fail } from '../http.js';
import { userLimit } from '../firewall.js';
import { hub } from '../realtime.js';
import { readGameTokenAny, canSeeActivities } from '../routes/activities.js';
import * as E from './wild/engine.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'wild', 'client');

// ---------------------------------------------------------------- Ayarlar (game_kv, 10 sn önbellek)
let settingsCache = { at: 0, v: { ...E.DEFAULT_SETTINGS } };
export async function wildSettings() {
  if (Date.now() - settingsCache.at < 10000) return settingsCache.v;
  const r = (await query(`SELECT value FROM game_kv WHERE key = 'wild_settings'`).catch(() => ({ rows: [] }))).rows[0];
  settingsCache = { at: Date.now(), v: { ...E.DEFAULT_SETTINGS, ...(r?.value ?? {}) } };
  return settingsCache.v;
}
function readSettings(b) {
  const num = (v, lo, hi, name) => { const n = Number(v); if (!Number.isFinite(n) || n < lo || n > hi) throw fail(`${name}: ${lo}–${hi} arasında olmalı.`); return n; };
  const out = {};
  if (b.enabled !== undefined) out.enabled = b.enabled === true;
  if (b.mode !== undefined) { if (b.mode !== 'auto' && b.mode !== 'pure') throw fail('Mod geçersiz.'); out.mode = b.mode; }
  if (b.rtp !== undefined) out.rtp = num(b.rtp, 50, 120, 'Hedef RTP');
  if (b.hit !== undefined) out.hit = num(b.hit, 5, 90, 'İsabet oranı');
  if (b.maxWinX !== undefined) out.maxWinX = num(b.maxWinX, 10, 5000, 'En yüksek kazanç (× bahis)');
  if (b.freeChance !== undefined) out.freeChance = num(b.freeChance, 0, 10, 'Free spin şansı');
  if (b.jpChance !== undefined) out.jpChance = num(b.jpChance, 0, 5, 'Jackpot şansı');
  if (b.payFactor !== undefined) out.payFactor = num(b.payFactor, 0.5, 1, 'Ödeme çarpanı');
  if (b.contribPct !== undefined) out.contribPct = num(b.contribPct, 0, 5, 'Havuz payı');
  if (b.jpFloor !== undefined) out.jpFloor = Math.floor(num(b.jpFloor, 0, 1e12, 'Havuz tabanı'));
  if (b.maxBetIdx !== undefined) out.maxBetIdx = Math.floor(num(b.maxBetIdx, 0, E.BETS.length - 1, 'En yüksek bahis'));
  if (b.gambleOn !== undefined) out.gambleOn = b.gambleOn === true;
  if (b.gambleMax !== undefined) out.gambleMax = Math.floor(num(b.gambleMax, 1, 8, 'Kumar turu'));
  if (b.gambleWinPct !== undefined) out.gambleWinPct = num(b.gambleWinPct, 0, 100, 'Kumar kazanma %');
  return out;
}

// ---------------------------------------------------------------- Yardımcılar
const SUITS = { r: ['♥', '♦'], b: ['♠', '♣'] };
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const pick = (a) => a[randomInt(a.length)];
const big = (v) => BigInt(v ?? 0);

async function lockState(c, userId) {
  await c.query(`INSERT INTO wild_king_state(user_id) VALUES($1) ON CONFLICT DO NOTHING`, [userId]);
  const u = (await c.query(`SELECT coins FROM users WHERE id = $1 AND account_status = 'active' FOR UPDATE`, [userId])).rows[0];
  if (!u) throw fail('Kullanıcı bulunamadı.', 404);
  const st = (await c.query(`SELECT * FROM wild_king_state WHERE user_id = $1 FOR UPDATE`, [userId])).rows[0];
  return { coins: big(u.coins), st };
}
async function ledger(c, userId, type, amount, ref, label) {
  await c.query(`UPDATE users SET coins = coins + $2, updated_at = NOW() WHERE id = $1`, [userId, amount.toString()]);
  await c.query(`INSERT INTO wallet_transactions(user_id, transaction_type, coin_amount, reference_id, description) VALUES($1,$2,$3,$4,$5)`, [userId, type, amount.toString(), ref, label]);
}
const freeView = (st) => ({ left: st.free_left, total: Number(st.free_total), bet: st.free_bet });
const notifyWallet = (userId, coins) => hub.sendToUser(userId, { type: 'wallet', coins: String(coins) });

async function winners() {
  const rows = (await query(
    `SELECT s.jp_tier, s.jp_amount, s.created_at, COALESCE(u.display_name, u.username) AS name
       FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY jp_tier ORDER BY id DESC) AS rn FROM wild_king_spins WHERE jp_tier IS NOT NULL) s
       JOIN users u ON u.id = s.user_id WHERE s.rn <= 5 ORDER BY s.id DESC`,
  )).rows;
  const out = { colossal: [], mega: [], big: [], mini: [] };
  for (const r of rows) out[r.jp_tier]?.push({ n: r.name, a: Number(r.jp_amount), t: new Date(r.created_at).getTime() });
  return out;
}
async function feed() {
  const rows = (await query(
    `SELECT s.id, s.win, s.jp_tier, s.top_sym, COALESCE(u.display_name, u.username) AS name
       FROM wild_king_spins s JOIN users u ON u.id = s.user_id WHERE s.win >= 20000 AND s.created_at > NOW() - INTERVAL '1 hour' ORDER BY s.id DESC LIMIT 6`,
  )).rows;
  return rows.reverse().map((r) => ({ id: Number(r.id), name: r.name, amt: Number(r.win), sym: r.jp_tier ? E.SP : (r.top_sym ?? E.SA) }));
}
async function poolView() {
  const p = (await query(`SELECT total FROM wild_king_pool WHERE id = 1`)).rows[0];
  return { total: Number(p?.total ?? 0), shares: E.JP_SHARES, mins: E.JP_MINS };
}

/** Açık kart kumarı / çıkış yapılmış oyun: kumardaki bahis oyuncuya iade edilir (bağlantı kopmasında kayıp olmasın). */
async function settleOpenGamble(c, userId, st) {
  const g = st.gamble;
  if (!g) return st;
  const stake = big(g.stake);
  if (stake > 0n) {
    await ledger(c, userId, 'activity_win', stake, `wildking:gamble:${Date.now()}`, 'Wild King kumar toplama');
    await c.query(`UPDATE wild_king_pool SET paid = paid + $1 WHERE id = 1`, [stake.toString()]);
  }
  await c.query(`UPDATE wild_king_state SET gamble = NULL, updated_at = NOW() WHERE user_id = $1`, [userId]);
  return { ...st, gamble: null };
}

// ---------------------------------------------------------------- Yönlendirici
export const wildRouter = Router();

wildRouter.use(async (req, _res, next) => {
  const m = /^Bearer (.+)$/.exec(req.get('authorization') ?? '');
  const t = m ? readGameTokenAny(m[1]) : null;
  if (!t) throw fail('Oyun bileti geçersiz ya da süresi doldu. Oyunu kapatıp yeniden açın.', 401);
  const item = (await query(`SELECT id FROM activity_items WHERE id = $1 AND enabled AND link_url LIKE '%/g/wild/%'`, [t.activityId])).rows[0];
  if (!item) throw fail('Bu oyun şu an kapalı.', 403);
  if (!(await canSeeActivities(t.userId))) throw fail('Bu oyun için izniniz yok.', 403);
  req.wk = { userId: t.userId };
  next();
});

wildRouter.get('/state', userLimit('wk_state', 60, 60e3), async (req, res) => {
  const { userId } = req.wk;
  const cfg = await wildSettings();
  const out = await tx(async (c) => {
    let { coins, st } = await lockState(c, userId);
    if (st.gamble) {
      st = await settleOpenGamble(c, userId, st);
      coins = big((await c.query(`SELECT coins FROM users WHERE id = $1`, [userId])).rows[0].coins);
    }
    return { coins, st };
  });
  const { st, coins } = out;
  res.json({
    balance: Number(coins), free: freeView(st), prog: st.prog, tickets: st.tickets, ticketBets: st.ticket_bets,
    crazy: st.crazy ?? null, stops: st.stops ?? null,
    jackpot: await poolView(), winners: await winners(), feed: await feed(),
    config: { enabled: cfg.enabled, payFactor: cfg.payFactor, maxBetIdx: cfg.maxBetIdx, gambleOn: cfg.gambleOn, gambleMax: cfg.gambleMax,
      mode: cfg.mode, strips: E.stripCountsFor(cfg.mode), rtp: cfg.mode === 'pure' ? E.theoreticalRtp(cfg.payFactor, cfg.contribPct) : cfg.rtp, collectNeed: E.COLLECT_NEED, crzLives: E.CRZ_LIVES, bets: E.BETS },
  });
});

wildRouter.get('/pool', userLimit('wk_pool', 30, 60e3), async (_req, res) => {
  res.json({ jackpot: await poolView(), winners: await winners(), feed: await feed() });
});

wildRouter.post('/spin', userLimit('wk_spin', 240, 60e3), async (req, res) => {
  const { userId } = req.wk;
  const cfg = await wildSettings();
  if (!cfg.enabled) throw fail('Oyun şu an kapalı.', 503);
  const betIdx = Number(req.body?.betIdx);
  const out = await tx(async (c) => {
    const { coins, st } = await lockState(c, userId);
    if (st.crazy) throw fail('Önce Çılgın Slot bonusunu bitirin.', 409);
    if (st.gamble) throw fail('Önce kart kumarını bitirin.', 409);
    const isFree = st.free_left > 0;
    let lb;
    if (isFree) lb = st.free_bet;
    else {
      if (!Number.isInteger(betIdx) || betIdx < 0 || betIdx > cfg.maxBetIdx) throw fail('Bahis geçersiz.', 400);
      lb = E.BETS[betIdx];
    }
    const total = lb * E.NL;
    let bal = coins;
    const wag = isFree ? 0 : total;
    if (!isFree) {
      if (bal < BigInt(total)) throw fail('Yetersiz bakiye.', 402);
      bal -= BigInt(total);
    }
    const stat = (await c.query(`SELECT wag, paid, spins, wins FROM wild_king_pool WHERE id = 1`)).rows[0];
    const { g, R, stops } = E.controlledSpin(lb, { wag: Number(stat.wag), paid: Number(stat.paid), spins: Number(stat.spins), wins: Number(stat.wins) }, cfg, isFree);
    // jackpot: yalnızca bahsin tabaka alt sınırı varsa ve havuz varsa
    let jp = null;
    const pool = (await c.query(`SELECT total FROM wild_king_pool WHERE id = 1 FOR UPDATE`)).rows[0];
    let poolTotal = BigInt(pool.total);
    const contrib = isFree ? 0n : BigInt(Math.floor(total * cfg.contribPct / 100));
    poolTotal += contrib;
    if (R.jp >= 0) {
      const tier = E.tierFor(total);
      if (tier) {
        const share = poolTotal * BigInt(E.JP_SHARES[tier]) / 100n;
        const amt = share * BigInt(randomInt(40, 101)) / 100n;
        if (amt > 0n) { jp = { k: tier, amt: Number(amt) }; poolTotal -= amt; }
        if (poolTotal < BigInt(cfg.jpFloor)) poolTotal = BigInt(cfg.jpFloor);
      }
    }
    const win = BigInt(R.win) + BigInt(jp?.amt ?? 0);
    bal += win;
    // koleksiyon / free
    let { prog, tickets } = st; const ticketBets = [...st.ticket_bets];
    prog += R.wheel.length;
    if (prog >= E.COLLECT_NEED) { prog -= E.COLLECT_NEED; tickets += 1; ticketBets.push(total); }
    let free = { left: st.free_left, total: Number(st.free_total), bet: st.free_bet };
    if (isFree) free.left -= 1;
    if (R.free > 0) { if (!isFree) free = { left: 0, total: 0, bet: lb }; free.left += R.free; }
    if (isFree) free.total += Number(win);
    const gambleAvail = (cfg.gambleOn && !isFree && !jp && !R.free && R.win > 0 && R.win >= total) ? R.win : 0;
    const topSym = R.lines.length ? R.lines.slice().sort((a, b) => b.amt - a.amt)[0].sym : null;

    await c.query(`UPDATE users SET coins = $2, updated_at = NOW() WHERE id = $1`, [userId, bal.toString()]);
    if (wag > 0) await c.query(`INSERT INTO wallet_transactions(user_id, transaction_type, coin_amount, reference_id, description) VALUES($1,'activity_spend',$2,$3,'Wild King bahsi')`, [userId, (-wag).toString(), 'wildking:spin']);
    if (win > 0n) await c.query(`INSERT INTO wallet_transactions(user_id, transaction_type, coin_amount, reference_id, description) VALUES($1,'activity_win',$2,$3,$4)`, [userId, win.toString(), 'wildking:spin', jp ? 'Wild King jackpot' : 'Wild King kazancı']);
    await c.query(`UPDATE wild_king_state SET free_left=$2, free_total=$3, free_bet=$4, prog=$5, tickets=$6, ticket_bets=$7, gamble_avail=$8, stops=$9, updated_at=NOW() WHERE user_id=$1`,
      [userId, free.left, free.total, free.bet, prog, tickets, JSON.stringify(ticketBets), gambleAvail, JSON.stringify(stops)]);
    await c.query(`UPDATE wild_king_pool SET total = $1, wag = wag + $2, paid = paid + $3, jp_paid = jp_paid + $4, spins = spins + 1, wins = wins + $5 WHERE id = 1`,
      [poolTotal.toString(), wag, R.win, jp?.amt ?? 0, R.win > 0 ? 1 : 0]);
    await c.query(`INSERT INTO wild_king_spins(user_id, bet, win, jp_tier, jp_amount, is_free, top_sym) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [userId, wag, win.toString(), jp?.k ?? null, jp?.amt ?? 0, isFree, topSym]);
    return {
      balance: Number(bal), win: Number(win), isFree, total, g, stops, R, jp, free, prog, tickets, ticketBets, gambleAvail,
      pool: Number(poolTotal), mode: cfg.mode,
    };
  });
  notifyWallet(userId, out.balance);
  res.json({
    balance: out.balance, win: out.win, isFree: out.isFree, total: out.total, g: out.g, stops: out.stops, R: out.R, jp: out.jp,
    free: out.free, prog: out.prog, tickets: out.tickets, ticketBets: out.ticketBets, gambleAvail: out.gambleAvail, pool: out.pool, mode: out.mode,
  });
});

// ---------------- Çılgın Slot
wildRouter.post('/crazy/open', userLimit('wk_crazy', 60, 60e3), async (req, res) => {
  const { userId } = req.wk;
  const out = await tx(async (c) => {
    const { coins, st } = await lockState(c, userId);
    if (st.crazy) return { st, coins, resumed: true };
    if (st.free_left > 0 || st.gamble) throw fail('Şu an açılamaz.', 409);
    if (st.tickets <= 0) throw fail(`${E.COLLECT_NEED} çark sembolü topla, Çılgın Slot açılsın.`, 409);
    const ticketBets = [...st.ticket_bets];
    const base = Number(ticketBets.shift() ?? E.BETS[0] * E.NL);
    const crazy = { lives: E.CRZ_LIVES, base, win: 0, cur: ['x2', 'x5', 'x10'] };
    await c.query(`UPDATE wild_king_state SET tickets = tickets - 1, ticket_bets = $2, crazy = $3, updated_at = NOW() WHERE user_id = $1`, [userId, JSON.stringify(ticketBets), JSON.stringify(crazy)]);
    return { st: { ...st, tickets: st.tickets - 1, ticket_bets: ticketBets, crazy }, coins };
  });
  res.json({ tickets: out.st.tickets, ticketBets: out.st.ticket_bets, ...out.st.crazy, resumed: !!out.resumed });
});

wildRouter.post('/crazy/spin', userLimit('wk_crazy', 120, 60e3), async (req, res) => {
  const { userId } = req.wk;
  const cfg = await wildSettings();
  const out = await tx(async (c) => {
    const { coins, st } = await lockState(c, userId);
    const z = st.crazy;
    if (!z || z.lives <= 0) throw fail('Açık Çılgın Slot yok.', 409);
    const lives0 = z.lives - 1;
    const resSyms = [E.crzPick(), E.crzPick(), E.crzPick()];
    const { gain, extra } = E.crzEval(resSyms, z.base, cfg.payFactor);
    const next = { ...z, lives: lives0 + extra, win: z.win + gain, cur: resSyms };
    const done = next.lives <= 0;
    let bal = coins;
    if (done) {
      if (next.win > 0) { await ledger(c, userId, 'activity_win', BigInt(next.win), 'wildking:crazy', 'Wild King Çılgın Slot kazancı'); bal += BigInt(next.win); }
      await c.query(`UPDATE wild_king_pool SET paid = paid + $1 WHERE id = 1`, [next.win]);
      await c.query(`UPDATE wild_king_state SET crazy = NULL, updated_at = NOW() WHERE user_id = $1`, [userId]);
    } else {
      await c.query(`UPDATE wild_king_state SET crazy = $2, updated_at = NOW() WHERE user_id = $1`, [userId, JSON.stringify(next)]);
    }
    return { res: resSyms, gain, extra, lives: next.lives, win: next.win, done, balance: Number(bal) };
  });
  if (out.done && out.win > 0) notifyWallet(userId, out.balance);
  res.json(out);
});

// ---------------- Kart kumarı (ikiye katla; adil %50, ayar panelden)
wildRouter.post('/gamble/start', userLimit('wk_gamble', 60, 60e3), async (req, res) => {
  const { userId } = req.wk;
  const cfg = await wildSettings();
  const out = await tx(async (c) => {
    const { coins, st } = await lockState(c, userId);
    if (!cfg.gambleOn) throw fail('Kart kumarı kapalı.', 409);
    if (st.gamble || st.crazy || st.free_left > 0) throw fail('Şu an açılamaz.', 409);
    const avail = Number(st.gamble_avail);
    if (avail <= 0 || coins < BigInt(avail)) throw fail('Kumar fırsatı yok.', 409);
    await ledger(c, userId, 'activity_spend', BigInt(-avail), 'wildking:gamble', 'Wild King kumara koyulan kazanç');
    const g = { stake: avail, base: avail, round: 0 };
    await c.query(`UPDATE wild_king_state SET gamble = $2, gamble_avail = 0, updated_at = NOW() WHERE user_id = $1`, [userId, JSON.stringify(g)]);
    await c.query(`UPDATE wild_king_pool SET paid = paid - $1 WHERE id = 1`, [avail]);
    return { stake: avail, balance: Number(coins - BigInt(avail)), max: cfg.gambleMax };
  });
  notifyWallet(userId, out.balance);
  res.json(out);
});

wildRouter.post('/gamble/pick', userLimit('wk_gamble', 120, 60e3), async (req, res) => {
  const { userId } = req.wk;
  const cfg = await wildSettings();
  const color = req.body?.color;
  if (color !== 'r' && color !== 'b') throw fail('Renk geçersiz.', 400);
  const out = await tx(async (c) => {
    const { coins, st } = await lockState(c, userId);
    const g = st.gamble;
    if (!g) throw fail('Açık kumar yok.', 409);
    const ok = randomInt(10000) < Math.round(cfg.gambleWinPct * 100);
    const cc = ok ? color : (color === 'r' ? 'b' : 'r');
    const card = { c: cc, s: pick(SUITS[cc]), rk: pick(RANKS) };
    if (!ok) {
      await c.query(`UPDATE wild_king_state SET gamble = NULL, updated_at = NOW() WHERE user_id = $1`, [userId]);
      return { win: false, card, stake: 0, round: g.round, done: true, balance: Number(coins) };
    }
    const next = { ...g, stake: g.stake * 2, round: g.round + 1 };
    if (next.round >= cfg.gambleMax) {
      await ledger(c, userId, 'activity_win', BigInt(next.stake), 'wildking:gamble', 'Wild King kumar kazancı');
      await c.query(`UPDATE wild_king_pool SET paid = paid + $1 WHERE id = 1`, [next.stake]);
      await c.query(`UPDATE wild_king_state SET gamble = NULL, updated_at = NOW() WHERE user_id = $1`, [userId]);
      return { win: true, card, stake: next.stake, round: next.round, done: true, balance: Number(coins + BigInt(next.stake)) };
    }
    await c.query(`UPDATE wild_king_state SET gamble = $2, updated_at = NOW() WHERE user_id = $1`, [userId, JSON.stringify(next)]);
    return { win: true, card, stake: next.stake, round: next.round, done: false, balance: Number(coins) };
  });
  if (out.done) notifyWallet(userId, out.balance);
  res.json(out);
});

wildRouter.post('/gamble/take', userLimit('wk_gamble', 60, 60e3), async (req, res) => {
  const { userId } = req.wk;
  const out = await tx(async (c) => {
    const { coins, st } = await lockState(c, userId);
    if (!st.gamble) return { balance: Number(coins), stake: 0 };
    const stake = BigInt(st.gamble.stake);
    if (stake > 0n) {
      await ledger(c, userId, 'activity_win', stake, 'wildking:gamble', 'Wild King kumar toplama');
      await c.query(`UPDATE wild_king_pool SET paid = paid + $1 WHERE id = 1`, [stake.toString()]);
    }
    await c.query(`UPDATE wild_king_state SET gamble = NULL, updated_at = NOW() WHERE user_id = $1`, [userId]);
    return { balance: Number(coins + stake), stake: Number(stake) };
  });
  if (out.stake > 0) notifyWallet(userId, out.balance);
  res.json(out);
});

// ---------------------------------------------------------------- İstemci dosyaları (/g/wild/*)
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
export const wildClientRouter = Router();
wildClientRouter.use((_req, res, next) => {
  res.set({
    'Content-Security-Policy': "default-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-cache',
  });
  next();
});
wildClientRouter.get(/^\/(?:index\.html)?$/, (_req, res) => res.type(MIME['.html']).send(fs.readFileSync(path.join(DIR, 'index.html'))));
wildClientRouter.get(/^\/([\w-]+\.(?:js|css))$/, (req, res) => {
  const file = path.join(DIR, req.params[0]);
  if (!file.startsWith(DIR + path.sep) || !fs.existsSync(file)) return res.status(404).end();
  res.type(MIME[path.extname(file)]).send(fs.readFileSync(file));
});

// ---------------------------------------------------------------- Yönetim (/api/admin/wildking)
export const wildAdminRouter = Router();
wildAdminRouter.use(requireAuth, requireSuperAdmin);
wildAdminRouter.get('/', async (_req, res) => {
  const cfg = await wildSettings();
  const p = (await query(`SELECT * FROM wild_king_pool WHERE id = 1`)).rows[0];
  const day = (await query(`SELECT COUNT(*)::int AS spins, COALESCE(SUM(bet),0) AS wag, COALESCE(SUM(win),0) AS paid, COUNT(DISTINCT user_id)::int AS players
                              FROM wild_king_spins WHERE created_at > NOW() - INTERVAL '24 hours'`)).rows[0];
  const wag = Number(p.wag), paid = Number(p.paid);
  res.json({
    settings: cfg, theoreticalRtp: cfg.mode === 'pure' ? E.theoreticalRtp(cfg.payFactor, cfg.contribPct) : cfg.rtp,
    pool: Number(p.total), total: { wag, paid, jpPaid: Number(p.jp_paid), spins: Number(p.spins), profit: wag - paid, rtp: wag ? paid / wag : null },
    day: { spins: day.spins, wag: Number(day.wag), paid: Number(day.paid), players: day.players },
  });
});
wildAdminRouter.put('/settings', async (req, res) => {
  const patch = readSettings(req.body ?? {});
  const next = { ...(await wildSettings()), ...patch };
  await query(`INSERT INTO game_kv(key, value, updated_at) VALUES('wild_settings',$1,NOW()) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`, [JSON.stringify(next)]);
  settingsCache = { at: Date.now(), v: next };
  res.json({ ok: true, settings: next });
});
