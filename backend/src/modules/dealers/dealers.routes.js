import { requireContract } from '../contracts/contracts.routes.js';
import { Router } from 'express';
import { query, tx } from '../../infrastructure/database/database.js';
import { requireAuth, requireSuperAdmin } from '../../middleware/authentication/auth.js';
import { userLimit } from '../../middleware/security/firewall.js';
import { fail, bigAmount, text, uuid } from '../../shared/errors/http.js';
import crypto from 'node:crypto';
import { dealerSell, deliverScheduled, transferToSub, cancelScheduled } from './dealers.service.js';
import { createOrder, orderView, dealerShop } from '../payments/payments.service.js';
import { ORDER_NO_RE, toScaled4, profitSummary } from '../payments/payments.rules.js';
import { clientIp } from '../../middleware/security/firewall.js';
import { newApiKey, cleanAllowEntry } from './dealer_api.rules.js';
import { createTopupRequest, requestView, packageView, loadPackages, methodView, fillPayUrl } from './dealer_topup.service.js';
import { idempotent } from '../../middleware/validation/idempotency.js';
import { hub } from '../../infrastructure/websocket/realtime.js';
import { notifyUser } from '../notifications/notify.service.js';

export const router = Router();
router.use(requireAuth);
// Bayilik sözleşmesi yayımlandıysa bayi paneli onaydan sonra açılır (428 contract_required).
router.use(requireContract('dealer'));


/** Bayinin girdiği TL bedel (isteğe bağlı): "1250", "1250.5", "1.250,50" değil — nokta ondalık. */
function priceTryOf(v) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim().replace(',', '.');
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(s)) throw fail('Satış bedeli geçersiz (ör. 1250 ya da 1250.50).');
  return s;
}

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
    dealer: { id: d.id, name: d.name, coinBalance: String(d.coin_balance), isSub: !!d.parent_dealer_id,
      stockCostTry: Number(d.stock_cost_try ?? 0).toFixed(2),
      avgCostPer1000: BigInt(d.coin_balance) > 0n ? (Number(d.stock_cost_try ?? 0) * 1000 / Number(d.coin_balance)).toFixed(2) : null },
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
  // İşletme verileri (Yoho "İşletmeye Genel Bakış"): tüm zamanlar — satılan Coin, başarılı sipariş, tekil müşteri,
  // onaylanan stok yüklemelerinin toplam bedeli (TL).
  const all = (await query(
    `SELECT COALESCE(SUM(coin_amount) FILTER (WHERE type = 'sale' AND status <> 'refunded'), 0)::text AS coins,
            COUNT(*) FILTER (WHERE type = 'sale' AND status = 'done')::int AS orders,
            COUNT(DISTINCT user_id) FILTER (WHERE type = 'sale' AND user_id <> $2)::int AS customers,
            COUNT(*) FILTER (WHERE type = 'sale' AND status = 'scheduled')::int AS scheduled
     FROM dealer_transactions WHERE dealer_id = $1`,
    [d.id, req.user.id],
  )).rows[0];
  const cash = (await query(
    `SELECT COALESCE(SUM(price_try), 0)::text AS try FROM dealer_topup_requests WHERE dealer_id = $1 AND status = 'approved'`, [d.id],
  ).catch(() => ({ rows: [{ try: '0' }] }))).rows[0];
  res.json({
    total: { coins: all.coins, orders: all.orders, customers: all.customers, scheduled: all.scheduled, cashTry: cash.try },
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
  if (userId === req.user.id) throw fail('Kendinize yüklemek için "Kendine yükle"yi kullanın.');
  // Hesaba geçiş süresi (Yoho): 0 = anında, 5 = 5 dakika sonra.
  const delayMinutes = Number(req.body?.delayMinutes ?? 0);
  if (![0, 5].includes(delayMinutes)) throw fail('Geçersiz geçiş süresi.');
  const result = await tx((c) => dealerSell(c, {
    dealerId: d.id, userId, coins, actorId: req.user.id, description: text(req.body?.description, 'Açıklama', { max: 200 }), delayMinutes,
    priceTry: priceTryOf(req.body?.priceTry),
  }));
  if (!result.scheduled) {
    // Alıcı Coin'in geldiğini HEMEN görür: bakiyesi canlı güncellenir + bildirim (Yoho / Bigo bayi yüklemesi gibi).
    hub.sendToUser(userId, { type: 'wallet', coins: result.userBalance });
    notifyUser(userId, 'dealer_credit', '💰 Coin yüklendi', `${d.name} hesabına ${Number(coins).toLocaleString('tr-TR')} Coin yükledi.`, { coins: coins.toString() });
  }
  res.json(result);
});

