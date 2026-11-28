// Bayi API'si v1 (/dealer-api/v1): bayi kendi sitesinden / botundan, kendi Coin stoğundan kullanıcı ID'sine yükleme yapar.
//
// Kimlik: "Authorization: Bearer trk_XXXXXXXX_..." (Bayi Paneli → API anahtarları). Anahtar sunucuda yalnızca SHA-256 özetiyle
// tutulur. Ek korumalar: yönetici bayi için API'yi açmış olmalı, IP izin listesi, anahtar başına 24 saatlik Coin sınırı,
// anahtar başına dakikalık istek sınırı. Her yükleme bayinin sipariş numarasıyla (clientOrderId) BİR KERE işlenir: aynı numara
// tekrar gelirse ilk sonucun aynısı döner (ağ kopması / tekrar deneme güvenli).
import { Router } from 'express';
import { query, tx } from '../../infrastructure/database/database.js';
import { clientIp, userLimit } from '../../middleware/security/firewall.js';
import { fail, bigAmount, text } from '../../shared/errors/http.js';
import { hub } from '../../infrastructure/websocket/realtime.js';
import { notifyUser } from '../notifications/notify.service.js';
import { hasAccepted } from '../contracts/contracts.service.js';
import { dealerSell, cancelScheduled } from './dealers.service.js';
import { parseBearer, keyMatches, ipAllowed, CLIENT_ORDER_RE } from './dealer_api.rules.js';
import { renderDealerApiDocs } from './dealer_api_docs.js';

export const router = Router();

router.get('/docs', (req, res) => {
  res.set({ 'Cache-Control': 'public, max-age=600', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" });
  res.type('html').send(renderDealerApiDocs());
});

const v1 = Router();
router.use('/v1', v1);

// API yanıtları her zaman JSON; hata biçimi: { error: { code, message } }.
const err = (res, status, code, message) => res.status(status).json({ error: { code, message } });

v1.use(async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    const b = parseBearer(req.get('authorization'));
    if (!b) return err(res, 401, 'unauthorized', 'Authorization: Bearer <API anahtarı> gerekli.');
    const k = (await query(
      `SELECT k.*, d.name AS dealer_name, d.is_active, d.api_enabled, d.owner_user_id FROM dealer_api_keys k JOIN dealer_accounts d ON d.id = k.dealer_id
       WHERE k.prefix = $1`, [b.prefix],
    )).rows[0];
    if (!k || !keyMatches(b.key, k.secret_hash) || k.revoked_at) return err(res, 401, 'unauthorized', 'API anahtarı geçersiz ya da iptal edilmiş.');
    if (!k.is_active) return err(res, 403, 'dealer_inactive', 'Bayi hesabı aktif değil.');
    if (!k.api_enabled) return err(res, 403, 'api_disabled', 'Bu bayi için API erişimi kapalı (yönetimle görüşün).');
    const ip = clientIp(req);
    if (!ipAllowed(k.ip_allow, ip)) return err(res, 403, 'ip_not_allowed', `Bu IP adresine (${ip}) izin verilmemiş.`);
    if (k.owner_user_id && !(await hasAccepted(k.owner_user_id, 'dealer'))) return err(res, 403, 'contract_required', 'Bayilik sözleşmesi onaylanmamış (Bayi Paneli).');
    req.apiKey = k;
    req.user = { id: `apikey:${k.id}` }; // hız sınırı anahtar başına
    query(`UPDATE dealer_api_keys SET last_used_at = NOW(), last_ip = $2 WHERE id = $1`, [k.id, ip]).catch(() => {});
    next();
  } catch (e) { next(e); }
});
v1.use(userLimit('dealer_api', 120, 60e3));

