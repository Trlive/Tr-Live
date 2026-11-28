// Ödeme ve bayilik kuralları: saf fonksiyonlar (veritabanı ve ağ yok), birim testlerle sınanır.
import crypto from 'node:crypto';
import { fail } from '../../shared/errors/http.js';

/** PayTR merchant_oid yalnızca harf/rakam kabul eder; tahmin edilemez olsun diye 16 rastgele karakter. */
export function newOrderNo() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'TR';
  for (const b of crypto.randomBytes(16)) s += abc[b % abc.length];
  return s;
}
export const ORDER_NO_RE = /^TR[A-Z0-9]{16}$/;

// ---------------------------------------------------------------- Para birimleri
/** "2500" / "2500.5" / 2500 → kuruş (BigInt). NUMERIC sütun metni de kabul edilir. */
export function tryToKurus(v) {
  const s = String(v ?? '').trim();
  const m = /^(\d{1,12})(?:\.(\d{1,4}))?$/.exec(s);
  if (!m) throw fail('Tutar geçersiz.');
  const frac = (m[2] ?? '').padEnd(2, '0');
  // Kuruştan küçük basamak yukarı yuvarlanır (müşteri aleyhine değil, eksik tahsilat olmasın diye sağlayıcıya tam kuruş gider).
  const whole = BigInt(m[1]) * 100n + BigInt(frac.slice(0, 2));
  return frac.length > 2 && /[1-9]/.test(frac.slice(2)) ? whole + 1n : whole;
}
export const kurusToTry = (k) => { const v = BigInt(k); return `${v / 100n}.${String(v % 100n).padStart(2, '0')}`; };
export const microToUsdt = (m) => { const v = BigInt(m); return `${v / 1_000_000n}.${String(v % 1_000_000n).padStart(6, '0')}`; };

/**
 * USDT tutarı: TL bedel / kur, 0,01 USDT'ye YUKARI yuvarlanır, sonra siparişi ayırt eden küçük bir ek (0,000001–0,009999).
 * Gelen transfer bu tutarla siparişe eşlenir; ek, müşteriye en fazla 1 kuruştan az maliyet çıkarır.
 * rateKurus: 1 USDT kaç kuruş (ör. 4250 = 42,50 TL). offset: 1–9999 (çağıran benzersizliği veritabanıyla sağlar).
 */
export function usdtAmountMicro(priceKurus, rateKurus, offset) {
  const p = BigInt(priceKurus); const r = BigInt(rateKurus);
  if (r <= 0n) throw fail('USDT kuru ayarlanmamış.', 503);
  const cents = (p * 100n + r - 1n) / r; // USDT sent, yukarı
  const o = BigInt(offset);
  if (o < 1n || o > 9999n) throw new Error('offset 1-9999 olmalı');
  return cents * 10_000n + o;
}

// ---------------------------------------------------------------- Teşvik
/** Bu ayki toptan alım tutarına (TL, kuruş) göre kademe: eşiği geçen en yüksek kademe. tiers: [{ name, minKurus, bonusBps }]. */
export function tierFor(tiers, monthKurus) {
  let best = null;
  for (const t of [...tiers].sort((a, b) => (a.minKurus < b.minKurus ? -1 : 1))) if (BigInt(monthKurus) >= t.minKurus) best = t;
  return best;
}
export function nextTier(tiers, monthKurus) {
  return [...tiers].sort((a, b) => (a.minKurus < b.minKurus ? -1 : 1)).find((t) => t.minKurus > BigInt(monthKurus)) ?? null;
}

/** Toplam ek oran üst sınırı (kademe + kampanya): yanlış ayarla bedavaya Coin dağıtılmasın. */
export const MAX_BONUS_BPS = 6000;

/**
 * Ek Coin hesabı. Paket bonusu sabit; kademe ve kampanya oranları paketin Coin'ine uygulanır (aşağı yuvarlanır).
 * Dönüş: { bonus, detail } — detail siparişe yazılır (sonradan oran değişse de bu sipariş için söz verilen ek değişmez).
 */
export function quoteBonus({ coins, packageBonus = 0n, tierBps = 0, campaignBps = 0 }) {
  const c = BigInt(coins);
  const t = Math.min(MAX_BONUS_BPS, Math.max(0, tierBps | 0));
  const k = Math.min(MAX_BONUS_BPS - t, Math.max(0, campaignBps | 0));
  const tierPart = (c * BigInt(t)) / 10000n;
  const campPart = (c * BigInt(k)) / 10000n;
  const pkg = BigInt(packageBonus);
  return {
    bonus: pkg + tierPart + campPart,
    detail: { package: pkg.toString(), tier: tierPart.toString(), tierBps: t, campaign: campPart.toString(), campaignBps: k },
  };
}

