// Ay içi maaş ödemesi (avans): kota dolunca maaş AVANS olarak hemen Fasulye yatar (kural: paytable.rules.js evaluateSimplePay).
//
//  - Tüm şartlar (elmas bozdurmama, gün, saat) tamamsa maaşın tamamı; biri eksikse %50'si, tam dolara aşağı yuvarlanarak.
//  - Her turda güncel hak ediş yeniden hesaplanır; yalnızca daha önce ödenenden FAZLASI yatar (ör. saatler tamamlanınca kalanı).
//  - Avans sıradan Fasulyedir: Coin'e çevrilebilir, dolar olarak gönderilebilir/çekilebilir (kilit yok).
//  - Kota kadar elmas avansla birlikte Fasulyeye çevrilir (bakiyeden düşer); dönem kapanışı aynı elması ikinci kez düşmez.
//  - Dönem kapanışında (closePeriod) tam hak ediş aynı kuralla hesaplanır, ödenen avanslar düşülür, kalan yatırılır.
//
// Güvenlik: ayar `instantSalaryEnabled` varsayılan AÇIK (migration 116; panelde acil durdurma kutusu). Ağırlıklı maaş açıkken avans verilmez. Her avans, closePeriod ile AYNI
// kilidi ('payout_close') alır: ya kapanıştan önce işlenir ve kapanışta düşülür, ya da kapanıştan sonra reddedilir.
// Telefonu doğrulanmamış yayıncıya (SALARY_PAYABLE_SQL) avans yatmaz.
import { query, tx } from '../../infrastructure/database/database.js';
import { log } from '../../infrastructure/observability/log.js';
import { periodBounds } from '../games/settlement.service.js';
import { loadPayConfig, estimateHosts } from '../agencies/agency_metrics.service.js';
import { creditUsd, SALARY_PAYABLE_SQL } from './usd_wallet.service.js';
import { advanceDue } from './instant_salary.rules.js';
import { getConfig, phoneVerifyOn } from '../system/app_config.service.js';

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

/**
 * "Maaşım neden yatmadı?" teşhisi (v2.152.22). Yayıncı ekranı ve yönetim paneli aynı sonucu gösterir.
 * Dönüş: { ok, reasons: [{ code, text }], paidCents (bu dönem yatan avans), estimatedCents (bu dönem hak edilen sesli maaş),
 *          instant (avans açık mı) }. reasons boşsa ve estimatedCents > 0 ise maaş 3 dakika içinde yatar.
 */
export async function salaryStatus(userId, { now = new Date(), run = query } = {}) {
  const cfg = await loadPayConfig(run);
  const s = cfg.settings;
  const b = periodBounds(s.cycle, now);
  const row = (await run(
    `SELECT b.user_id, b.status, b.agency_id, b.approved_at, b.pay_method_pref, b.contract_tier,
            (u.phone IS NOT NULL) AS has_phone, (u.phone_verified_at IS NOT NULL) AS phone_ok,
            (${SALARY_PAYABLE_SQL}) AS payable, a.status AS agency_status
     FROM users u LEFT JOIN broadcasters b ON b.user_id = u.id LEFT JOIN agencies a ON a.id = b.agency_id WHERE u.id = $1`, [userId],
  )).rows[0];
  const reasons = [];
  const add = (code, text) => reasons.push({ code, text });
  const paid = BigInt((await run(
    `SELECT COALESCE(SUM(cents), 0)::text AS c FROM salary_advances WHERE user_id = $1 AND applied_period_id IS NULL AND created_at >= $2 AND created_at < $3`,
    [userId, b.start, b.end],
  )).rows[0].c);
  const base = { periodKey: b.key, paidCents: paid.toString(), instant: s.instantSalaryEnabled === true, monthEndConvert: s.monthEndDiamondConvert === true };
  if (!row || !row.status) { add('not_broadcaster', 'Yayıncı değilsin. Maaş yalnızca bir ajansa bağlı onaylı yayıncılara ödenir.'); return { ...base, ok: false, reasons, estimatedCents: '0' }; }
  if (row.status !== 'approved') add('not_approved', 'Yayıncılığın henüz onaylanmadı.');
  if (!row.agency_id) add('no_agency', 'Bir ajansa bağlı değilsin. Maaş yalnızca ajanstaki yayıncıya hesaplanır.');
  else if (row.agency_status !== 'active') add('agency_inactive', 'Ajansın etkin değil.');
  const sms = phoneVerifyOn(await getConfig());
  const where = sms ? 'Ayarlar → Hesap güvenliği → Telefon numarası' : 'SMS doğrulaması şu an kapalı; destek ekibine yaz, telefonunu panelden doğrulasınlar';
  if (!row.has_phone) add('phone_missing', `Hesabına telefon numarası bağlı değil. Maaş yalnızca doğrulanmış telefonu olan hesaba yatar (${where}).`);
  else if (!row.phone_ok) add('phone_unverified', `Telefon numaran doğrulanmamış. Maaş yalnızca doğrulanmış telefona yatar (${where}).`);
  if (row.phone_ok && !row.payable) add('contract_missing', 'Yayıncı sözleşmesini kabul etmen gerekiyor (Ayarlar → Sözleşmelerim).');
  if (!sms && (!row.has_phone || !row.phone_ok)) base.smsOff = true;
  if (s.instantSalaryEnabled !== true) add('instant_off', 'Ay içi maaş (avans) yönetim tarafından durduruldu; maaşın dönem kapanınca yatar.');
  if (s.salaryWeightedEnabled === true) add('weighted', 'Ağırlıklı maaş sistemi açık: maaş dönem kapanınca hesaplanıp yatar.');
  let estimated = 0n;
  if (row.status === 'approved') {
    const x = (await estimateHosts([row], cfg, b, run)).get(userId);
    if (x) {
      estimated = x.eval.audioCents;
      const next = x.eval.next;
      if (estimated <= 0n) {
        // Kota dolmuş ama bakiye yetmiyor mu (bozdurma), yoksa kota hiç dolmadı mı?
        const sorted = [...cfg.levels].sort((p, q) => (p.diamonds < q.diamonds ? -1 : 1));
        const first = sorted[0];
        const periodDiamonds = s.splitByRoomType !== false ? x.metrics.audio.diamonds : x.metrics.diamonds;
        if (first && periodDiamonds >= first.diamonds && s.monthEndDiamondConvert === true) {
          add('balance_short', `Bu dönem ${periodDiamonds} elmas aldın ama bakiyende ilk kota kadar (${first.diamonds}) elmas yok. Maaş, kota kadar elmas bakiyede durursa ödenir; bozdurulan elmas sayılmaz.`);
        } else {
          add('quota', next ? `Maaş kotası dolmadı: ilk seviye için ${x.eval.nextRemaining} elmas daha gerekiyor.` : 'Maaş kotası dolmadı.');
        }
        if (x.eval.videoCents > 0n) add('video_month_end', 'Görüntülü yayın maaşın dönem kapanınca yatar (ay içi avans yalnızca sesli maaş içindir).');
      }
    }
  }
  return { ...base, ok: reasons.length === 0 && estimated > 0n, reasons, estimatedCents: estimated.toString() };
}
