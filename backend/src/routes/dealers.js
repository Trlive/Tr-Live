import { Router } from 'express';
import { query, tx } from '../database.js';
import { requireAuth } from '../auth.js';
import { userLimit } from '../firewall.js';
import { fail, bigAmount, text, uuid } from '../http.js';
import { dealerSell } from '../services/dealers.js';
import { createTopupRequest, requestView, packagesView } from '../services/dealer_topup.js';
import { idempotent } from '../idempotency.js';
import { hub } from '../realtime.js';
import { notifyUser } from '../services/notify.js';

export const router = Router();
router.use(requireAuth);

async function myDealer(userId) {
  const d = (await query(`SELECT * FROM dealer_accounts WHERE owner_user_id = $1 AND is_active = TRUE`, [userId])).rows[0];
  if (!d) throw fail('Bayi hesabınız bulunmuyor.', 403);
  return d;
}

router.get('/me', async (req, res) => {
  const d = await myDealer(req.user.id);
  const tr = (await query(
    `SELECT t.id, t.type, t.coin_amount, t.description, t.created_at, u.username
     FROM dealer_transactions t LEFT JOIN users u ON u.id = t.user_id WHERE t.dealer_id = $1 ORDER BY t.created_at DESC LIMIT 50`,
    [d.id],
  )).rows;
  res.json({
    dealer: { id: d.id, name: d.name, coinBalance: String(d.coin_balance) },
    transactions: tr.map((t) => ({ id: t.id, type: t.type, coinAmount: String(t.coin_amount), description: t.description, username: t.username, createdAt: t.created_at })),
  });
});

// Satış istatistiği (son 50 hareketten değil, sunucuda gerçek toplam): bugün / 7 gün / 30 gün, satış adedi ve alıcı sayısı.
router.get('/stats', async (req, res) => {
  const d = await myDealer(req.user.id);
  const r = (await query(
    `SELECT
       COALESCE(SUM(coin_amount) FILTER (WHERE created_at >= date_trunc('day', NOW())), 0)::text AS today,
       COUNT(*) FILTER (WHERE created_at >= date_trunc('day', NOW()))::int AS today_n,
       COALESCE(SUM(coin_amount) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days'), 0)::text AS week,
       COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS week_n,
       COALESCE(SUM(coin_amount), 0)::text AS month,
       COUNT(*)::int AS month_n,
       COUNT(DISTINCT user_id)::int AS buyers
     FROM dealer_transactions WHERE dealer_id = $1 AND type = 'sale' AND created_at >= NOW() - INTERVAL '30 days'`,
    [d.id],
  )).rows[0];
  // Sık alan müşteriler (son 90 gün): tek dokunuşla tekrar satış için.
  const top = (await query(
    `SELECT u.id, u.username, u.display_name, u.public_id, u.avatar_url, SUM(t.coin_amount)::text AS total, COUNT(*)::int AS n,
            MAX(t.created_at) AS last_at
     FROM dealer_transactions t JOIN users u ON u.id = t.user_id AND u.account_status = 'active'
     WHERE t.dealer_id = $1 AND t.type = 'sale' AND t.created_at >= NOW() - INTERVAL '90 days'
     GROUP BY u.id ORDER BY MAX(t.created_at) DESC LIMIT 8`,
    [d.id],
  )).rows;
  res.json({
    today: { coins: r.today, count: r.today_n },
    week: { coins: r.week, count: r.week_n },
    month: { coins: r.month, count: r.month_n, buyers: r.buyers },
    customers: top.map((u) => ({ id: u.id, username: u.username, displayName: u.display_name, publicId: u.public_id, avatarUrl: u.avatar_url, total: u.total, count: u.n, lastAt: u.last_at })),
  });
});

