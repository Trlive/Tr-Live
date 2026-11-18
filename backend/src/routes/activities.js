import crypto from 'node:crypto';
import { Router } from 'express';
import { query, tx } from '../database.js';
import { requireAuth, requireSuperAdmin } from '../auth.js';
import { userLimit, ipLimit } from '../firewall.js';
import { fail, text, uuid, assetUrl, oneOf } from '../http.js';
import { jwtSecret } from '../config.js';
import { hub } from '../realtime.js';

// ---------------------------------------------------------------------------------------------------------------
// Etkinlikler (v2.124): yönetici yalnızca BAĞLANTI yapıştırır; uygulama o bağlantıyı açar.
//
// Bağlantıda kullanılabilecek yer tutucular (açılırken doldurulur):
//   {uid} iç kullanıcı kimliği · {publicId} uygulamadaki ID · {name} ad · {avatar} fotoğraf adresi · {lang} dil (tr/en/ar/hi)
//   {roomId} açıldığı oda · {token} 2 saatlik oyun bileti (yalnızca bu etkinlik için) · {ts} zaman (sn)
//
// Coin'li H5 oyun sağlayıcısı için sunucu-sunucu API'si (etkinlikte "imza anahtarı" doluysa açık):
//   POST /api/activity-provider/:activityId/user     { token, ts, sign }
//   POST /api/activity-provider/:activityId/balance  { token, orderId, amount, reason?, ts, sign }
//     sign = hex( HMAC-SHA256( imzaAnahtarı, `${activityId}|${ts}|${token}|${orderId ?? ''}|${amount ?? ''}` ) )
//     ts: saniye; ±5 dk geçerli. amount: tam sayı Coin (+ kazanç, − harcama). Aynı orderId ikinci kez uygulanmaz
//     (ilk sonucun aynısı döner). Yanıt: { code: 0, data: { uid, publicId, name, avatar, balance } } ya da
//     { code: <hata>, message }. Hata kodları: 1001 imza, 1002 zaman, 1003 bilet, 1004 bakiye yetersiz, 1005 geçersiz.
// ---------------------------------------------------------------------------------------------------------------

export const router = Router();
export const providerRouter = Router();
export const adminRouter = Router();

const TOKEN_TTL_SEC = 2 * 3600;
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const hmac = (key, s) => crypto.createHmac('sha256', key).update(s).digest();

/** Etkinliğe özel kısa ömürlü oyun bileti (oturum bileti DEĞİL; yalnızca sağlayıcı API'sinde ve yalnızca bu etkinlikte geçer). */
export function issueGameToken(userId, activityId, now = Math.floor(Date.now() / 1000)) {
  const body = b64u(JSON.stringify({ u: userId, a: activityId, e: now + TOKEN_TTL_SEC }));
  return `${body}.${b64u(hmac(jwtSecret(), `game|${body}`))}`;
}

