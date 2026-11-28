// Web yükleme kanalı (/pay): herkese açık sayfa — kullanıcı uygulama ID'siyle kendi (ya da bir başkasının) hesabına Coin yükler.
// Ödeme sağlayıcıda yapılır; Coin, ödeme doğrulanınca otomatik yazılır. Geri çağrılar da burada (/pay/callback/*).
//
// Bayi stok alımı bu sayfada değil: bayi uygulamadaki Bayi Merkezi'nden ya da web bayi portalından (/dealer) giriş yapıp
// /api/dealer/orders ile sipariş açar. Burada giriş yoktur; kimlik doğrulaması gerektiren hiçbir işlem yapılmaz.
import crypto from 'node:crypto';
import express, { Router } from 'express';
import { query } from '../../infrastructure/database/database.js';
import { ipLimit, clientIp } from '../../middleware/security/firewall.js';
import { fail } from '../../shared/errors/http.js';
import { log } from '../../infrastructure/observability/log.js';
import { getConfig } from '../system/app_config.service.js';
import { availableProviders, paytrKeys } from './providers.js';
import { createOrder, orderView, userPackages, settle, failOrder } from './payments.service.js';
import { paytrCallbackValid, ORDER_NO_RE } from './payments.rules.js';
import { renderPayPage } from './pay_page.js';

export const router = Router();

const pageHeaders = (res, nonce) => res.set({
  'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; img-src 'self' https: data:; frame-src https://www.paytr.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
});

router.get(['/', '/done'], ipLimit('pay_page', 600, 3600e3), (req, res) => {
  const nonce = crypto.randomBytes(16).toString('base64');
  pageHeaders(res, nonce);
  res.type('html').send(renderPayPage({ nonce }));
});

router.get('/api/config', ipLimit('pay_config', 600, 3600e3), async (req, res) => {
  const cfg = await getConfig();
  const on = cfg.payWebTopupEnabled !== false;
  res.json({ enabled: on, providers: on ? availableProviders(cfg) : [], packages: on ? await userPackages(query) : [] });
});

/** ID'ye göre alıcıyı gösterir (yanlış hesaba ödeme yapılmasın). Yalnızca herkese açık profil bilgisi. */
router.get('/api/lookup', ipLimit('pay_lookup', 120, 600e3), async (req, res) => {
  const id = String(req.query.id ?? '').trim();
  if (!/^\d{5,12}$/.test(id)) throw fail('Uygulamadaki ID numaranızı girin (yalnızca rakam).');
  const u = (await query(`SELECT public_id, display_name, username, avatar_url FROM users WHERE public_id = $1 AND account_status = 'active'`, [id])).rows[0];
  if (!u) throw fail('Bu ID ile bir hesap bulunamadı.', 404);
  res.json({ user: { publicId: u.public_id, displayName: u.display_name || u.username, avatarUrl: u.avatar_url || null } });
});

router.post('/api/orders', ipLimit('pay_order', 30, 3600e3), async (req, res) => {
  const b = req.body ?? {};
  const id = String(b.publicId ?? '').trim();
  if (!/^\d{5,12}$/.test(id)) throw fail('ID geçersiz.');
  const u = (await query(`SELECT id FROM users WHERE public_id = $1 AND account_status = 'active'`, [id])).rows[0];
  if (!u) throw fail('Bu ID ile bir hesap bulunamadı.', 404);
  const email = b.email ? String(b.email).trim().slice(0, 200) : null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw fail('E-posta adresi geçersiz.');
  const order = await createOrder({
    kind: 'user', provider: String(b.provider ?? ''), packageCode: String(b.packageId ?? ''), targetUserId: u.id, email, ip: clientIp(req),
  });
  res.status(201).json({ order });
});

/** Sipariş durumu (sayfa ödeme sonrası yoklar). Sipariş numarası tahmin edilemez; alıcının adı dönmez. */
router.get('/api/orders/:orderNo', ipLimit('pay_poll', 1200, 3600e3), async (req, res) => {
  const no = String(req.params.orderNo);
  if (!ORDER_NO_RE.test(no)) throw fail('Sipariş bulunamadı.', 404);
  const o = (await query(`SELECT * FROM payment_orders WHERE order_no = $1`, [no])).rows[0];
  if (!o) throw fail('Sipariş bulunamadı.', 404);
  res.json({ order: orderView(o) });
});

// ---------------------------------------------------------------- PayTR bildirim (Callback) URL'si
// PayTR mağaza panelinde "Bildirim URL" olarak: {PUBLIC_BASE_URL}/pay/callback/paytr. Yanıt düz metin "OK" olmalı;
// "OK" dönmezse PayTR tekrar dener. İmza geçersizse Coin yazılmaz.
router.post('/callback/paytr', express.urlencoded({ extended: false, limit: '20kb' }), async (req, res) => {
  const k = paytrKeys();
  const b = req.body ?? {};
  if (!k || !paytrCallbackValid(k, b)) {
    log.warn('paytr_callback_bad_hash', { oid: String(b.merchant_oid ?? '').slice(0, 40), ip: clientIp(req) });
    return res.status(400).type('text').send('PAYTR notification failed: bad hash');
  }
  const oid = String(b.merchant_oid);
  try {
    if (b.status === 'success') {
      // payment_amount: siparişte gönderilen tutar (kuruş). total_amount taksit farkını içerebilir; eşleşmede kullanılmaz.
      const amount = /^\d+$/.test(String(b.payment_amount ?? '')) ? BigInt(b.payment_amount) : null;
      await settle({ orderNo: oid, provider: 'paytr', providerRef: oid, amountMinor: amount, source: 'paytr_callback' });
    } else {
      await failOrder(oid, 'paytr', { reason: String(b.failed_reason_msg ?? b.failed_reason_code ?? '').slice(0, 200) });
    }
  } catch (e) {
    // Sipariş yok / iptal / tutar uyuşmazlığı: yeniden denemenin faydası yok, kayıt düşülür ve "OK" verilir.
    if (e.status && e.status < 500) {
      log.error('paytr_callback_rejected', { oid, message: e.message });
      return res.type('text').send('OK');
    }
    throw e; // veritabanı hatası: PayTR tekrar denesin
  }
  res.type('text').send('OK');
});