// Alıcıyı satıştan ÖNCE göster (yanlış kişiye Coin gitmesin — geri alınamaz): uygulamadaki ID ya da kullanıcı adı.
router.get('/lookup', userLimit('dealer_lookup', 120, 60e3), async (req, res) => {
  await myDealer(req.user.id);
  const q = String(req.query.q ?? '').trim().replace(/^@/, '');
  if (!q || q.length > 40) throw fail('ID ya da kullanıcı adı girin.');
  const u = (await query(
    `SELECT id, username, display_name, public_id, avatar_url, coin_level, account_status FROM users
     WHERE public_id = $1 OR lower(username) = lower($1) ORDER BY (public_id = $1) DESC LIMIT 1`,
    [q],
  )).rows[0];
  if (!u || u.account_status !== 'active') throw fail('Kullanıcı bulunamadı.', 404);
  if (u.id === req.user.id) throw fail('Kendinize Coin satamazsınız.');
  res.json({ user: { id: u.id, username: u.username, displayName: u.display_name, publicId: u.public_id, avatarUrl: u.avatar_url, level: u.coin_level } });
});

// Bayi kendi bakiyesinden kullanıcıya Coin satar. Alıcı kullanıcı adı veya kimlik ile bulunur.
router.post('/sell', userLimit('dealer_sell', 60, 3600e3), idempotent('dealer_sell'), async (req, res) => {
  const d = await myDealer(req.user.id);
  const coins = bigAmount(req.body?.amount, 'Satış Coin miktarı');
  let userId;
  if (req.body?.userId) userId = uuid(req.body.userId, 'Kullanıcı');
  else {
    const username = String(req.body?.username ?? '').trim().replace(/^@/, '').toLowerCase();
    // Uygulamadaki ID (rakamlar) de kabul edilir.
    const u = (await query(`SELECT id FROM users WHERE lower(username) = $1 OR public_id = $1 ORDER BY (public_id = $1) DESC LIMIT 1`, [username])).rows[0];
    if (!u) throw fail('Kullanıcı bulunamadı.', 404);
    userId = u.id;
  }
  if (userId === req.user.id) throw fail('Kendinize Coin satamazsınız.');
  const result = await tx((c) => dealerSell(c, {
    dealerId: d.id, userId, coins, actorId: req.user.id, description: text(req.body?.description, 'Açıklama', { max: 200 }),
  }));
  // Alıcı Coin'in geldiğini HEMEN görür: bakiyesi canlı güncellenir + bildirim (Yoho / Bigo bayi yüklemesi gibi).
  hub.sendToUser(userId, { type: 'wallet', coins: result.userBalance });
  notifyUser(userId, 'dealer_credit', '💰 Coin yüklendi', `${d.name} hesabına ${Number(coins).toLocaleString('tr-TR')} Coin yükledi.`, { coins: coins.toString() });
  res.json(result);
});

// ---------------- Bayi Bakiye Talepleri ----------------
// Aktif bayi, toptan paket seçip bakiye talebi oluşturur. Uygulama içinde tahsilat YAPILMAZ; yönetici onayıyla
// bayinin coin_balance'ı artar (ödeme platform dışında teyit edilir). Görünürlük tamamen rol bazlıdır.

// Toptan paket listesi (bayi ekranı için).
router.get('/topup-packages', async (req, res) => {
  await myDealer(req.user.id);
  res.json({ packages: packagesView() });
});

// Yeni talep oluştur.
router.post('/topup-requests', userLimit('dealer_topup', 30, 3600e3), idempotent('dealer_topup'), async (req, res) => {
  const d = await myDealer(req.user.id);
  const packageCode = text(req.body?.packageCode, 'Paket', { required: true, max: 40 });
  const referenceNote = text(req.body?.referenceNote, 'Referans notu', { max: 500 });
  const request = await createTopupRequest({ query }, { dealerUserId: req.user.id, dealerId: d.id, packageCode, referenceNote });
  res.json({ request });
});

// Bayinin kendi talep geçmişi.
router.get('/topup-requests', async (req, res) => {
  await myDealer(req.user.id);
  const rows = (await query(
    `SELECT * FROM dealer_topup_requests WHERE dealer_user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [req.user.id],
  )).rows;
  res.json({ requests: rows.map(requestView), packages: packagesView() });
});