export function readGameToken(token, activityId, now = Math.floor(Date.now() / 1000)) {
  if (typeof token !== 'string' || token.length > 600) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const want = b64u(hmac(jwtSecret(), `game|${body}`));
  if (want.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
  let p;
  try { p = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; }
  if (!p || p.a !== activityId || typeof p.u !== 'string' || !(p.e > now)) return null;
  return p.u;
}

export function providerSign(secret, { activityId, ts, token, orderId, amount }) {
  return hmac(secret, `${activityId}|${ts}|${token}|${orderId ?? ''}|${amount ?? ''}`).toString('hex');
}

/** Bağlantıdaki yer tutucuları doldurur (değerler adres için kodlanır). */
export function fillLink(link, values) {
  return link.replace(/\{(uid|publicId|name|avatar|lang|roomId|token|ts)\}/g, (_, k) => encodeURIComponent(values[k] ?? ''));
}

const itemView = (r, { admin = false } = {}) => ({
  id: r.id,
  title: r.title,
  subtitle: r.subtitle,
  icon: r.icon,
  openMode: r.open_mode,
  ready: !!r.link_url,
  sortOrder: r.sort_order,
  ...(admin ? { linkUrl: r.link_url, enabled: r.enabled, hasSecret: !!r.app_secret, updatedAt: r.updated_at } : {}),
});

// ---------------- Kullanıcı ----------------

/** Etkinlikleri görme izni: yalnızca yönetimin izin verdiği kişiler (yönetici hesapları da dahil, istisna yok). Karar tamamen sunucuda. */
export async function canSeeActivities(userId) {
  const r = await query(
    `SELECT EXISTS (SELECT 1 FROM activity_access a WHERE a.user_id = u.id) AS ok
       FROM users u WHERE u.id = $1 AND u.account_status = 'active'`, [userId],
  ).catch(() => ({ rows: [] }));
  return r.rows[0]?.ok === true;
}

router.get('/access', requireAuth, async (req, res) => {
  res.json({ allowed: await canSeeActivities(req.user.id) });
});


router.get('/', requireAuth, async (req, res) => {
  if (!(await canSeeActivities(req.user.id))) return res.json({ items: [] });
  const rows = (await query(`SELECT * FROM activity_items WHERE enabled ORDER BY sort_order, created_at`)).rows;
  res.json({ items: rows.map((r) => itemView(r)) });
});

router.post('/:id/launch', requireAuth, userLimit('activity_launch', 60, 60e3), async (req, res) => {
  if (!(await canSeeActivities(req.user.id))) throw fail('Etkinlikler için izniniz yok.', 403);
  const id = uuid(req.params.id, 'Etkinlik');
  const item = (await query(`SELECT * FROM activity_items WHERE id = $1 AND enabled`, [id])).rows[0];
  if (!item) throw fail('Etkinlik bulunamadı.', 404);
  if (!item.link_url) throw fail('Bu etkinlik yakında açılacak.', 409);
  const u = (await query(`SELECT id, public_id, display_name, username, avatar_url FROM users WHERE id = $1`, [req.user.id])).rows[0];
  const roomId = typeof req.body?.roomId === 'string' && /^[0-9a-f-]{36}$/i.test(req.body.roomId) ? req.body.roomId : '';
  const lang = ['tr', 'en', 'ar', 'hi'].includes(req.body?.lang) ? req.body.lang : 'tr';
  const base = `${req.protocol}://${req.get('host')}`;
  const avatar = u.avatar_url ? (u.avatar_url.startsWith('http') ? u.avatar_url : base + u.avatar_url) : '';
  const url = fillLink(item.link_url, {
    uid: u.id, publicId: u.public_id ?? '', name: u.display_name || u.username, avatar, lang, roomId,
    token: issueGameToken(u.id, item.id), ts: String(Math.floor(Date.now() / 1000)),
  });
  res.json({ url, openMode: item.open_mode, title: item.title });
});

// ---------------- Oyun sağlayıcısı (sunucu → sunucu) ----------------
async function providerContext(req) {
  const id = String(req.params.id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { err: [1005, 'Etkinlik geçersiz.'] };
  const item = (await query(`SELECT id, app_secret FROM activity_items WHERE id = $1 AND enabled`, [id])).rows[0];
  if (!item || !item.app_secret) return { err: [1005, 'Etkinlik bulunamadı ya da Coin API kapalı.'] };
  const b = req.body ?? {};
  const ts = Number(b.ts);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return { err: [1002, 'Zaman damgası geçersiz.'] };
  const want = providerSign(item.app_secret, { activityId: id, ts: b.ts, token: b.token, orderId: b.orderId, amount: b.amount });
  const got = String(b.sign ?? '');
  if (got.length !== want.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want))) return { err: [1001, 'İmza geçersiz.'] };
  const userId = readGameToken(b.token, id);
  if (!userId) return { err: [1003, 'Oyun bileti geçersiz ya da süresi doldu.'] };
  return { id, userId };
}

const userData = (u) => ({ uid: u.id, publicId: u.public_id, name: u.display_name || u.username, avatar: u.avatar_url, balance: String(u.coins) });

