// Ödeme siparişleri: oluşturma, doğrulanınca Coin yazma (BİR KERE), süre aşımı, USDT izleyici.
//
// Para güvenliği:
//  * Coin yalnızca fulfillOrder içinde yazılır. Sipariş satırı kilitlenir (FOR UPDATE); 'paid' olan sipariş ikinci kez
//    yazılamaz. Aynı ödeme kimliği (provider_ref) iki siparişe bağlanamaz (benzersiz indeks).
//  * Tutar sağlayıcının bildirdiği tutarla karşılaştırılır; eksik ödeme Coin doğurmaz (olay kaydı + yönetici incelemesi).
//  * Bonus sipariş anında hesaplanıp siparişe yazılır: ödeme sırasında oran değişse de müşteriye söylenen değişmez.
//  * Süresi geçmiş siparişe sonradan gelen ödeme de yazılır (para geldiyse Coin verilir); iptal edilmiş sipariş yazılmaz.
import { query, tx } from '../../infrastructure/database/database.js';
import { fail } from '../../shared/errors/http.js';
import { log } from '../../infrastructure/observability/log.js';
import { getConfig } from '../system/app_config.service.js';
import { addFamilyContrib } from '../families/family.service.js';
import { hub } from '../../infrastructure/websocket/realtime.js';
import { notifyUser } from '../notifications/notify.service.js';
import { loadPackages } from '../dealers/dealer_topup.service.js';
import {
  newOrderNo, tryToKurus, kurusToTry, microToUsdt, usdtAmountMicro, tierFor, nextTier, quoteBonus,
} from './payments.rules.js';
import { availableProviders, paytrCheckout, usdtAddress, fetchUsdtIncoming } from './providers.js';

const BANK_TTL_MIN = 48 * 60;

// ---------------------------------------------------------------- Teşvik
export async function loadTiers(run = query) {
  return (await run(`SELECT id, name, min_month_try, bonus_bps FROM dealer_tiers ORDER BY min_month_try`)).rows
    .map((t) => ({ id: t.id, name: t.name, minKurus: tryToKurus(t.min_month_try), bonusBps: t.bonus_bps }));
}

/** Şu an geçerli en yüksek kampanya oranı (bayi ya da kullanıcı için). */
export async function campaignFor(run, kind, priceKurus, now = new Date()) {
  const r = (await run(
    `SELECT id, title, bonus_bps, min_price_try, ends_at FROM dealer_campaigns
     WHERE active AND starts_at <= $1 AND ends_at > $1 AND applies_to IN ($2, 'all') ORDER BY bonus_bps DESC`,
    [now, kind],
  )).rows.find((x) => BigInt(priceKurus) >= tryToKurus(x.min_price_try));
  return r ? { id: r.id, title: r.title, bonusBps: r.bonus_bps, endsAt: r.ends_at } : null;
}

/** Bayinin bu ay (Türkiye saati) ödediği toptan bedel, kuruş: ödenmiş siparişler + onaylanmış eski usul talepler. */
export async function dealerMonthKurus(run, dealerId) {
  const r = (await run(
    `SELECT COALESCE((SELECT SUM(price_try) FROM payment_orders WHERE dealer_id = $1 AND status = 'paid'
              AND paid_at >= date_trunc('month', NOW() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul'), 0)
          + COALESCE((SELECT SUM(price_try) FROM dealer_topup_requests WHERE dealer_id = $1 AND status = 'approved'
              AND reviewed_at >= date_trunc('month', NOW() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul'), 0) AS t`,
    [dealerId],
  )).rows[0];
  return tryToKurus(Number(r.t).toFixed(2));
}

/** Bayi paketi için teklif: kademe bu ayki alım + bu paketle hesaplanır (büyük alım kendi kademesinden yararlanır). */
export async function quoteDealerPackage(run, dealerId, pkg, { tiers, month, campaign } = {}) {
  tiers ??= await loadTiers(run);
  month ??= await dealerMonthKurus(run, dealerId);
  const price = tryToKurus(Number(pkg.priceTry).toFixed(2));
  const tier = tierFor(tiers, month + price);
  const camp = campaign !== undefined ? campaign : await campaignFor(run, 'dealer', price);
  const q = quoteBonus({ coins: pkg.coins, packageBonus: BigInt(pkg.bonusCoins ?? 0), tierBps: tier?.bonusBps ?? 0, campaignBps: camp?.bonusBps ?? 0 });
  return { ...q, priceKurus: price, tier, campaign: camp, detail: { ...q.detail, tierName: tier?.name ?? null, campaignTitle: camp?.title ?? null } };
}