// ---------------------------------------------------------------- Stok maliyeti (ağırlıklı ortalama)
// NUMERIC(18,4) değerler 1e-4 TL birimine ölçeklenmiş BigInt olarak işlenir (kayan nokta hatası yok).
export function toScaled4(v) {
  const s = String(v ?? '0').trim();
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`sayı değil: ${s}`);
  const n = BigInt(m[2]) * 10000n + BigInt((m[3] ?? '').padEnd(4, '0').slice(0, 4));
  return m[1] ? -n : n;
}
export const fromScaled4 = (n) => {
  const v = BigInt(n); const a = v < 0n ? -v : v;
  return `${v < 0n ? '-' : ''}${a / 10000n}.${String(a % 10000n).padStart(4, '0')}`;
};

/**
 * Stoktan `coins` çıkarken düşen maliyet: stok maliyeti × coins / bakiye (aşağı yuvarlanır). Son Coin de çıkınca kalan
 * maliyetin tamamı düşer (yuvarlama artığı stokta kalmasın).
 */
export function costOut(stockCost4, balance, coins) {
  const b = BigInt(balance); const c = BigInt(coins); const s = BigInt(stockCost4);
  if (b <= 0n || s <= 0n) return 0n;
  if (c >= b) return s;
  return (s * c) / b;
}

/** Kâr özeti: gelir (müşteriden alınan), satılan malın maliyeti, brüt kâr ve marj (baz puan). Değerler 1e-4 ölçekli. */
export function profitSummary({ revenue4, cogs4 }) {
  const r = BigInt(revenue4); const c = BigInt(cogs4);
  const profit = r - c;
  return { revenue: fromScaled4(r), cogs: fromScaled4(c), profit: fromScaled4(profit), marginBps: r > 0n ? Number((profit * 10000n) / r) : null };
}

// ---------------------------------------------------------------- PayTR (iFrame API)
// Belge: https://dev.paytr.com — token: base64(HMAC-SHA256(hash_str + merchant_salt, merchant_key)).
export function paytrToken({ merchantId, merchantKey, merchantSalt, userIp, merchantOid, email, paymentAmount, userBasket, noInstallment, maxInstallment, currency, testMode }) {
  const hashStr = `${merchantId}${userIp}${merchantOid}${email}${paymentAmount}${userBasket}${noInstallment}${maxInstallment}${currency}${testMode}`;
  return crypto.createHmac('sha256', merchantKey).update(hashStr + merchantSalt).digest('base64');
}

/** Geri çağrı imzası: base64(HMAC-SHA256(merchant_oid + merchant_salt + status + total_amount, merchant_key)). Sabit zamanlı karşılaştırma. */
export function paytrCallbackValid({ merchantKey, merchantSalt }, body) {
  const expected = crypto.createHmac('sha256', merchantKey)
    .update(`${body.merchant_oid ?? ''}${merchantSalt}${body.status ?? ''}${body.total_amount ?? ''}`).digest('base64');
  const a = Buffer.from(expected); const b = Buffer.from(String(body.hash ?? ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------- USDT (TRC20)
export const USDT_TRC20_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
export const TRON_ADDRESS_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

/**
 * TronGrid "trc20 transactions" yanıtından bu adrese gelen USDT transferlerini çıkarır.
 * Yalnızca: alıcı = adresimiz, sözleşme = resmi USDT, tutar tam sayı. Dönüş: [{ txid, from, micro, at }].
 */
export function parseTrc20Incoming(json, address) {
  const out = [];
  for (const t of json?.data ?? []) {
    if (t?.to !== address) continue;
    if (t?.token_info?.address !== USDT_TRC20_CONTRACT) continue;
    if (Number(t?.token_info?.decimals ?? 6) !== 6) continue;
    if (!/^\d{1,20}$/.test(String(t?.value ?? ''))) continue;
    if (!/^[0-9a-f]{64}$/i.test(String(t?.transaction_id ?? ''))) continue;
    out.push({ txid: String(t.transaction_id).toLowerCase(), from: String(t.from ?? ''), micro: BigInt(t.value), at: new Date(Number(t.block_timestamp) || 0) });
  }
  return out;
}