async function findUser(publicId) {
  const id = String(publicId ?? '').trim();
  if (!/^\d{5,12}$/.test(id)) throw fail('userId: uygulamadaki ID numarası (yalnızca rakam).', 400);
  const u = (await query(`SELECT id, public_id, display_name, username, avatar_url FROM users WHERE public_id = $1 AND account_status = 'active'`, [id])).rows[0];
  if (!u) throw fail('Bu ID ile aktif bir hesap yok.', 404);
  return u;
}
const userJson = (u) => ({ userId: u.public_id, displayName: u.display_name || u.username, avatarUrl: u.avatar_url || null });

async function orderJson(row) {
  const t = row.transaction_id ? (await query(`SELECT status, deliver_at, created_at FROM dealer_transactions WHERE id = $1`, [row.transaction_id])).rows[0] : null;
  const st = { done: 'completed', scheduled: 'scheduled', cancelled: 'cancelled', refunded: 'refunded' }[t?.status ?? 'done'] ?? t?.status;
  const u = (await query(`SELECT public_id FROM users WHERE id = $1`, [row.user_id])).rows[0];
  return { clientOrderId: row.client_order_id, userId: u?.public_id ?? null, coins: String(row.coins), status: st, deliverAt: t?.deliver_at ?? null, createdAt: row.created_at };
}

v1.get('/me', async (req, res) => {
  const d = (await query(`SELECT name, coin_balance FROM dealer_accounts WHERE id = $1`, [req.apiKey.dealer_id])).rows[0];
  const used = (await query(`SELECT COALESCE(SUM(coins), 0)::text AS c FROM dealer_api_orders WHERE key_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`, [req.apiKey.id])).rows[0].c;
  res.json({ dealer: { name: d.name }, balance: String(d.coin_balance), key: { prefix: req.apiKey.prefix, dailyLimit: String(req.apiKey.daily_limit), usedLast24h: used } });
});

v1.get('/users/:userId', async (req, res) => {
  res.json({ user: userJson(await findUser(req.params.userId)) });
});

v1.post('/recharges', async (req, res) => {
  const b = req.body ?? {};
  const orderId = String(b.clientOrderId ?? '');
  if (!CLIENT_ORDER_RE.test(orderId)) throw fail('clientOrderId: 1-64 karakter (harf, rakam, - _). Her yükleme için sizin sisteminizdeki benzersiz numara.', 400);
  const coins = bigAmount(b.coins, 'coins');
  const delay = Number(b.delayMinutes ?? 0);
  if (![0, 5].includes(delay)) throw fail('delayMinutes: 0 (anında) ya da 5.', 400);
  const priceTry = b.priceTry === undefined || b.priceTry === null || b.priceTry === '' ? null : String(b.priceTry);
  if (priceTry !== null && !/^\d{1,12}(\.\d{1,2})?$/.test(priceTry)) throw fail('priceTry: müşteriden alınan tutar (ör. 800 ya da 800.50).', 400);
  const u = await findUser(b.userId);
  const k = req.apiKey;
  if (u.id === k.owner_user_id) throw fail('Kendi hesabınıza API ile yükleme yapılamaz (Bayi Merkezi → Kendine yükle).', 400);
  const out = await tx(async (c) => {
    // Aynı sipariş numarası: ilk istek bitene kadar bekler (birincil anahtar), sonra ilk sonucu döndürür.
    const ins = await c.query(
      `INSERT INTO dealer_api_orders(dealer_id, client_order_id, key_id, user_id, coins) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING *`,
      [k.dealer_id, orderId, k.id, u.id, coins.toString()],
    );
    if (!ins.rowCount) {
      const prev = (await c.query(`SELECT * FROM dealer_api_orders WHERE dealer_id = $1 AND client_order_id = $2`, [k.dealer_id, orderId])).rows[0];
      if (prev.user_id !== u.id || BigInt(prev.coins) !== coins) throw fail('Bu clientOrderId farklı bir yüklemede kullanılmış.', 409);
      return { replay: true, row: prev };
    }
    if (BigInt(k.daily_limit) > 0n) {
      const used = BigInt((await c.query(
        `SELECT COALESCE(SUM(coins), 0)::text AS c FROM dealer_api_orders WHERE key_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`, [k.id],
      )).rows[0].c);
      if (used > BigInt(k.daily_limit)) throw fail(`Bu anahtarın 24 saatlik sınırı (${k.daily_limit} Coin) aşılıyor.`, 429);
    }
    const r = await dealerSell(c, {
      dealerId: k.dealer_id, userId: u.id, coins, actorId: k.owner_user_id ?? null, delayMinutes: delay, priceTry,
      description: text(b.note, 'note', { max: 200 }) || `API yüklemesi (${orderId})`,
    });
    await c.query(`UPDATE dealer_api_orders SET transaction_id = $3 WHERE dealer_id = $1 AND client_order_id = $2`, [k.dealer_id, orderId, r.transactionId]);
    return { replay: false, row: { ...ins.rows[0], transaction_id: r.transactionId }, sell: r };
  });
  if (!out.replay && !out.sell.scheduled) {
    hub.sendToUser(u.id, { type: 'wallet', coins: out.sell.userBalance });
    notifyUser(u.id, 'dealer_credit', '💰 Coin yüklendi', `${k.dealer_name} hesabına ${Number(coins).toLocaleString('tr-TR')} Coin yükledi.`, { coins: coins.toString() });
  }
  const d = (await query(`SELECT coin_balance FROM dealer_accounts WHERE id = $1`, [k.dealer_id])).rows[0];
  res.status(out.replay ? 200 : 201).json({ recharge: await orderJson(out.row), balance: String(d.coin_balance), replay: out.replay });
});