export async function dealerShop(run, dealer) {
  const cfg = await getConfig();
  const tiers = await loadTiers(run);
  const month = await dealerMonthKurus(run, dealer.id);
  const pkgs = await loadPackages(run);
  const items = [];
  for (const p of pkgs) {
    const q = await quoteDealerPackage(run, dealer.id, p, { tiers, month });
    items.push({
      code: p.code, label: p.label, coins: p.coins.toString(), priceTry: Number(p.priceTry), listTry: Number(p.listTry ?? 0),
      bonusCoins: q.bonus.toString(), bonus: q.detail, totalCoins: (BigInt(p.coins) + q.bonus).toString(),
      coinsPerTry: Number(p.priceTry) > 0 ? Math.round(Number(BigInt(p.coins) + q.bonus) / Number(p.priceTry)) : null,
    });
  }
  const cur = tierFor(tiers, month); const nxt = nextTier(tiers, month);
  return {
    packages: items,
    providers: availableProviders(cfg),
    month: { paidTry: kurusToTry(month), tier: cur ? { name: cur.name, bonusBps: cur.bonusBps } : null,
      next: nxt ? { name: nxt.name, bonusBps: nxt.bonusBps, remainingTry: kurusToTry(nxt.minKurus - month) } : null },
    tiers: tiers.map((t) => ({ name: t.name, minTry: kurusToTry(t.minKurus), bonusBps: t.bonusBps })),
    campaign: await campaignFor(run, 'dealer', 0n),
  };
}

/** Web yükleme sayfasındaki kullanıcı paketleri (coin_packages, TL) + geçerli kampanya. */
export async function userPackages(run = query) {
  const rows = (await run(`SELECT id, coins, price_cents FROM coin_packages WHERE is_active = TRUE AND currency = 'TRY' ORDER BY sort_order, coins`)).rows;
  const out = [];
  for (const r of rows) {
    const camp = await campaignFor(run, 'user', BigInt(r.price_cents));
    const q = quoteBonus({ coins: BigInt(r.coins), campaignBps: camp?.bonusBps ?? 0 });
    out.push({ id: r.id, coins: String(r.coins), priceTry: kurusToTry(r.price_cents), bonusCoins: q.bonus.toString(), campaign: camp?.title ?? null });
  }
  return out;
}

// ---------------------------------------------------------------- Sipariş
export const orderView = (o, { admin = false } = {}) => ({
  orderNo: o.order_no, kind: o.kind, status: o.status, provider: o.provider, packageCode: o.package_code,
  coins: String(o.coins), bonusCoins: String(o.bonus_coins), totalCoins: (BigInt(o.coins) + BigInt(o.bonus_coins)).toString(),
  bonus: o.bonus_detail ?? {}, priceTry: Number(o.price_try).toFixed(2), currency: o.currency,
  amount: o.currency === 'USDT' ? microToUsdt(o.amount_minor) : kurusToTry(o.amount_minor),
  pay: o.status === 'created' ? payInstructions(o) : null,
  expiresAt: o.expires_at, paidAt: o.paid_at, createdAt: o.created_at,
  ...(admin ? {
    id: o.id, userId: o.user_id, dealerId: o.dealer_id, providerRef: o.provider_ref, email: o.email, ip: o.ip, note: o.note,
    username: o.username ?? null, dealerName: o.dealer_name ?? null,
  } : {}),
});

function payInstructions(o) {
  const d = o.pay_data ?? {};
  if (o.provider === 'paytr') return { type: 'redirect', url: d.checkoutUrl ?? null };
  if (o.provider === 'usdt_trc20') return { type: 'crypto', network: 'TRON (TRC20)', token: 'USDT', address: d.address, amount: microToUsdt(o.amount_minor),
    warning: 'Tutarı TAM olarak gönderin (kuruşu dahil). Farklı tutar ya da farklı ağ ile gönderilen ödeme otomatik eşlenmez.' };
  if (o.provider === 'bank') return { type: 'bank', info: d.info, amount: kurusToTry(o.amount_minor), reference: o.order_no,
    warning: 'Açıklamaya sipariş numarasını yazın. Dekont teyit edilince Coin yüklenir.' };
  return null;
}