providerRouter.post('/:id/user', ipLimit('activity_provider', 6000, 60e3), async (req, res) => {
  const ctx = await providerContext(req);
  if (ctx.err) return res.json({ code: ctx.err[0], message: ctx.err[1] });
  const u = (await query(`SELECT id, public_id, display_name, username, avatar_url, coins FROM users WHERE id = $1 AND account_status = 'active'`, [ctx.userId])).rows[0];
  if (!u) return res.json({ code: 1003, message: 'Kullanıcı bulunamadı.' });
  res.json({ code: 0, data: userData(u) });
});

providerRouter.post('/:id/balance', ipLimit('activity_provider', 6000, 60e3), async (req, res) => {
  const ctx = await providerContext(req);
  if (ctx.err) return res.json({ code: ctx.err[0], message: ctx.err[1] });
  const orderId = String(req.body?.orderId ?? '').trim();
  const amountStr = String(req.body?.amount ?? '').trim();
  if (!orderId || orderId.length > 80 || !/^-?\d{1,15}$/.test(amountStr) || amountStr === '0' || amountStr === '-0') {
    return res.json({ code: 1005, message: 'Sipariş numarası ya da miktar geçersiz.' });
  }
  const amount = BigInt(amountStr);
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 120) : null;
  const out = await tx(async (c) => {
    const done = (await c.query(`SELECT balance_after, amount FROM activity_orders WHERE activity_id = $1 AND order_id = $2`, [ctx.id, orderId])).rows[0];
    const u = (await c.query(`SELECT id, public_id, display_name, username, avatar_url, coins FROM users WHERE id = $1 AND account_status = 'active' FOR UPDATE`, [ctx.userId])).rows[0];
    if (!u) return { code: 1003, message: 'Kullanıcı bulunamadı.' };
    if (done) return { code: 0, data: { ...userData(u), balance: String(done.balance_after) }, duplicate: true };
    const before = BigInt(u.coins);
    const after = before + amount;
    if (after < 0n) return { code: 1004, message: 'Bakiye yetersiz.' };
    await c.query(`UPDATE users SET coins = $1, updated_at = NOW() WHERE id = $2`, [after.toString(), u.id]);
    await c.query(
      `INSERT INTO activity_orders(activity_id, order_id, user_id, amount, balance_after, reason) VALUES($1,$2,$3,$4,$5,$6)`,
      [ctx.id, orderId, u.id, amount.toString(), after.toString(), reason],
    );
    await c.query(
      `INSERT INTO wallet_transactions(user_id, transaction_type, coin_amount, reference_id, description) VALUES($1,$2,$3,$4,$5)`,
      [u.id, amount > 0n ? 'activity_win' : 'activity_spend', amount.toString(), `${ctx.id}:${orderId}`, reason || 'Etkinlik'],
    );
    await c.query(
      `INSERT INTO financial_audit_logs(user_id, action, reference_type, reference_id, amount_coins, balance_before, balance_after, metadata)
       VALUES($1,'activity_balance','activity',$2,$3,$4,$5,$6)`,
      [u.id, ctx.id, amount.toString(), before.toString(), after.toString(), JSON.stringify({ orderId, reason })],
    );
    return { code: 0, data: { ...userData(u), balance: after.toString() }, userId: u.id };
  });
  if (out.code === 0 && out.userId) hub.sendToUser(out.userId, { type: 'wallet', coins: out.data.balance });
  res.json({ code: out.code, ...(out.data ? { data: out.data } : { message: out.message }) });
});

// ---------------- Yönetim ----------------
adminRouter.use(requireAuth, requireSuperAdmin);


// İzinli kişiler: ID (public_id) ya da kullanıcı adıyla ekle, listele, kaldır.
adminRouter.get('/access', async (_req, res) => {
  const rows = (await query(
    `SELECT u.id, u.username, u.display_name, u.public_id, u.avatar_url, a.created_at
       FROM activity_access a JOIN users u ON u.id = a.user_id ORDER BY a.created_at DESC LIMIT 500`)).rows;
  res.json({ users: rows.map((u) => ({ id: u.id, username: u.username, displayName: u.display_name, publicId: u.public_id, avatarUrl: u.avatar_url, grantedAt: u.created_at })) });
});

