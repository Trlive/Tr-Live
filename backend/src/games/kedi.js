// Kedi Çarkı (gömülü, sunucu otoriter çok oyunculu çark).
// Oyun motoru (game-core.cjs) bu sunucuda çalışır; bakiye bizim Coin'imizdir. İstemci /g/kedi/ altından sunulur,
// WebSocket /ws/kedi'dir. Giriş: etkinliğin oyun bileti + etkinlik izni (canSeeActivities).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import { WebSocketServer } from 'ws';
import { query, tx } from '../database.js';
import { requireAuth, requireSuperAdmin } from '../auth.js';
import { fail } from '../http.js';
import { hub, registerWsRoute } from '../realtime.js';
import { readGameTokenAny, canSeeActivities } from '../routes/activities.js';

const require = createRequire(import.meta.url);
const G = require('./kedi/game-core.cjs');
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'kedi');
const CLIENT = path.join(DIR, 'client');

// ---------------------------------------------------------------- Coin cüzdanı (idempotent)
export class CoinWallet {
  async balance(userId) {
    const r = await query(`SELECT coins FROM users WHERE id = $1`, [userId]);
    return Number(r.rows[0]?.coins ?? 0);
  }
  debit(userId, amount, txId, meta) { return this.#move(userId, -Math.floor(Number(amount)), txId, meta, 'activity_spend', 'Kedi Çarkı bahsi'); }
  credit(userId, amount, txId, meta) { return this.#move(userId, Math.floor(Number(amount)), txId, meta, 'activity_win', 'Kedi Çarkı kazancı'); }

  async #move(userId, delta, txId, meta, type, label) {
    if (!Number.isFinite(delta)) return { ok: false, error: 'BAD_AMOUNT' };
    const amt = BigInt(delta);
    const out = await tx(async (c) => {
      const u = (await c.query(`SELECT coins FROM users WHERE id = $1 AND account_status = 'active' FOR UPDATE`, [userId])).rows[0];
      if (!u) return { ok: false, error: 'NO_USER', balance: 0 };
      const old = (await c.query(`SELECT balance_after FROM game_wallet_tx WHERE tx_id = $1`, [String(txId)])).rows[0];
      if (old) return { ok: true, balance: Number(old.balance_after), dup: true };
      const before = BigInt(u.coins);
      const after = before + amt;
      if (after < 0n) return { ok: false, error: 'INSUFFICIENT_FUNDS', balance: Number(before) };
      if (amt === 0n) return { ok: true, balance: Number(before) };
      await c.query(`UPDATE users SET coins = $2, updated_at = NOW() WHERE id = $1`, [userId, after.toString()]);
      await c.query(`INSERT INTO game_wallet_tx(tx_id, user_id, delta, balance_after) VALUES($1,$2,$3,$4)`, [String(txId), userId, amt.toString(), after.toString()]);
      await c.query(
        `INSERT INTO wallet_transactions(user_id, transaction_type, coin_amount, reference_id, description) VALUES($1,$2,$3,$4,$5)`,
        [userId, type, amt.toString(), String(txId).slice(0, 120), label],
      );
      await c.query(
        `INSERT INTO financial_audit_logs(user_id, action, reference_type, reference_id, amount_coins, balance_before, balance_after, metadata)
         VALUES($1,$2,'game_round',$3,$4,$5,$6,$7)`,
        [userId, type === 'activity_spend' ? 'activity_bet' : 'activity_win', String(txId).slice(0, 120), amt.toString(), before.toString(), after.toString(), JSON.stringify({ game: 'kedi-carki', ...(meta ?? {}) })],
      );
      return { ok: true, balance: Number(after), changed: true };
    });
    if (out.changed) hub.sendToUser(userId, { type: 'wallet', coins: String(out.balance) });
    return out.changed ? { ok: true, balance: out.balance } : out;
  }
}

// ---------------------------------------------------------------- Kalıcılık (game_kv)
const kvGet = async (key) => (await query(`SELECT value FROM game_kv WHERE key = $1`, [key])).rows[0]?.value ?? null;
const kvSet = (key, value) => query(
  `INSERT INTO game_kv(key, value, updated_at) VALUES($1,$2,NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
  [key, JSON.stringify(value)],
);

// ---------------------------------------------------------------- Motor + WebSocket
let engine = null;
let ready = false;
const connsPerUser = new Map();
const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
registerWsRoute('/ws/kedi', wss);

const authFail = (ws, code, detail) => {
  try { ws.send(JSON.stringify({ type: 'error', error: 'AUTH_FAILED', detail })); } catch { /* kapalı */ }
  ws.close(code, 'auth');
};

wss.on('connection', async (ws, req) => {
  ws.on('error', () => {});
  if (!ready) return ws.close(1013, 'starting');
  // Bilet + izin doğrulaması bitene kadar gelen mesajlar tutulur
  const queue = [];
  let session = null;
  ws.on('message', (raw) => { if (!session) { if (queue.length < 5) queue.push(raw); } else onMessage(raw); });
  let bucket = 15, last = Date.now();
  const send = (m) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m)); };
  function onMessage(raw) {
    const now = Date.now();
    bucket = Math.min(15, bucket + ((now - last) / 1000) * 15); last = now;
    if (bucket < 1) return send({ type: 'error', error: 'RATE_LIMIT' });
    bucket -= 1;
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg.type !== 'string') return;
    session.handle(msg);
  }
  let user;
  try {
    const url = new URL(req.url, 'http://x');
    const t = readGameTokenAny(url.searchParams.get('token'));
    if (!t) return authFail(ws, 4001, 'BAD_TOKEN');
    const item = (await query(`SELECT id FROM activity_items WHERE id = $1 AND enabled AND link_url LIKE '%/g/kedi/%'`, [t.activityId])).rows[0];
    if (!item) return authFail(ws, 4001, 'NO_ACTIVITY');
    if (!(await canSeeActivities(t.userId))) return authFail(ws, 4001, 'NO_PERMISSION');
    const u = (await query(`SELECT id, display_name, username, avatar_url FROM users WHERE id = $1 AND account_status = 'active'`, [t.userId])).rows[0];
    if (!u) return authFail(ws, 4001, 'NO_USER');
    user = { id: String(u.id), name: String(u.display_name || u.username || 'Oyuncu').slice(0, 24), avatar: u.avatar_url && /^(https:|\/)/.test(u.avatar_url) ? u.avatar_url : null, anon: false };
  } catch (e) {
    return authFail(ws, 4001, 'AUTH_ERROR');
  }
  if (ws.readyState !== ws.OPEN) return;
  const prev = connsPerUser.get(user.id);
  if (prev && prev.readyState === prev.OPEN) prev.close(4002, 'replaced');
  connsPerUser.set(user.id, ws);
  session = G.createSession(engine, user, send);
  for (const raw of queue.splice(0)) onMessage(raw);
  const alive = setInterval(() => { if (ws.readyState === ws.OPEN) ws.ping(); }, 25000);
  ws.on('close', () => {
    clearInterval(alive);
    session.close();
    if (connsPerUser.get(user.id) === ws) connsPerUser.delete(user.id);
  });
});

export async function startKedi() {
  const wallet = new CoinWallet();
  engine = new G.RoundEngine({ config: {}, wallet, log: (...a) => console.error('[kedi]', ...a) });
  engine.importState(await kvGet('kedi_state'));
  const saved = await kvGet('kedi_settings');
  if (saved) { try { engine.updateConfig(saved); } catch (e) { console.error('[kedi] ayarlar yüklenemedi:', e.message); } }
  const persist = async () => {
    if (!engine.dirty) return;
    engine.dirty = false;
    try { await kvSet('kedi_state', engine.exportState()); } catch (e) { engine.dirty = true; console.error('[kedi] durum yazılamadı:', e.message); }
  };
  const t1 = setInterval(() => persist(), 5000);
  const t2 = setInterval(() => { if (engine.unpaid.size) engine.retryUnpaid().catch(() => {}); }, 30000);
  t1.unref(); t2.unref();
  engine.start();
  ready = true;
  return { stop: async () => { clearInterval(t1); clearInterval(t2); engine.stop(); engine.dirty = true; await persist(); } };
}

// ---------------------------------------------------------------- İstemci dosyaları (/g/kedi/*)
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
export const kediClientRouter = Router();
kediClientRouter.use((req, res, next) => {
  const host = req.get('host') ?? '';
  res.set({
    'Content-Security-Policy': `default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' wss://${host} ws://${host}; base-uri 'self'; form-action 'none'; frame-ancestors 'none'`,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-cache',
  });
  next();
});
kediClientRouter.get('/shared/game-core.js', (_req, res) => res.type('text/javascript; charset=utf-8').send(fs.readFileSync(path.join(DIR, 'game-core.cjs'))));
kediClientRouter.get(/^\/(?:index\.html)?$/, (_req, res) => res.type(MIME['.html']).send(fs.readFileSync(path.join(CLIENT, 'index.html'))));
kediClientRouter.get(/^\/(css|js)\/([\w.-]+)$/, (req, res) => {
  const file = path.join(CLIENT, req.params[0], req.params[1]);
  if (!file.startsWith(CLIENT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.status(404).end();
  res.type(MIME[path.extname(file)] || 'application/octet-stream').send(fs.readFileSync(file));
});

// ---------------------------------------------------------------- Yönetim (/api/admin/kedi)
export const kediAdminRouter = Router();
kediAdminRouter.use(requireAuth, requireSuperAdmin);
const need = () => { if (!engine) throw fail('Oyun henüz başlamadı.', 503); return engine; };
kediAdminRouter.get('/', (_req, res) => {
  const e = need();
  res.json({ online: connsPerUser.size, ...e.adminOverview(), players: e.playersReport(50).map((p) => ({ ...p, online: connsPerUser.has(p.id) })) });
});
kediAdminRouter.put('/settings', async (req, res) => {
  const e = need();
  let settings;
  try { settings = e.updateConfig(req.body ?? {}); } catch (err) { throw fail(err.message, 400); }
  await kvSet('kedi_settings', e.editableConfig());
  res.json({ ok: true, settings });
});
kediAdminRouter.post('/reset-control', (_req, res) => { need().resetControl(); res.json({ ok: true }); });
kediAdminRouter.post('/retry-unpaid', async (_req, res) => { res.json({ ok: true, ...(await need().retryUnpaid()) }); });