/**
 * Sipariş oluşturur. kind 'dealer': dealer zorunlu, paket toptan listeden. kind 'user': targetUser zorunlu, paket coin_packages.
 * Dönüş: orderView. Sağlayıcıya ulaşılamazsa sipariş 'failed' olur ve hata döner (Coin yazılmaz).
 */
export async function createOrder({ kind, provider, packageCode, dealer = null, targetUserId, buyerUserId = null, email = null, ip = '' }) {
  const cfg = await getConfig();
  if (!availableProviders(cfg).some((p) => p.id === provider)) throw fail('Bu ödeme yöntemi şu an kullanılamıyor.', 409);
  let coins; let priceKurus; let bonus; let detail; let title;
  if (kind === 'dealer') {
    if (!dealer) throw fail('Bayi hesabı yok.', 403);
    const pkg = (await loadPackages(query)).find((p) => p.code === packageCode);
    if (!pkg) throw fail('Geçersiz paket.');
    const q = await quoteDealerPackage(query, dealer.id, pkg);
    coins = BigInt(pkg.coins); priceKurus = q.priceKurus; bonus = q.bonus; detail = q.detail; title = `Bayi stoku ${pkg.label}`;
  } else {
    if (cfg.payWebTopupEnabled === false) throw fail('Web yüklemesi şu an kapalı.', 409);
    const p = (await query(`SELECT id, coins, price_cents FROM coin_packages WHERE id::text = $1 AND is_active = TRUE AND currency = 'TRY'`, [String(packageCode)])).rows[0];
    if (!p) throw fail('Geçersiz paket.');
    coins = BigInt(p.coins); priceKurus = BigInt(p.price_cents);
    const camp = await campaignFor(query, 'user', priceKurus);
    const q = quoteBonus({ coins, campaignBps: camp?.bonusBps ?? 0 });
    bonus = q.bonus; detail = { ...q.detail, campaignTitle: camp?.title ?? null }; title = `${coins} Coin`;
  }
  if (priceKurus <= 0n) throw fail('Bu paket ücretsiz; ödeme gerekmez.');
  const ttl = provider === 'bank' ? BANK_TTL_MIN : Math.max(5, Number(cfg.payOrderTtlMin) || 30);
  const base = {
    order_no: newOrderNo(), kind, user_id: targetUserId, dealer_id: dealer?.id ?? null, buyer_user_id: buyerUserId,
    package_code: String(packageCode), coins, bonus_coins: bonus, bonus_detail: detail, price_try: kurusToTry(priceKurus),
    provider, email, ip,
  };
  let amount; let currency = 'TRY'; let payData = {};
  if (provider === 'usdt_trc20') {
    currency = 'USDT';
    payData = { address: usdtAddress() };
  } else if (provider === 'bank') {
    payData = { info: String(cfg.payBankInfo || '') };
    amount = priceKurus;
  } else {
    amount = priceKurus;
  }
  const insert = (amt) => query(
    `INSERT INTO payment_orders(order_no, kind, user_id, dealer_id, buyer_user_id, package_code, coins, bonus_coins, bonus_detail, price_try,
       amount_minor, currency, provider, pay_data, email, ip, expires_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, NOW() + ($17::int * INTERVAL '1 minute')) RETURNING *`,
    [base.order_no, kind, base.user_id, base.dealer_id, buyerUserId, base.package_code, coins.toString(), bonus.toString(), JSON.stringify(detail),
      base.price_try, amt.toString(), currency, provider, JSON.stringify(payData), email, ip, ttl],
  );
  let order;
  if (provider === 'usdt_trc20') {
    // Açık siparişler arasında benzersiz tutar: çakışırsa başka bir ek dene (benzersiz indeks son sözü söyler).
    for (let i = 0; i < 12 && !order; i++) {
      const off = 1 + Math.floor(Math.random() * 9999);
      try { order = (await insert(usdtAmountMicro(priceKurus, cfg.payUsdtRateKurus, off))).rows[0]; } catch (e) { if (e.code !== '23505') throw e; }
    }
    if (!order) throw fail('Şu an çok sayıda açık USDT siparişi var; birkaç dakika sonra deneyin.', 503);
  } else {
    order = (await insert(amount)).rows[0];
  }
  if (provider === 'paytr') {
    try {
      const out = await paytrCheckout(order, { ip: ip || '127.0.0.1', email: email || `siparis+${order.order_no.toLowerCase()}@trlive.invalid`, title });
      order = (await query(`UPDATE payment_orders SET pay_data = $2 WHERE id = $1 RETURNING *`, [order.id, JSON.stringify(out)])).rows[0];
    } catch (e) {
      await query(`UPDATE payment_orders SET status = 'failed', note = $2 WHERE id = $1`, [order.id, String(e.message).slice(0, 300)]);
      await event(query, order.id, provider, 'checkout_error', false, { message: e.message });
      throw e;
    }
  }
  log.info('payment_order_created', { orderNo: order.order_no, kind, provider, priceTry: base.price_try, coins: coins.toString(), bonus: bonus.toString() });
  return orderView(order);
}