// Kendine yükle (Yoho "Kendine yükle"): bayi stokundan kendi kullanıcı hesabına, anında.
router.post('/self', userLimit('dealer_self', 30, 3600e3), idempotent('dealer_self'), async (req, res) => {
  const d = await myDealer(req.user.id);
  const coins = bigAmount(req.body?.amount, 'Coin miktarı');
  const result = await tx((c) => dealerSell(c, { dealerId: d.id, userId: req.user.id, coins, actorId: req.user.id, description: 'Bayi kendine yükleme' }));
  hub.sendToUser(req.user.id, { type: 'wallet', coins: result.userBalance });
  res.json(result);
});

// İşlem geçmişi (Yoho "Yeniden Şarj Geçmişi"): tarih aralığı + tür (all / in = Coin satın alma / out = Coin satışı), sayfalı.
// ---- Ana bayi / Alt bayi ----
/** Bir ana bayinin alt bayileri: bakiye ve satış özeti.
 *  Salt okunur olduğu için servis katmanında değil burada: dealers.service.js yalnızca
 *  transaction içinde çalışan para hareketlerini tutuyor ve veritabanı sürücüsüne
 *  bağımlı olmadığı için testlerde sahte istemciyle sınanabiliyor. */
/** Bir ana bayinin alt bayileri: bakiye ve satış özeti. */
async function subDealers(dealerId) {
  const r = await query(
    `SELECT d.id, d.name, d.coin_balance, d.is_active, u.username AS owner,
            COALESCE(s.sold, '0') AS sold, COALESCE(s.sales, 0) AS sales
       FROM dealer_accounts d
       LEFT JOIN users u ON u.id = d.owner_user_id
       LEFT JOIN LATERAL (
         SELECT SUM(coin_amount)::text AS sold, COUNT(*)::int AS sales
           FROM dealer_transactions WHERE dealer_id = d.id AND type = 'sale'
       ) s ON TRUE
      WHERE d.parent_dealer_id = $1
      ORDER BY d.name`,
    [dealerId],
  );
  return r.rows.map((x) => ({
    id: x.id, name: x.name, owner: x.owner, active: x.is_active,
    coinBalance: String(x.coin_balance), soldCoins: String(x.sold ?? 0), saleCount: x.sales ?? 0,
  }));
}


/// Alt bayilerim: bakiye ve satış özeti.
router.get('/subs', async (req, res) => {
  const d = await myDealer(req.user.id);
  // Alt bayinin kendi alt bayisi olamaz (en fazla iki kat); boş liste doğru yanıttır.
  res.json({ isSub: !!d.parent_dealer_id, subs: d.parent_dealer_id ? [] : await subDealers(d.id) });
});

/// Alt bayiye Coin aktar.
///
/// `idempotent`: ağ koptuğunda uygulama isteği tekrarlayabilir. Para hareketinde tekrar,
/// iki kez aktarım demektir; aynı anahtarla gelen ikinci istek ilkinin sonucunu döndürür.
router.post('/subs/:subId/transfer', userLimit('dealer_sub_transfer', 60, 3600e3), idempotent('dealer_sub_transfer'), async (req, res) => {
  const d = await myDealer(req.user.id);
  const subId = uuid(req.params.subId, 'Alt bayi');
  const coins = bigAmount(req.body?.coins, 'Coin');
  const out = await tx((c) => transferToSub(c, {
    parentId: d.id, subId, coins, actorId: req.user.id,
    description: text(req.body?.description, 'Açıklama', { max: 120, optional: true }) || undefined,
    priceTry: priceTryOf(req.body?.priceTry),
  }));
  // Alt bayinin sahibi açıksa bakiyesini anında görsün.
  if (out.subOwnerId) hub.sendToUser(out.subOwnerId, { type: 'dealer_balance', coinBalance: out.subBalance });
  res.json(out);
});

