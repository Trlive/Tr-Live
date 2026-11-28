// Ödeme sağlayıcıları. Gizli anahtarlar YALNIZCA ortam değişkeninde (koda, veritabanına, panele girmez):
//   PAYTR_MERCHANT_ID, PAYTR_MERCHANT_KEY, PAYTR_MERCHANT_SALT, PAYTR_TEST_MODE=1 (deneme)
//   USDT_TRC20_ADDRESS (tahsilat cüzdanı), TRONGRID_API_KEY (isteğe bağlı; yoksa düşük hız sınırı)
//   PUBLIC_BASE_URL (geri dönüş adresleri için, ör. https://api.alanadi.com)
// Ağ çağrıları `fetchImpl` ile verilir: testlerde sahte yanıt kullanılır.
import { paytrToken, kurusToTry, parseTrc20Incoming, TRON_ADDRESS_RE, USDT_TRC20_CONTRACT } from './payments.rules.js';
import { fail } from '../../shared/errors/http.js';

const env = process.env;
export const baseUrl = () => String(env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');

export const paytrKeys = () => (env.PAYTR_MERCHANT_ID && env.PAYTR_MERCHANT_KEY && env.PAYTR_MERCHANT_SALT
  ? { merchantId: String(env.PAYTR_MERCHANT_ID), merchantKey: String(env.PAYTR_MERCHANT_KEY), merchantSalt: String(env.PAYTR_MERCHANT_SALT), testMode: env.PAYTR_TEST_MODE === '1' ? '1' : '0' }
  : null);
export const usdtAddress = () => (TRON_ADDRESS_RE.test(String(env.USDT_TRC20_ADDRESS || '')) ? String(env.USDT_TRC20_ADDRESS) : null);

/** Hangi yöntemler kullanılabilir: ayar açık VE anahtarı tanımlı (havalede banka bilgisi yazılmış). */
export function availableProviders(cfg) {
  const out = [];
  if (cfg.payPaytrEnabled === true && paytrKeys() && baseUrl()) out.push({ id: 'paytr', name: 'Kart (Visa / Mastercard / Troy)', currency: 'TRY', auto: true });
  if (cfg.payUsdtEnabled === true && usdtAddress()) out.push({ id: 'usdt_trc20', name: 'USDT (TRC20)', currency: 'USDT', auto: true });
  if (cfg.payBankEnabled === true && String(cfg.payBankInfo || '').trim()) out.push({ id: 'bank', name: 'Havale / EFT', currency: 'TRY', auto: false });
  return out;
}

/**
 * PayTR iFrame ödeme sayfası için token alır. Dönüş: { checkoutUrl }. Belge: dev.paytr.com (iFrame API, 1. adım).
 * PayTR e-posta, ad, adres ve telefon ister; yalnızca e-posta müşteriden gelir, diğerleri sipariş bilgisinden üretilir.
 */
export async function paytrCheckout(order, { ip, email, title }, fetchImpl = fetch) {
  const k = paytrKeys();
  if (!k) throw fail('Kart ile ödeme şu an kullanılamıyor.', 503);
  const paymentAmount = String(order.amount_minor); // kuruş
  const userBasket = Buffer.from(JSON.stringify([[title, kurusToTry(order.amount_minor), 1]])).toString('base64');
  const f = {
    merchant_id: k.merchantId, user_ip: ip, merchant_oid: order.order_no, email, payment_amount: paymentAmount,
    user_basket: userBasket, no_installment: '1', max_installment: '0', currency: 'TL', test_mode: k.testMode,
  };
  const token = paytrToken({
    merchantId: f.merchant_id, merchantKey: k.merchantKey, merchantSalt: k.merchantSalt, userIp: f.user_ip, merchantOid: f.merchant_oid,
    email: f.email, paymentAmount: f.payment_amount, userBasket: f.user_basket, noInstallment: f.no_installment,
    maxInstallment: f.max_installment, currency: f.currency, testMode: f.test_mode,
  });
  const body = new URLSearchParams({
    ...f, paytr_token: token, debug_on: '0', lang: 'tr', timeout_limit: '30',
    user_name: `TR Live ${order.order_no}`, user_address: 'Dijital ürün', user_phone: '05000000000',
    merchant_ok_url: `${baseUrl()}/pay/done?o=${order.order_no}`, merchant_fail_url: `${baseUrl()}/pay/done?o=${order.order_no}&f=1`,
  });
  const r = await fetchImpl('https://www.paytr.com/odeme/api/get-token', {
    method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(15000),
  });
  const j = await r.json().catch(() => ({}));
  if (j?.status !== 'success' || !j.token) throw fail(`Kart ödemesi başlatılamadı: ${String(j?.reason ?? r.status).slice(0, 160)}`, 502);
  return { checkoutUrl: `https://www.paytr.com/odeme/guvenli/${encodeURIComponent(j.token)}` };
}

/** Cüzdana `since` sonrasında gelen onaylı USDT transferleri (TronGrid). */
export async function fetchUsdtIncoming(since, fetchImpl = fetch) {
  const addr = usdtAddress();
  if (!addr) return [];
  const u = new URL(`https://api.trongrid.io/v1/accounts/${addr}/transactions/trc20`);
  u.searchParams.set('only_to', 'true');
  u.searchParams.set('only_confirmed', 'true');
  u.searchParams.set('limit', '200');
  u.searchParams.set('contract_address', USDT_TRC20_CONTRACT);
  u.searchParams.set('min_timestamp', String(Math.max(0, since.getTime())));
  const headers = { Accept: 'application/json' };
  if (env.TRONGRID_API_KEY) headers['TRON-PRO-API-KEY'] = String(env.TRONGRID_API_KEY);
  const r = await fetchImpl(u, { headers, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`TronGrid ${r.status}`);
  return parseTrc20Incoming(await r.json(), addr);
}