const event = (run, orderId, provider, kind, ok, data) => run(
  `INSERT INTO payment_events(order_id, provider, kind, ok, data) VALUES($1,$2,$3,$4,$5)`, [orderId, provider, kind, ok, JSON.stringify(data ?? {})],
);

/**
 * Ödeme doğrulandı: Coin'i yazar. Çağıran tx içinde (c). Dönüş: { already, order, credited }.
 * amountMinor verilirse siparişin tutarıyla aynı olmalı (eksik ödeme yazılmaz).
 */
export async function fulfillOrder(c, { orderNo, provider, providerRef, amountMinor = null, adminId = null, source = 'provider' }) {
  const o = (await c.query(`SELECT * FROM payment_orders WHERE order_no = $1 FOR UPDATE`, [orderNo])).rows[0];
  if (!o) throw fail('Sipariş bulunamadı.', 404);
  if (provider && o.provider !== provider) throw fail('Sipariş başka bir ödeme yöntemine ait.', 409);
  if (o.status === 'paid') return { already: true, order: o };
  if (o.status === 'cancelled') throw fail('Sipariş iptal edilmiş; ödeme için yönetimle görüşün.', 409);
  if (amountMinor !== null && BigInt(amountMinor) !== BigInt(o.amount_minor)) {
    await event(c.query.bind(c), o.id, o.provider, 'amount_mismatch', false, { expected: String(o.amount_minor), got: String(amountMinor), providerRef });
    throw fail('Ödenen tutar sipariş tutarıyla aynı değil.', 409);
  }
  const total = BigInt(o.coins) + BigInt(o.bonus_coins);
  const paid = (await c.query(
    `UPDATE payment_orders SET status = 'paid', paid_at = NOW(), provider_ref = $2, decided_by = $3 WHERE id = $1 RETURNING *`,
    [o.id, providerRef ?? null, adminId],
  )).rows[0];
  if (o.kind === 'dealer') {
    const d = (await c.query(`SELECT id, name, owner_user_id, coin_balance FROM dealer_accounts WHERE id = $1 FOR UPDATE`, [o.dealer_id])).rows[0];
    if (!d) throw fail('Bayi hesabı bulunamadı.', 404);
    const after = (await c.query(
      `UPDATE dealer_accounts SET coin_balance = coin_balance + $2, stock_cost_try = stock_cost_try + $3 WHERE id = $1 RETURNING coin_balance`,
      [d.id, total.toString(), o.price_try],
    )).rows[0].coin_balance;
    await c.query(
      `INSERT INTO dealer_transactions(dealer_id, admin_id, type, coin_amount, description, cost_try, price_try, order_id)
       VALUES($1,$2,'stock_purchase',$3,$4,$5,$5,$6)`,
      [d.id, adminId, String(o.coins), `Stok alımı ${o.package_code} (${o.order_no}, ${providerName(o.provider)})`, o.price_try, o.id],
    );
    if (BigInt(o.bonus_coins) > 0n) {
      const b = o.bonus_detail ?? {};
      const parts = [BigInt(b.package ?? 0) > 0n ? `paket ${b.package}` : null, BigInt(b.tier ?? 0) > 0n ? `${b.tierName ?? 'kademe'} ${b.tier}` : null,
        BigInt(b.campaign ?? 0) > 0n ? `${b.campaignTitle ?? 'kampanya'} ${b.campaign}` : null].filter(Boolean).join(', ');
      await c.query(
        `INSERT INTO dealer_transactions(dealer_id, admin_id, type, coin_amount, description, cost_try, order_id) VALUES($1,$2,'bonus',$3,$4,0,$5)`,
        [d.id, adminId, String(o.bonus_coins), `Ek Coin (${parts || o.order_no})`, o.id],
      );
    }
    await c.query(
      `INSERT INTO financial_audit_logs(admin_id, user_id, action, reference_type, reference_id, amount_coins, balance_before, balance_after, metadata)
       VALUES($1,$2,'dealer_order_paid','payment_order',$3,$4,$5,$6,$7)`,
      [adminId, d.owner_user_id, o.id, total.toString(), (BigInt(after) - total).toString(), String(after),
        JSON.stringify({ orderNo: o.order_no, provider: o.provider, providerRef, priceTry: o.price_try, source })],
    );
    await event(c.query.bind(c), o.id, o.provider, 'credited', true, { providerRef, source, coins: total.toString() });
    return { already: false, order: paid, credited: { dealerId: d.id, ownerId: d.owner_user_id, coins: total.toString(), balance: String(after) } };
  }
  const u = (await c.query(`SELECT coins FROM users WHERE id = $1 FOR UPDATE`, [o.user_id])).rows[0];
  if (!u) throw fail('Kullanıcı bulunamadı.', 404);
  const before = BigInt(u.coins); const after = before + total;
  await c.query(`UPDATE users SET coins = $2, updated_at = NOW() WHERE id = $1`, [o.user_id, after.toString()]);
  await c.query(
    `INSERT INTO wallet_transactions(user_id, transaction_type, coin_amount, reference_id, description) VALUES($1,'web_topup',$2,$3,$4)`,
    [o.user_id, total.toString(), o.order_no, `Web yükleme ${o.coins}${BigInt(o.bonus_coins) > 0n ? ` + ${o.bonus_coins} ek` : ''} Coin (${providerName(o.provider)})`],
  );
  await c.query(
    `INSERT INTO financial_audit_logs(admin_id, user_id, action, reference_type, reference_id, amount_coins, balance_before, balance_after, metadata)
     VALUES($1,$2,'web_topup','payment_order',$3,$4,$5,$6,$7)`,
    [adminId, o.user_id, o.id, total.toString(), before.toString(), after.toString(),
      JSON.stringify({ orderNo: o.order_no, provider: o.provider, providerRef, priceTry: o.price_try, source })],
  );
  await addFamilyContrib((t, p) => c.query(t, p), o.user_id, BigInt(o.coins));
  await event(c.query.bind(c), o.id, o.provider, 'credited', true, { providerRef, source, coins: total.toString() });
  return { already: false, order: paid, credited: { userId: o.user_id, coins: total.toString(), balance: after.toString() } };
}