router.get('/transactions', async (req, res) => {
  const d = await myDealer(req.user.id);
  const day = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const from = day(req.query.from);
  const to = day(req.query.to);
  const type = ['in', 'out'].includes(req.query.type) ? req.query.type : 'all';
  const before = typeof req.query.before === 'string' && !Number.isNaN(Date.parse(req.query.before)) ? req.query.before : null;
  const rows = (await query(
    `SELECT t.id, t.type, t.coin_amount, t.description, t.created_at, t.status, t.deliver_at, t.price_try, t.cost_try,
            u.id AS uid, u.username, u.display_name, u.public_id, u.avatar_url
     FROM dealer_transactions t LEFT JOIN users u ON u.id = t.user_id
     WHERE t.dealer_id = $1
       AND ($2::date IS NULL OR t.created_at >= ($2::date AT TIME ZONE 'Europe/Istanbul'))
       AND ($3::date IS NULL OR t.created_at < (($3::date + 1) AT TIME ZONE 'Europe/Istanbul'))
       AND ($4 = 'all' OR ($4 = 'out' AND t.type IN ('sale', 'sub_transfer_out')) OR ($4 = 'in' AND t.type NOT IN ('sale', 'sub_transfer_out')))
       AND ($5::timestamptz IS NULL OR t.created_at < $5::timestamptz)
     ORDER BY t.created_at DESC LIMIT 30`,
    [d.id, from, to, type, before],
  )).rows;
  res.json({
    items: rows.map((t) => ({
      id: t.id, type: t.type, coinAmount: String(t.coin_amount), description: t.description, createdAt: t.created_at,
      status: t.status ?? 'done', deliverAt: t.deliver_at ?? null,
      priceTry: t.price_try != null ? Number(t.price_try).toFixed(2) : null, costTry: t.cost_try != null ? Number(t.cost_try).toFixed(2) : null,
      user: t.uid ? { id: t.uid, username: t.username, displayName: t.display_name || t.username, publicId: t.public_id, avatarUrl: t.avatar_url } : null,
    })),
    more: rows.length === 30,
  });
});

/** Zamanı gelen gecikmeli satışları teslim eder (15 sn'de bir) ve alıcıya bildirir. */
export function startDealerDeliveryTicker() {
  let busy = false;
  const t = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const done = await tx((c) => deliverScheduled(c));
      for (const x of done) {
        hub.sendToUser(x.userId, { type: 'wallet', coins: x.userBalance });
        notifyUser(x.userId, 'dealer_credit', '💰 Coin yüklendi', `${x.dealerName} hesabına ${Number(x.coins).toLocaleString('tr-TR')} Coin yükledi.`, { coins: x.coins });
      }
    } catch (e) {
      console.error('Bayi gecikmeli teslim:', e.message);
    } finally {
      busy = false;
    }
  }, 15e3);
  t.unref();
  return t;
}

// ---------------- Bayi Bakiye Talepleri ----------------
// Aktif bayi, toptan paket seçip bakiye talebi oluşturur. Uygulama içinde tahsilat YAPILMAZ; yönetici onayıyla
// bayinin coin_balance'ı artar (ödeme platform dışında teyit edilir). Görünürlük tamamen rol bazlıdır.

// Toptan paket listesi (bayi ekranı için).
router.get('/topup-packages', async (req, res) => {
  await myDealer(req.user.id);
  const methods = (await query(`SELECT * FROM dealer_pay_methods WHERE active ORDER BY sort_order, created_at`).catch(() => ({ rows: [] }))).rows;
  res.json({ packages: (await loadPackages(query)).map(packageView), methods: methods.map((m) => methodView(m)) });
});

// Yeni talep oluştur.
router.post('/topup-requests', userLimit('dealer_topup', 30, 3600e3), idempotent('dealer_topup'), async (req, res) => {
  const d = await myDealer(req.user.id);
  const packageCode = text(req.body?.packageCode, 'Paket', { required: true, max: 40 });
  const referenceNote = text(req.body?.referenceNote, 'Referans notu', { max: 500 });
  // Ödeme yöntemi seçildiyse: yönetimin yapıştırdığı ödeme bağlantısı doldurulup döndürülür, uygulama açar.
  let method = null;
  if (req.body?.methodId) {
    method = (await query(`SELECT * FROM dealer_pay_methods WHERE id = $1 AND active`, [uuid(req.body.methodId, 'Ödeme yöntemi')])).rows[0];
    if (!method) throw fail('Ödeme yöntemi bulunamadı.', 404);
    if (!method.url_template) throw fail('Bu ödeme yöntemi henüz hazır değil.', 409);
  }
  const refCode = `TR${crypto.randomInt(100000, 999999)}`; // ödeme açıklamasına yazılacak kısa referans
  const request = await createTopupRequest({ query }, { dealerUserId: req.user.id, dealerId: d.id, packageCode, referenceNote, methodId: method?.id ?? null, refCode });
  const payUrl = method ? fillPayUrl(method.url_template, {
    price: String(request.priceTry ?? ''), coins: request.requestedCoins, code: request.packageCode, ref: refCode, dealer: d.name,
  }) : null;
  res.json({ request, payUrl });
});