v1.get('/recharges/:clientOrderId', async (req, res) => {
  const row = (await query(`SELECT * FROM dealer_api_orders WHERE dealer_id = $1 AND client_order_id = $2`, [req.apiKey.dealer_id, String(req.params.clientOrderId)])).rows[0];
  if (!row) return err(res, 404, 'not_found', 'Bu clientOrderId ile yükleme yok.');
  res.json({ recharge: await orderJson(row) });
});

/** "5 dakika sonra" (delayMinutes: 5) yüklemeyi teslimden önce iptal eder; Coin stoğa döner. */
v1.post('/recharges/:clientOrderId/cancel', async (req, res) => {
  const row = (await query(`SELECT * FROM dealer_api_orders WHERE dealer_id = $1 AND client_order_id = $2`, [req.apiKey.dealer_id, String(req.params.clientOrderId)])).rows[0];
  if (!row || !row.transaction_id) return err(res, 404, 'not_found', 'Bu clientOrderId ile yükleme yok.');
  const out = await tx((c) => cancelScheduled(c, { dealerId: req.apiKey.dealer_id, transactionId: row.transaction_id, actorId: req.apiKey.owner_user_id ?? null }));
  res.json({ recharge: await orderJson(row), balance: out.dealerBalance });
});

v1.get('/recharges', async (req, res) => {
  const limit = Math.max(1, Math.min(Number.parseInt(String(req.query.limit ?? '50'), 10) || 50, 200));
  const r = await query(`SELECT * FROM dealer_api_orders WHERE dealer_id = $1 ORDER BY created_at DESC LIMIT $2`, [req.apiKey.dealer_id, limit]);
  res.json({ recharges: await Promise.all(r.rows.map(orderJson)) });
});

// Hata işleyicisi: uygulamanın genel işleyicisi yerine API biçiminde.
router.use((e, req, res, next) => {
  if (res.headersSent) return next(e);
  const status = e.status && e.status < 600 ? e.status : 500;
  const code = { 400: 'invalid_request', 401: 'unauthorized', 403: 'forbidden', 404: 'not_found', 409: 'conflict', 429: 'rate_limited' }[status] ?? 'server_error';
  return err(res, status, code, status >= 500 ? 'Sunucu hatası; aynı clientOrderId ile tekrar deneyebilirsiniz.' : e.message);
});