export const providerName = (p) => ({ paytr: 'Kart', usdt_trc20: 'USDT', bank: 'Havale' }[p] ?? p);

/** Yazma sonrası canlı bildirimler (işlem bittikten sonra çağrılır; hata parayı etkilemez). */
export function announceCredit(out) {
  if (!out || out.already || !out.credited) return;
  const x = out.credited;
  if (x.dealerId) {
    if (x.ownerId) {
      hub.sendToUser(x.ownerId, { type: 'dealer_balance', coinBalance: x.balance });
      notifyUser(x.ownerId, 'dealer_credit', '📦 Stok yüklendi', `${Number(x.coins).toLocaleString('tr-TR')} Coin bayi stokunuza eklendi.`, { coins: x.coins });
    }
  } else {
    hub.sendToUser(x.userId, { type: 'wallet', coins: x.balance });
    notifyUser(x.userId, 'dealer_credit', '💰 Coin yüklendi', `Web yüklemesi: ${Number(x.coins).toLocaleString('tr-TR')} Coin hesabına eklendi.`, { coins: x.coins });
  }
}

/** Sağlayıcıdan gelen doğrulanmış ödeme: tx + bildirim. Aynı ödeme tekrar gelirse { already: true }. */
export async function settle(args) {
  const out = await tx((c) => fulfillOrder(c, args));
  announceCredit(out);
  if (!out.already) log.warn('payment_order_paid', { orderNo: args.orderNo, provider: args.provider, source: args.source ?? 'provider' });
  return out;
}

