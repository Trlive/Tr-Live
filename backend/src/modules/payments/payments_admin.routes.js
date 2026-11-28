// Yönetim: ödeme siparişleri, havale teyidi, eşleşmeyen USDT transferleri, bayi teşvikleri (kademe / kampanya).
import { Router } from 'express';
import { query, tx } from '../../infrastructure/database/database.js';
import { requireAuth, requireSuperAdmin } from '../../middleware/authentication/auth.js';
import { userLimit } from '../../middleware/security/firewall.js';
import { fail, text, uuid } from '../../shared/errors/http.js';
import { getConfig } from '../system/app_config.service.js';
import { orderView, settle, loadTiers } from './payments.service.js';
import { ORDER_NO_RE, kurusToTry, tryToKurus } from './payments.rules.js';
import { availableProviders, paytrKeys, usdtAddress, baseUrl } from './providers.js';
import { log } from '../../infrastructure/observability/log.js';

export const router = Router();
router.use(requireAuth, requireSuperAdmin);

router.get('/status', async (req, res) => {
  const cfg = await getConfig();
  const pk = paytrKeys();
  res.json({
    publicBaseUrl: baseUrl() || null,
    paytr: { configured: !!pk, testMode: pk?.testMode === '1', enabled: cfg.payPaytrEnabled === true, callbackUrl: baseUrl() ? `${baseUrl()}/pay/callback/paytr` : null },
    usdt: { configured: !!usdtAddress(), address: usdtAddress(), enabled: cfg.payUsdtEnabled === true, rateKurus: cfg.payUsdtRateKurus, apiKey: !!process.env.TRONGRID_API_KEY },
    bank: { enabled: cfg.payBankEnabled === true, info: cfg.payBankInfo || '' },
    webTopup: { enabled: cfg.payWebTopupEnabled !== false, url: baseUrl() ? `${baseUrl()}/pay` : '/pay' },
    available: availableProviders(cfg),
  });
});

router.get('/summary', async (req, res) => {
  const r = await query(
    `SELECT kind, provider,
       COUNT(*) FILTER (WHERE status = 'paid' AND paid_at >= date_trunc('day', NOW() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul')::int AS today_n,
       COALESCE(SUM(price_try) FILTER (WHERE status = 'paid' AND paid_at >= date_trunc('day', NOW() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul'), 0)::text AS today_try,
       COUNT(*) FILTER (WHERE status = 'paid' AND paid_at >= date_trunc('month', NOW() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul')::int AS month_n,
       COALESCE(SUM(price_try) FILTER (WHERE status = 'paid' AND paid_at >= date_trunc('month', NOW() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul'), 0)::text AS month_try,
       COUNT(*) FILTER (WHERE status = 'created')::int AS open_n
     FROM payment_orders GROUP BY kind, provider ORDER BY kind, provider`,
  );
  const unmatched = (await query(`SELECT COUNT(*)::int AS n FROM payment_events WHERE kind IN ('unmatched', 'ambiguous', 'amount_mismatch') AND created_at > NOW() - INTERVAL '30 days'`)).rows[0].n;
  res.json({ rows: r.rows.map((x) => ({ kind: x.kind, provider: x.provider, today: { count: x.today_n, try: x.today_try }, month: { count: x.month_n, try: x.month_try }, open: x.open_n })), unmatched });
});

router.get('/orders', async (req, res) => {
  const status = ['created', 'paid', 'failed', 'expired', 'cancelled'].includes(String(req.query.status)) ? String(req.query.status) : null;
  const provider = ['paytr', 'usdt_trc20', 'bank'].includes(String(req.query.provider)) ? String(req.query.provider) : null;
  const kind = ['dealer', 'user'].includes(String(req.query.kind)) ? String(req.query.kind) : null;
  const q = String(req.query.q ?? '').trim().slice(0, 60);
  const r = await query(
    `SELECT o.*, u.username, d.name AS dealer_name FROM payment_orders o JOIN users u ON u.id = o.user_id LEFT JOIN dealer_accounts d ON d.id = o.dealer_id
     WHERE ($1::text IS NULL OR o.status = $1) AND ($2::text IS NULL OR o.provider = $2) AND ($3::text IS NULL OR o.kind = $3)
       AND ($4 = '' OR o.order_no = upper($4) OR u.username ILIKE '%' || $4 || '%' OR u.public_id = $4 OR o.provider_ref = $4 OR d.name ILIKE '%' || $4 || '%')
     ORDER BY o.created_at DESC LIMIT 200`,
    [status, provider, kind, q],
  );
  res.json({ orders: r.rows.map((o) => orderView(o, { admin: true })) });
});

