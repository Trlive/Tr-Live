// Ay içi maaş ödemesi (avans): kota dolunca maaş AVANS olarak hemen Fasulye yatar (kural: paytable.rules.js evaluateSimplePay).
//
//  - Tüm şartlar (elmas bozdurmama, gün, saat) tamamsa maaşın tamamı; biri eksikse %50'si, tam dolara aşağı yuvarlanarak.
//  - Her turda güncel hak ediş yeniden hesaplanır; yalnızca daha önce ödenenden FAZLASI yatar (ör. saatler tamamlanınca kalanı).
//  - Avans sıradan Fasulyedir: Coin'e çevrilebilir, dolar olarak gönderilebilir/çekilebilir (kilit yok).
//  - Kota kadar elmas avansla birlikte Fasulyeye çevrilir (bakiyeden düşer); dönem kapanışı aynı elması ikinci kez düşmez.
//  - Dönem kapanışında (closePeriod) tam hak ediş aynı kuralla hesaplanır, ödenen avanslar düşülür, kalan yatırılır.
//
// Güvenlik: ayar `instantSalaryEnabled` KAPALI başlar. Ağırlıklı maaş açıkken avans verilmez. Her avans, closePeriod ile AYNI
// kilidi ('payout_close') alır: ya kapanıştan önce işlenir ve kapanışta düşülür, ya da kapanıştan sonra reddedilir.
// Telefonu doğrulanmamış yayıncıya (SALARY_PAYABLE_SQL) avans yatmaz.
import { query, tx } from '../../infrastructure/database/database.js';
import { log } from '../../infrastructure/observability/log.js';
import { periodBounds } from '../games/settlement.service.js';
import { loadPayConfig, estimateHosts } from '../agencies/agency_metrics.service.js';
import { creditUsd, SALARY_PAYABLE_SQL } from './usd_wallet.service.js';
import { advanceDue } from './instant_salary.rules.js';

async function payAdvance(userId, b, { targetCents, consumeTotal, entitledCents }) {
  return tx(async (c) => {
    await c.query(`SELECT pg_advisory_xact_lock(hashtext('payout_close'))`);
    // Bu zaman aralığıyla çakışan bir dönem kapatılmışsa (closePeriod ile aynı denetim) avans verilmez.
    if ((await c.query(`SELECT 1 FROM payout_periods WHERE starts_at < $2 AND ends_at > $1 LIMIT 1`, [b.start, b.end])).rowCount) return 0n;
    const prev = (await c.query(
      `SELECT COALESCE(SUM(cents), 0)::text AS cents, COALESCE(SUM(diamonds_consumed), 0)::text AS dc FROM salary_advances
       WHERE user_id = $1 AND applied_period_id IS NULL AND created_at >= $2 AND created_at < $3`, [userId, b.start, b.end],
    )).rows[0];
    const due = advanceDue({ targetCents, alreadyCents: BigInt(prev.cents) });
    if (due <= 0n) return 0n;
    // Kota kadar elmas Fasulyeye çevrilir; daha önce düşülen tekrar düşülmez. Bakiye yetmiyorsa (bu arada harcandı) bu tur ödenmez.
    const need = consumeTotal > BigInt(prev.dc) ? consumeTotal - BigInt(prev.dc) : 0n;
    if (need > 0n) {
      const r = await c.query(
        `UPDATE users SET diamonds = diamonds - $2, updated_at = NOW() WHERE id = $1 AND diamonds >= $2 RETURNING diamonds`,
        [userId, need.toString()],
      );
      if (!r.rowCount) return 0n;
      await c.query(
        `INSERT INTO wallet_transactions(user_id, transaction_type, diamond_amount, reference_id, description) VALUES($1,'salary_conversion',$2,$3,$4)`,
        [userId, (-need).toString(), b.key, `${b.key} maaş avansı: ${need} elmas Fasulyeye çevrildi`],
      );
    }
    const row = (await c.query(
      `INSERT INTO salary_advances(user_id, period_key, cents, entitled_cents, floor_cents, diamonds_consumed) VALUES($1,$2,$3,$4,0,$5) RETURNING id`,
      [userId, b.key, due.toString(), entitledCents.toString(), need.toString()],
    )).rows[0];
    await creditUsd(c, { userId, cents: due, type: 'salary', refType: 'salary_advances', refId: row.id, note: `${b.key} maaş avansı` });
    return due;
  });
}

/**
 * Bir tur: yeni hediye almış yayıncıları (full=true ise tüm onaylı yayıncıları) güncel dönem için değerlendirir.
 * Dönüş: { skipped } ya da { hosts, paid, cents }.
 */
export async function runInstantSalary({ now = new Date(), full = false } = {}) {
  const cfg = await loadPayConfig(query);
  const s = cfg.settings;
  if (s.instantSalaryEnabled !== true) return { skipped: 'kapalı' };
  if (s.salaryWeightedEnabled === true) return { skipped: 'ağırlıklı maaş açık' };
  const b = periodBounds(s.cycle, now);
  const hosts = (await query(
    `SELECT b.user_id, b.agency_id, b.approved_at, b.pay_method_pref, b.contract_tier
     FROM broadcasters b JOIN users u ON u.id = b.user_id
     WHERE b.status = 'approved' AND b.agency_id IS NOT NULL AND ${SALARY_PAYABLE_SQL}
       AND ($1::boolean OR EXISTS (SELECT 1 FROM gift_transactions g WHERE g.receiver_id = b.user_id AND g.created_at >= NOW() - INTERVAL '30 minutes'))
     ORDER BY b.user_id`, [full],
  )).rows;
  if (!hosts.length) return { hosts: 0, paid: 0, cents: '0' };
  const est = await estimateHosts(hosts, cfg, b, query);
  let paid = 0; let cents = 0n;
  for (const h of hosts) {
    const x = est.get(h.user_id);
    // Yalnızca SESLİ hak ediş avans olur (görüntülü maaş ay sonunda kendi kuralıyla ödenir).
    if (!x || x.eval.audioCents <= 0n) continue;
    try {
      const due = await payAdvance(h.user_id, b, { targetCents: x.eval.audioCents, consumeTotal: x.eval.consume, entitledCents: x.eval.audioCents });
      if (due > 0n) { paid += 1; cents += due; }
    } catch (e) {
      log.error('instant_salary_failed', { userId: h.user_id, message: e.message });
    }
  }
  return { hosts: hosts.length, paid, cents: cents.toString() };
}

/** 3 dakikada bir bakar: yeni hediye alanlara bakar; her 20. turda (saatte bir) tüm yayıncıları tarar. */
export function startInstantSalaryTicker(nonOverlapping, intervalMs = 180e3) {
  let n = 0;
  const t = setInterval(
    nonOverlapping(() => runInstantSalary({ full: n++ % 20 === 0 }).then((r) => {
      if (r.paid) log.info('instant_salary_tick', { paid: r.paid, cents: r.cents });
    }).catch((e) => log.error('instant_salary_tick_failed', { message: e.message }))),
    intervalMs,
  );
  t.unref();
  return t;
}