// Bayinin kendi talep geçmişi.
router.get('/topup-requests', async (req, res) => {
  await myDealer(req.user.id);
  const rows = (await query(
    `SELECT * FROM dealer_topup_requests WHERE dealer_user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [req.user.id],
  )).rows;
  res.json({ requests: rows.map(requestView), packages: (await loadPackages(query)).map(packageView) });
});

// ---------------- Yönetim: bayi mağazası (toptan paketler + ödeme yöntemleri) ----------------
// Yönetici ödeme bağlantısını yapıştırır; bayi paket + yöntem seçince bağlantı doldurulup açılır, talep "bekliyor" düşer.
export const shopAdminRouter = Router();
shopAdminRouter.use(requireAuth, requireSuperAdmin);

shopAdminRouter.get('/', async (req, res) => {
  const methods = (await query(`SELECT * FROM dealer_pay_methods ORDER BY sort_order, created_at`)).rows;
  res.json({
    packages: (await loadPackages(query, { all: true })).map((p) => ({ ...packageView(p), active: p.active !== false, sortOrder: p.sortOrder ?? 0 })),
    methods: methods.map((m) => methodView(m, { admin: true })),
  });
});

const tplOk = (v) => {
  const l = String(v ?? '').trim();
  if (!l) return '';
  let u;
  try { u = new URL(l.replace(/\{[a-z]+\}/g, 'x')); } catch { throw fail('Ödeme bağlantısı geçersiz.'); }
  if (u.protocol !== 'https:') throw fail('Ödeme bağlantısı https:// ile başlamalı.');
  if (l.length > 1000) throw fail('Ödeme bağlantısı çok uzun.');
  return l;
};

shopAdminRouter.put('/packages/:code', async (req, res) => {
  const code = String(req.params.code ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9_]{2,40}$/.test(code)) throw fail('Paket kodu geçersiz (harf, rakam, _).');
  const b = req.body ?? {};
  const coins = bigAmount(b.coins, 'Coin');
  const price = Number(b.priceTry);
  const list = Number(b.listTry ?? 0);
  if (!Number.isFinite(price) || price < 0 || !Number.isFinite(list) || list < 0) throw fail('Fiyat geçersiz.');
  // Paket bonusu (ek Coin, maliyetsiz). Paket Coin'inin yarısını geçemez: yanlış girişle bedava stok dağıtılmasın.
  const bonus = b.bonusCoins === undefined || b.bonusCoins === '' || b.bonusCoins === null ? 0n : BigInt(String(b.bonusCoins).replace(/\D/g, '') || '0');
  if (bonus * 2n > coins) throw fail('Ek Coin, paket Coin\'inin yarısını geçemez.');
  const r = await query(
    `INSERT INTO dealer_packages(code, coins, price_try, list_try, label, active, sort_order, bonus_coins) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (code) DO UPDATE SET coins = EXCLUDED.coins, price_try = EXCLUDED.price_try, list_try = EXCLUDED.list_try,
       label = EXCLUDED.label, active = EXCLUDED.active, sort_order = EXCLUDED.sort_order, bonus_coins = EXCLUDED.bonus_coins RETURNING code`,
    [code, coins.toString(), price, list, text(b.label, 'Ad', { max: 80 }) ?? '', b.active !== false, Number.parseInt(b.sortOrder, 10) || 0, bonus.toString()],
  );
  res.json({ ok: true, code: r.rows[0].code });
});

shopAdminRouter.delete('/packages/:code', async (req, res) => {
  await query(`DELETE FROM dealer_packages WHERE code = $1`, [String(req.params.code ?? '')]);
  res.json({ ok: true });
});

shopAdminRouter.post('/methods', async (req, res) => {
  const b = req.body ?? {};
  const r = await query(
    `INSERT INTO dealer_pay_methods(name, icon, url_template, badge, active, sort_order) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
    [text(b.name, 'Ad', { required: true, max: 60 }), text(b.icon, 'Simge', { max: 500 }) || '💳', tplOk(b.urlTemplate),
      text(b.badge, 'Etiket', { max: 30 }) ?? '', b.active !== false, Number.parseInt(b.sortOrder, 10) || 0],
  );
  res.json({ method: methodView(r.rows[0], { admin: true }) });
});

shopAdminRouter.patch('/methods/:id', async (req, res) => {
  const id = uuid(req.params.id, 'Ödeme yöntemi');
  const b = req.body ?? {};
  const sets = [];
  const vals = [id];
  const put = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if (b.name !== undefined) put('name', text(b.name, 'Ad', { required: true, max: 60 }));
  if (b.icon !== undefined) put('icon', text(b.icon, 'Simge', { max: 500 }) || '💳');
  if (b.urlTemplate !== undefined) put('url_template', tplOk(b.urlTemplate));
  if (b.badge !== undefined) put('badge', text(b.badge, 'Etiket', { max: 30 }) ?? '');
  if (b.active !== undefined) put('active', b.active === true);
  if (b.sortOrder !== undefined) put('sort_order', Number.parseInt(b.sortOrder, 10) || 0);
  if (!sets.length) throw fail('Değişiklik yok.');
  const r = await query(`UPDATE dealer_pay_methods SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, vals);
  if (!r.rows[0]) throw fail('Ödeme yöntemi bulunamadı.', 404);
  res.json({ method: methodView(r.rows[0], { admin: true }) });
});

shopAdminRouter.delete('/methods/:id', async (req, res) => {
  await query(`DELETE FROM dealer_pay_methods WHERE id = $1`, [uuid(req.params.id, 'Ödeme yöntemi')]);
  res.json({ ok: true });
});

// ---------------- Stok satın alma (otomatik ödeme) — v2.153.0 ----------------
// Bayi paketi ve ödeme yöntemini seçer; sipariş açılır. Kart: ödeme sayfası bağlantısı; USDT: adres + tam tutar; havale: IBAN +
// sipariş no. Ödeme doğrulanınca stok OTOMATİK yüklenir (yönetici onayı gerekmez; havale hariç). Bonus siparişte sabitlenir.

router.get('/shop', async (req, res) => {
  const d = await myDealer(req.user.id);
  res.json({ dealer: { id: d.id, name: d.name, coinBalance: String(d.coin_balance) }, ...(await dealerShop(query, d)) });
});

router.post('/orders', userLimit('dealer_order', 30, 3600e3), async (req, res) => {
  const d = await myDealer(req.user.id);
  const order = await createOrder({
    kind: 'dealer', provider: String(req.body?.provider ?? ''), packageCode: text(req.body?.packageCode, 'Paket', { required: true, max: 40 }),
    dealer: d, targetUserId: req.user.id, buyerUserId: req.user.id, email: null, ip: clientIp(req),
  });
  res.status(201).json({ order });
});

router.get('/orders', async (req, res) => {
  const d = await myDealer(req.user.id);
  const r = await query(`SELECT * FROM payment_orders WHERE dealer_id = $1 ORDER BY created_at DESC LIMIT 50`, [d.id]);
  res.json({ orders: r.rows.map((o) => orderView(o)) });
});

router.get('/orders/:orderNo', async (req, res) => {
  const d = await myDealer(req.user.id);
  const no = String(req.params.orderNo);
  if (!ORDER_NO_RE.test(no)) throw fail('Sipariş bulunamadı.', 404);
  const o = (await query(`SELECT * FROM payment_orders WHERE order_no = $1 AND dealer_id = $2`, [no, d.id])).rows[0];
  if (!o) throw fail('Sipariş bulunamadı.', 404);
  res.json({ order: orderView(o) });
});

/** "5 dakika sonra hesaba geçiş" ile yapılan satışı, teslimden önce iptal et (yanlış ID / yanlış miktar). */
router.post('/transactions/:id/cancel', userLimit('dealer_cancel', 60, 3600e3), async (req, res) => {
  const d = await myDealer(req.user.id);
  const out = await tx((c) => cancelScheduled(c, { dealerId: d.id, transactionId: uuid(req.params.id, 'İşlem'), actorId: req.user.id }));
  res.json(out);
});

/**
 * Gelir-gider (bayinin kendi defteri): seçilen aralıkta
 *  - Gider: stok alımları (ödenen toptan bedel) ve alt bayiden alımlar,
 *  - Satış: satılan Coin, girilen satış bedeli (gelir) ve o satışların stok maliyeti → brüt kâr ve marj,
 *  - Bedeli girilmemiş satışlar ayrıca sayılır (kâr hesabına giremez),
 *  - Stok: bugünkü Coin ve stok maliyeti (ortalama maliyet).
 */
router.get('/finance', async (req, res) => {
  const d = await myDealer(req.user.id);
  const day = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const from = day(req.query.from); const to = day(req.query.to);
  const r = (await query(
    `SELECT
       COALESCE(SUM(price_try) FILTER (WHERE type IN ('stock_purchase', 'admin_topup', 'sub_transfer_in', 'credit')), 0)::text AS spent,
       COALESCE(SUM(coin_amount) FILTER (WHERE type IN ('stock_purchase', 'admin_topup', 'sub_transfer_in', 'bonus', 'credit')), 0)::text AS coins_in,
       COALESCE(SUM(coin_amount) FILTER (WHERE type = 'bonus'), 0)::text AS bonus,
       COALESCE(SUM(coin_amount) FILTER (WHERE type IN ('sale', 'sub_transfer_out') AND status IN ('done', 'scheduled')), 0)::text AS coins_out,
       COUNT(*) FILTER (WHERE type IN ('sale', 'sub_transfer_out') AND status IN ('done', 'scheduled'))::int AS sales,
       COALESCE(SUM(price_try) FILTER (WHERE type IN ('sale', 'sub_transfer_out') AND status IN ('done', 'scheduled') AND price_try IS NOT NULL), 0)::text AS revenue,
       COALESCE(SUM(cost_try) FILTER (WHERE type IN ('sale', 'sub_transfer_out') AND status IN ('done', 'scheduled') AND price_try IS NOT NULL), 0)::text AS cogs,
       COUNT(*) FILTER (WHERE type IN ('sale', 'sub_transfer_out') AND status IN ('done', 'scheduled') AND price_try IS NULL)::int AS unpriced,
       COALESCE(SUM(coin_amount) FILTER (WHERE type IN ('sale', 'sub_transfer_out') AND status IN ('done', 'scheduled') AND price_try IS NULL), 0)::text AS unpriced_coins
     FROM dealer_transactions WHERE dealer_id = $1
       AND ($2::date IS NULL OR created_at >= ($2::date AT TIME ZONE 'Europe/Istanbul'))
       AND ($3::date IS NULL OR created_at < (($3::date + 1) AT TIME ZONE 'Europe/Istanbul'))`,
    [d.id, from, to],
  )).rows[0];
  const p = profitSummary({ revenue4: toScaled4(Number(r.revenue).toFixed(4)), cogs4: toScaled4(Number(r.cogs).toFixed(4)) });
  const daily = (await query(
    `SELECT to_char(created_at AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') AS day,
            COALESCE(SUM(coin_amount) FILTER (WHERE type IN ('sale', 'sub_transfer_out')), 0)::text AS coins_out,
            COALESCE(SUM(price_try) FILTER (WHERE type IN ('sale', 'sub_transfer_out')), 0)::text AS revenue,
            COALESCE(SUM(cost_try) FILTER (WHERE type IN ('sale', 'sub_transfer_out') AND price_try IS NOT NULL), 0)::text AS cogs,
            COALESCE(SUM(price_try) FILTER (WHERE type IN ('stock_purchase', 'admin_topup', 'sub_transfer_in', 'credit')), 0)::text AS spent
     FROM dealer_transactions WHERE dealer_id = $1 AND status IN ('done', 'scheduled')
       AND created_at >= COALESCE(($2::date AT TIME ZONE 'Europe/Istanbul'), NOW() - INTERVAL '30 days')
       AND ($3::date IS NULL OR created_at < (($3::date + 1) AT TIME ZONE 'Europe/Istanbul'))
     GROUP BY 1 ORDER BY 1 DESC LIMIT 62`,
    [d.id, from, to],
  )).rows;
  const stockCost = Number(d.stock_cost_try ?? 0);
  res.json({
    range: { from, to },
    spentTry: Number(r.spent).toFixed(2), coinsIn: r.coins_in, bonusCoins: r.bonus,
    coinsOut: r.coins_out, sales: r.sales,
    revenueTry: Number(p.revenue).toFixed(2), cogsTry: Number(p.cogs).toFixed(2), profitTry: Number(p.profit).toFixed(2), marginBps: p.marginBps,
    unpriced: { sales: r.unpriced, coins: r.unpriced_coins },
    stock: { coins: String(d.coin_balance), costTry: stockCost.toFixed(2),
      avgCostPer1000: BigInt(d.coin_balance) > 0n ? (stockCost * 1000 / Number(d.coin_balance)).toFixed(2) : null },
    daily: daily.map((x) => ({ day: x.day, coinsOut: x.coins_out, revenueTry: Number(x.revenue).toFixed(2),
      profitTry: (Number(x.revenue) - Number(x.cogs)).toFixed(2), spentTry: Number(x.spent).toFixed(2) })),
  });
});

// ---------------- Bayi API anahtarları (v2.154.0) ----------------
// Bayi kendi sisteminden /dealer-api/v1 ile Coin yükler. Yönetim API'yi açmadıysa anahtar oluşturulamaz.
const keyJson = (k) => ({ id: k.id, prefix: k.prefix, label: k.label, ipAllow: k.ip_allow, dailyLimit: String(k.daily_limit),
  createdAt: k.created_at, lastUsedAt: k.last_used_at, lastIp: k.last_ip, revokedAt: k.revoked_at });

router.get('/api-keys', async (req, res) => {
  const d = await myDealer(req.user.id);
  const r = await query(`SELECT * FROM dealer_api_keys WHERE dealer_id = $1 ORDER BY created_at DESC LIMIT 50`, [d.id]);
  res.json({ apiEnabled: d.api_enabled === true, keys: r.rows.map(keyJson), docsUrl: '/dealer-api/docs' });
});

router.post('/api-keys', userLimit('dealer_api_key', 10, 3600e3), async (req, res) => {
  const d = await myDealer(req.user.id);
  if (!d.api_enabled) throw fail('API erişiminiz kapalı. Açılması için yönetimle görüşün.', 403);
  const active = (await query(`SELECT COUNT(*)::int AS n FROM dealer_api_keys WHERE dealer_id = $1 AND revoked_at IS NULL`, [d.id])).rows[0].n;
  if (active >= 5) throw fail('En fazla 5 etkin anahtar olabilir; kullanmadığınızı iptal edin.', 409);
  const list = Array.isArray(req.body?.ipAllow) ? req.body.ipAllow : String(req.body?.ipAllow ?? '').split(/[\s,]+/);
  const ips = [];
  for (const raw of list.filter((x) => String(x).trim())) {
    const ip = cleanAllowEntry(raw);
    if (!ip) throw fail(`IP geçersiz: ${String(raw).slice(0, 50)} (ör. 203.0.113.7 ya da 203.0.113.0/24)`);
    ips.push(ip);
  }
  if (ips.length > 20) throw fail('En fazla 20 IP.');
  const limitRaw = String(req.body?.dailyLimit ?? '0').replace(/\D/g, '') || '0';
  const k = newApiKey();
  const r = await query(
    `INSERT INTO dealer_api_keys(dealer_id, prefix, secret_hash, label, ip_allow, daily_limit, created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [d.id, k.prefix, k.hash, text(req.body?.label, 'Ad', { max: 60 }) || '', ips, limitRaw, req.user.id],
  );
  await query(`INSERT INTO financial_audit_logs(admin_id, action, reference_type, reference_id, metadata) VALUES($1,'dealer_api_key_create','dealer',$2,$3)`,
    [req.user.id, d.id, JSON.stringify({ prefix: k.prefix, ips, dailyLimit: limitRaw })]);
  // Anahtarın tamamı YALNIZCA bu yanıtta: sunucu yalnızca özetini saklar.
  res.status(201).json({ key: k.key, apiKey: keyJson(r.rows[0]) });
});

router.delete('/api-keys/:id', async (req, res) => {
  const d = await myDealer(req.user.id);
  const r = await query(`UPDATE dealer_api_keys SET revoked_at = NOW() WHERE id = $1 AND dealer_id = $2 AND revoked_at IS NULL RETURNING prefix`, [uuid(req.params.id, 'Anahtar'), d.id]);
  if (!r.rowCount) throw fail('Anahtar bulunamadı ya da zaten iptal.', 404);
  await query(`INSERT INTO financial_audit_logs(admin_id, action, reference_type, reference_id, metadata) VALUES($1,'dealer_api_key_revoke','dealer',$2,$3)`,
    [req.user.id, d.id, JSON.stringify({ prefix: r.rows[0].prefix })]);
  res.json({ ok: true });
});