router.get('/orders/:orderNo/events', async (req, res) => {
  const r = await query(
    `SELECT e.* FROM payment_events e JOIN payment_orders o ON o.id = e.order_id WHERE o.order_no = $1 ORDER BY e.created_at`, [String(req.params.orderNo)],
  );
  res.json({ events: r.rows.map((e) => ({ kind: e.kind, ok: e.ok, data: e.data, createdAt: e.created_at })) });
});

/**
 * Elle teyit: havale dekontu (reference = dekont/işlem no) ya da eşleşmeyen USDT transferi (reference = işlem özeti).
 * Aynı referans iki siparişe bağlanamaz (benzersiz indeks). Kart siparişi elle teyit edilemez (PayTR bildirimi esastır).
 */
router.post('/orders/:orderNo/confirm', userLimit('pay_confirm', 120, 3600e3), async (req, res) => {
  const no = String(req.params.orderNo);
  if (!ORDER_NO_RE.test(no)) throw fail('Sipariş bulunamadı.', 404);
  const o = (await query(`SELECT provider FROM payment_orders WHERE order_no = $1`, [no])).rows[0];
  if (!o) throw fail('Sipariş bulunamadı.', 404);
  if (o.provider === 'paytr') throw fail('Kart ödemesi elle teyit edilmez; PayTR bildirimi bekleyin (PayTR panelinden yeniden bildirim gönderilebilir).', 409);
  const ref = text(req.body?.reference, 'Dekont / işlem no', { required: true, max: 120 });
  try {
    const out = await settle({ orderNo: no, provider: o.provider, providerRef: o.provider === 'usdt_trc20' ? ref.toLowerCase() : ref, adminId: req.user.id, source: 'admin' });
    if (out.already) throw fail('Bu sipariş zaten ödendi.', 409);
  } catch (e) {
    if (e.code === '23505') throw fail('Bu dekont / işlem no başka bir siparişte kullanılmış.', 409);
    throw e;
  }
  log.warn('payment_order_manual_confirm', { orderNo: no, adminId: req.user.id });
  const fresh = (await query(`SELECT * FROM payment_orders WHERE order_no = $1`, [no])).rows[0];
  res.json({ order: orderView(fresh, { admin: true }) });
});

router.post('/orders/:orderNo/cancel', async (req, res) => {
  const r = await query(
    `UPDATE payment_orders SET status = 'cancelled', decided_by = $2, note = $3 WHERE order_no = $1 AND status IN ('created', 'expired', 'failed') RETURNING *`,
    [String(req.params.orderNo), req.user.id, text(req.body?.note, 'Not', { max: 300 }) || null],
  );
  if (!r.rowCount) throw fail('Sipariş bulunamadı ya da ödenmiş (ödenen sipariş iptal edilemez).', 409);
  res.json({ order: orderView(r.rows[0], { admin: true }) });
});

/** Siparişe eşlenemeyen gelen ödemeler (USDT: yanlış tutar, süresi çok geçmiş; aynı tutarda iki sipariş) ve tutar uyuşmazlıkları. */
router.get('/unmatched', async (req, res) => {
  const r = await query(
    `SELECT id, provider, kind, data, created_at FROM payment_events WHERE kind IN ('unmatched', 'ambiguous', 'amount_mismatch')
     ORDER BY created_at DESC LIMIT 200`,
  );
  res.json({ events: r.rows.map((e) => ({ id: e.id, provider: e.provider, kind: e.kind, data: e.data, createdAt: e.created_at })) });
});

// ---------------------------------------------------------------- Teşvik
router.get('/incentives', async (req, res) => {
  const camps = (await query(`SELECT * FROM dealer_campaigns ORDER BY starts_at DESC LIMIT 100`)).rows;
  res.json({
    tiers: (await loadTiers(query)).map((t) => ({ name: t.name, minTry: kurusToTry(t.minKurus), bonusBps: t.bonusBps })),
    campaigns: camps.map((c) => ({ id: c.id, title: c.title, appliesTo: c.applies_to, bonusBps: c.bonus_bps, minPriceTry: Number(c.min_price_try).toFixed(2),
      startsAt: c.starts_at, endsAt: c.ends_at, active: c.active, live: c.active && new Date(c.starts_at) <= new Date() && new Date(c.ends_at) > new Date() })),
  });
});