adminRouter.post('/access', async (req, res) => {
  const q = text(req.body?.q, 'Kullanıcı', { max: 60 })?.replace(/^@/, '');
  if (!q) throw fail('Kullanıcı ID\'si ya da adı girin.');
  const u = (await query(`SELECT id, username, display_name, public_id FROM users WHERE public_id = $1 OR lower(username) = lower($1) LIMIT 1`, [q])).rows[0];
  if (!u) throw fail('Kullanıcı bulunamadı.', 404);
  await query(`INSERT INTO activity_access(user_id, granted_by) VALUES($1,$2) ON CONFLICT (user_id) DO NOTHING`, [u.id, req.user.id]);
  res.json({ ok: true, user: { id: u.id, username: u.username, displayName: u.display_name, publicId: u.public_id } });
});

adminRouter.delete('/access/:userId', async (req, res) => {
  await query(`DELETE FROM activity_access WHERE user_id = $1`, [uuid(req.params.userId, 'Kullanıcı')]);
  res.json({ ok: true });
});

adminRouter.get('/', async (req, res) => {
  const rows = (await query(`SELECT * FROM activity_items ORDER BY sort_order, created_at`)).rows;
  res.json({ items: rows.map((r) => itemView(r, { admin: true })) });
});

function readItem(b, partial) {
  const out = {};
  if (!partial || b.title !== undefined) out.title = text(b.title, 'Başlık', { required: true, max: 80 });
  if (b.subtitle !== undefined) out.subtitle = text(b.subtitle, 'Açıklama', { max: 160 }) ?? '';
  if (b.icon !== undefined) {
    const ic = String(b.icon ?? '').trim();
    out.icon = !ic ? '🎮' : (/^(https:|\/media\/)/.test(ic) ? assetUrl(ic, 'Simge') : text(ic, 'Simge', { max: 16 }));
  }
  if (b.linkUrl !== undefined) {
    const l = String(b.linkUrl ?? '').trim();
    if (l) {
      let u;
      try { u = new URL(l.replace(/\{[a-zA-Z]+\}/g, 'x')); } catch { throw fail('Bağlantı geçersiz.'); }
      if (u.protocol !== 'https:') throw fail('Bağlantı https:// ile başlamalı.');
      if (l.length > 1000) throw fail('Bağlantı çok uzun.');
    }
    out.link_url = l;
  }
  if (b.openMode !== undefined) out.open_mode = oneOf(b.openMode, ['sheet', 'full', 'browser'], 'Açılış biçimi');
  if (b.enabled !== undefined) out.enabled = b.enabled === true;
  if (b.sortOrder !== undefined) out.sort_order = Math.max(-1000, Math.min(1000, Number.parseInt(b.sortOrder, 10) || 0));
  if (b.appSecret !== undefined) out.app_secret = text(b.appSecret, 'İmza anahtarı', { max: 200 }) ?? '';
  return out;
}

adminRouter.post('/', async (req, res) => {
  const v = readItem(req.body ?? {}, false);
  const cols = Object.keys(v);
  const r = await query(
    `INSERT INTO activity_items(${cols.join(',')}) VALUES(${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
    cols.map((k) => v[k]),
  );
  res.json({ item: itemView(r.rows[0], { admin: true }) });
});

adminRouter.patch('/:id', async (req, res) => {
  const id = uuid(req.params.id, 'Etkinlik');
  const v = readItem(req.body ?? {}, true);
  const cols = Object.keys(v);
  if (!cols.length) throw fail('Değişiklik yok.');
  const r = await query(
    `UPDATE activity_items SET ${cols.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, ...cols.map((k) => v[k])],
  );
  if (!r.rows[0]) throw fail('Etkinlik bulunamadı.', 404);
  res.json({ item: itemView(r.rows[0], { admin: true }) });
});

adminRouter.delete('/:id', async (req, res) => {
  const id = uuid(req.params.id, 'Etkinlik');
  await query(`DELETE FROM activity_items WHERE id = $1`, [id]);
  res.json({ ok: true });
});