export async function failOrder(orderNo, provider, data) {
  const r = await query(`UPDATE payment_orders SET status = 'failed' WHERE order_no = $1 AND status = 'created' RETURNING id`, [orderNo]);
  const id = r.rows[0]?.id ?? (await query(`SELECT id FROM payment_orders WHERE order_no = $1`, [orderNo])).rows[0]?.id ?? null;
  await event(query, id, provider, 'failed', false, data);
}

/** Süresi geçen siparişler 'expired' olur (USDT tutarı serbest kalır). Sonradan gelen ödeme yine eşlenir (bkz. izleyici). */
export async function expireOrders() {
  const r = await query(`UPDATE payment_orders SET status = 'expired' WHERE status = 'created' AND expires_at < NOW() RETURNING id`);
  return r.rowCount;
}

/**
 * USDT izleyici: açık (ve son 24 saatte süresi geçmiş) siparişlerin tutarlarıyla gelen transferleri eşler.
 * Önce açık sipariş aranır; yoksa aynı tutarda TEK süresi geçmiş sipariş varsa ona yazılır (iki tane varsa yöneticiye bırakılır).
 */
export async function runUsdtWatcher({ fetchImpl } = {}) {
  const open = (await query(
    `SELECT MIN(created_at) AS since, COUNT(*)::int AS n FROM payment_orders
     WHERE provider = 'usdt_trc20' AND (status = 'created' OR (status = 'expired' AND expires_at > NOW() - INTERVAL '24 hours'))`,
  )).rows[0];
  if (!open.n) return { checked: 0, credited: 0 };
  const txs = await fetchUsdtIncoming(new Date(new Date(open.since).getTime() - 120e3), fetchImpl);
  let credited = 0;
  for (const t of txs) {
    if ((await query(`SELECT 1 FROM payment_orders WHERE provider = 'usdt_trc20' AND provider_ref = $1`, [t.txid])).rowCount) continue;
    const cand = (await query(
      `SELECT order_no, status FROM payment_orders WHERE provider = 'usdt_trc20' AND amount_minor = $1 AND created_at <= $2
         AND (status = 'created' OR (status = 'expired' AND expires_at > NOW() - INTERVAL '24 hours'))
       ORDER BY (status = 'created') DESC, created_at DESC`,
      [t.micro.toString(), new Date(t.at.getTime() + 60e3)],
    )).rows;
    const pick = cand.find((x) => x.status === 'created') ?? (cand.length === 1 ? cand[0] : null);
    if (!pick) {
      await event(query, null, 'usdt_trc20', cand.length ? 'ambiguous' : 'unmatched', false, { txid: t.txid, from: t.from, amount: microToUsdt(t.micro) });
      continue;
    }
    try {
      const out = await settle({ orderNo: pick.order_no, provider: 'usdt_trc20', providerRef: t.txid, amountMinor: t.micro, source: 'trongrid' });
      if (!out.already) credited += 1;
    } catch (e) {
      log.error('usdt_settle_failed', { orderNo: pick.order_no, txid: t.txid, message: e.message });
    }
  }
  return { checked: txs.length, credited };
}

/** 60 sn'de bir: süre aşımı + (açık USDT siparişi varsa) zincir kontrolü. */
export function startPaymentTicker(nonOverlapping, intervalMs = 60e3) {
  const t = setInterval(nonOverlapping(async () => {
    try {
      await expireOrders();
      if (usdtAddress()) await runUsdtWatcher();
    } catch (e) {
      log.error('payment_tick_failed', { message: e.message });
    }
  }), intervalMs);
  t.unref();
  return t;
}