/** Kademeleri topluca değiştirir (sıra: eşik). Eşik 0 olan bir taban kademe zorunlu değil. */
router.put('/tiers', async (req, res) => {
  const list = Array.isArray(req.body?.tiers) ? req.body.tiers : null;
  if (!list || list.length > 12) throw fail('En fazla 12 kademe.');
  const clean = list.map((t, i) => {
    const name = text(t?.name, `${i + 1}. kademe adı`, { required: true, max: 40 });
    const min = tryToKurus(String(t?.minTry ?? '').replace(',', '.'));
    const bps = Number(t?.bonusBps);
    if (!Number.isInteger(bps) || bps < 0 || bps > 3000) throw fail(`${name}: ek oran 0–3000 baz puan olmalı (%0–30).`);
    return { name, min, bps };
  }).sort((a, b) => (a.min < b.min ? -1 : 1));
  for (let i = 1; i < clean.length; i++) {
    if (clean[i].min === clean[i - 1].min) throw fail('İki kademenin eşiği aynı olamaz.');
    if (clean[i].bps < clean[i - 1].bps) throw fail('Üst kademenin ek oranı alttakinden düşük olamaz.');
  }
  await tx(async (c) => {
    await c.query(`DELETE FROM dealer_tiers`);
    for (const t of clean) await c.query(`INSERT INTO dealer_tiers(name, min_month_try, bonus_bps) VALUES($1,$2,$3)`, [t.name, kurusToTry(t.min), t.bps]);
    await c.query(`INSERT INTO financial_audit_logs(admin_id, action, reference_type, metadata) VALUES($1,'dealer_tiers_update','dealer_tiers',$2)`,
      [req.user.id, JSON.stringify(clean.map((t) => ({ name: t.name, minTry: kurusToTry(t.min), bonusBps: t.bps })))]);
  });
  res.json({ ok: true });
});

function campaignBody(b, partial = false) {
  const out = {};
  if (!partial || b.title !== undefined) out.title = text(b.title, 'Başlık', { required: true, max: 80 });
  if (!partial || b.appliesTo !== undefined) {
    if (!['dealer', 'user', 'all'].includes(b.appliesTo)) throw fail('Kapsam dealer / user / all olmalı.');
    out.applies_to = b.appliesTo;
  }
  if (!partial || b.bonusBps !== undefined) {
    const v = Number(b.bonusBps);
    if (!Number.isInteger(v) || v < 1 || v > 5000) throw fail('Ek oran 1–5000 baz puan olmalı (%0,01–50).');
    out.bonus_bps = v;
  }
  if (!partial || b.minPriceTry !== undefined) out.min_price_try = kurusToTry(tryToKurus(String(b.minPriceTry ?? '0').replace(',', '.')));
  for (const [k, col] of [['startsAt', 'starts_at'], ['endsAt', 'ends_at']]) {
    if (partial && b[k] === undefined) continue;
    const d = new Date(String(b[k] ?? ''));
    if (Number.isNaN(d.getTime())) throw fail(`${k === 'startsAt' ? 'Başlangıç' : 'Bitiş'} tarihi geçersiz.`);
    out[col] = d.toISOString();
  }
  if (b.active !== undefined) out.active = b.active === true;
  if (out.starts_at && out.ends_at && new Date(out.ends_at) <= new Date(out.starts_at)) throw fail('Bitiş, başlangıçtan sonra olmalı.');
  return out;
}

router.post('/campaigns', async (req, res) => {
  const v = campaignBody(req.body ?? {});
  const r = await query(
    `INSERT INTO dealer_campaigns(title, applies_to, bonus_bps, min_price_try, starts_at, ends_at, active) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [v.title, v.applies_to, v.bonus_bps, v.min_price_try, v.starts_at, v.ends_at, v.active !== false],
  );
  await query(`INSERT INTO financial_audit_logs(admin_id, action, reference_type, reference_id, metadata) VALUES($1,'dealer_campaign_create','dealer_campaign',$2,$3)`,
    [req.user.id, r.rows[0].id, JSON.stringify(v)]);
  res.status(201).json({ id: r.rows[0].id });
});

router.patch('/campaigns/:id', async (req, res) => {
  const id = uuid(req.params.id, 'Kampanya');
  const v = campaignBody(req.body ?? {}, true);
  const cols = Object.keys(v);
  if (!cols.length) throw fail('Değişiklik yok.');
  const r = await query(
    `UPDATE dealer_campaigns SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1 AND ends_at > starts_at RETURNING id`,
    [id, ...cols.map((c) => v[c])],
  ).catch((e) => { if (e.code === '23514') throw fail('Bitiş, başlangıçtan sonra olmalı.'); throw e; });
  if (!r.rowCount) throw fail('Kampanya bulunamadı.', 404);
  await query(`INSERT INTO financial_audit_logs(admin_id, action, reference_type, reference_id, metadata) VALUES($1,'dealer_campaign_update','dealer_campaign',$2,$3)`,
    [req.user.id, id, JSON.stringify(v)]);
  res.json({ ok: true });
});

router.delete('/campaigns/:id', async (req, res) => {
  const id = uuid(req.params.id, 'Kampanya');
  await query(`UPDATE dealer_campaigns SET active = FALSE WHERE id = $1`, [id]);
  res.json({ ok: true });
});
