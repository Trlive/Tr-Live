// Ajans / yayıncı maaşları (v2.66: 44 seviyeli tablo, iki maaş yöntemi, ajans primi, asistan ve davet primleri).
import { query, tx } from '../../infrastructure/database/database.js';
import { fail } from '../../shared/errors/http.js';
import { periodBounds, parsePeriodKey, commissionFor, nextCommissionTier } from '../games/settlement.service.js';
import { loadPayConfig, gradesJson, hostPeriodMetrics, agencyGiftRows, eventCounts, estimateHosts, evaluateHost, videoRules } from '../agencies/agency_metrics.service.js';
import { evaluatePay, agencyPrim, payLevelJson } from '../games/paytable.rules.js';
import { grantLevelRewards } from '../agencies/agency_rewards.service.js';
import { creditPeriod } from './usd_wallet.service.js';
import { getConfig } from '../system/app_config.service.js';
import { evaluateWeightedSalary, weightedJson } from './salary_weights.rules.js';

export const loadConfig = loadPayConfig;

export const configJson = (cfg) => ({
  // settings zaten salaryWeights ve salaryWeightedEnabled'ı taşıyor; payout_periods.config
  // bu nesneyi dondurduğu için kapanmış bir dönemin kuralları sonradan değişmiyor.
  // Sahibinin şartı: "ağırlık değişikliği yalnızca YENİ dönemlere uygulanır."
  settings: cfg.settings,
  payLevels: cfg.levels.map(payLevelJson),
  videoPayLevels: (cfg.videoLevels ?? cfg.levels).map(payLevelJson),
  agencyGrades: gradesJson(cfg.grades),
  // v2.65 ve öncesi uygulamalar için: maaş tablosu eski kademe biçiminde (Maaş 1), komisyon tablosu artık yok.
  salaryTiers: cfg.levels.map((l) => ({ level: l.level, hours: l.hours ?? 0, diamonds: String(l.diamonds), salaryCents: String(l.salary1Cents) })),
  commissionTiers: [],
});

/** Yayıncının güncel dönem ilerlemesi (Yayıncı Merkezi). host: { user_id, approved_at, pay_method_pref } */
export async function hostProgress(host, cfg, date = new Date(), run = query) {
  const b = periodBounds(cfg.settings.cycle, date);
  const x = (await estimateHosts([host], cfg, b, run)).get(host.user_id);
  return progressJson(x, cfg, b, host.pay_method_pref ?? 0);
}

export function progressJson(x, cfg, b, pref = 0) {
  const e = x.eval; const m = x.metrics;
  return {
    periodKey: b.key, cycle: b.cycle, startsAt: b.start, endsAt: b.end,
    daysLeft: Math.max(0, Math.ceil((new Date(b.end).getTime() - Date.now()) / 86400000)),
    seconds: m.seconds, todaySeconds: m.todaySeconds, validDays: m.validDays, gameSeconds: m.gameSeconds,
    diamonds: String(m.diamonds), balance: String(x.balance),
    level1: e.level1?.level ?? null, level2: e.level2?.level ?? null, method: e.method,
    salary1Cents: String(e.salary1), salary2Cents: String(e.salary2),
    tier: e.level?.level ?? null, current: e.level ? payLevelJson(e.level) : null,
    estimatedCents: String(e.salaryCents), baseCents: String(e.baseCents), atRisk: e.penalty,
    // Sesli / görüntülü ayrı hesap: estimatedCents iki tarafın toplamıdır.
    split: e.split === true,
    audio: { seconds: m.audio.seconds, validDays: m.audio.validDays, diamonds: String(m.audio.diamonds), level: e.level?.level ?? null, cents: String(e.audioCents ?? e.salaryCents) },
    video: e.video ? {
      seconds: m.video.seconds, rawSeconds: m.video.rawSeconds, validDays: m.video.validDays, diamonds: String(m.video.diamonds),
      level: e.video.level?.level ?? null, cents: String(e.videoCents), shortfall: e.video.shortfall === true,
      blocked: e.video.blocked ? e.video.blocked.level : null, blockedBy: e.video.blockedBy,
      next: e.video.next ? { level: e.video.next.level, remaining: String(e.video.nextRemaining) } : null,
    } : null,
    consumeDiamonds: String(e.consume),
    blocked: e.blocked ? payLevelJson(e.blocked) : null, blockedBy: e.blockedBy,
    hoursMet: !e.blockedBy.includes('hours'), eventsMet: e.eventsMet, eventCount: x.eventCount,
    requireOfficialEvents: cfg.settings.requireOfficialEvents, minEventCount: cfg.settings.minEventCount,
    next: e.next ? { ...payLevelJson(e.next), salaryCents: String(e.next.salary1Cents), remaining: String(e.nextRemaining) } : null,
    payPref: Number(pref) === 1 ? 1 : 0,
    requirements: {
      validDayMinutes: cfg.settings.validDayMinutes, requireGameHours: cfg.settings.requireGameHours, allowBalanceMethod: cfg.settings.allowBalanceMethod,
    },
    currency: cfg.settings.currency,
  };
}

export const hostStatementJson = (x) => ({
  id: x.id, periodKey: x.period_key, startsAt: x.starts_at, endsAt: x.ends_at,
  userId: x.user_id, username: x.username, displayName: x.display_name ?? undefined, agencyId: x.agency_id, agencyName: x.agency_name ?? undefined,
  seconds: Number(x.seconds), diamonds: String(x.diamonds), tier: x.tier_level,
  validDays: x.valid_days ?? 0, gameSeconds: Number(x.game_seconds ?? 0), balanceDiamonds: String(x.balance_diamonds ?? 0),
  level1: x.level1 ?? null, level2: x.level2 ?? null, salary1Cents: String(x.salary1_cents ?? 0), salary2Cents: String(x.salary2_cents ?? 0),
  method: x.pay_method ?? null, consumedDiamonds: String(x.consumed_diamonds ?? 0), rewards: x.rewards ?? {},
  baseSalaryCents: String(x.base_salary_cents), penaltyApplied: x.penalty_applied, salaryCents: String(x.salary_cents),
  eventsOk: x.events_ok, status: x.status, paidAt: x.paid_at, payNote: x.pay_note ?? null,
  // Ağırlıklı hak ediş. earnedBps null ise o dönemde bu hesap yapılmadı (sözleşme kademesi
  // atanmamış ya da dönem bu sürümden önce kapanmış) — 0 ile karıştırılmamalı.
  weighted: x.earned_bps == null ? null : {
    contractTier: x.contract_tier ?? null,
    baseCents: String(x.base_tier_cents ?? 0),
    earnedBps: x.earned_bps,
    earnedCents: String(x.weighted_cents ?? 0),
    required: { days: x.required_days ?? 0, seconds: Number(x.required_seconds ?? 0), diamonds: String(x.required_diamonds ?? 0) },
    diamondTargetOk: x.diamond_target_ok,
    parts: Array.isArray(x.weight_parts) ? x.weight_parts : [],
  },
  // Maaşı hangi hesap belirledi: 'weighted' ya da 'tier' (eski basamak hesabı).
  salaryBasis: x.salary_basis ?? 'tier',
});
export const agencyStatementJson = (x) => ({
  id: x.id, periodKey: x.period_key, startsAt: x.starts_at, endsAt: x.ends_at, agencyId: x.agency_id, agencyName: x.agency_name,
  teamDiamonds: String(x.team_diamonds), hostCount: x.host_count, commissionBps: x.commission_bps,
  commissionDiamonds: String(x.commission_diamonds),
  commissionCents: String(x.commission_cents ?? 0), assistantCents: String(x.assistant_cents ?? 0), ownerCents: String(x.owner_cents ?? 0),
  details: Array.isArray(x.details) ? x.details : [],
  status: x.status, paidAt: x.paid_at, payNote: x.pay_note ?? null,
});
export const assistantStatementJson = (x) => ({
  id: x.id, periodKey: x.period_key, startsAt: x.starts_at, endsAt: x.ends_at, agencyId: x.agency_id, agencyName: x.agency_name ?? undefined,
  userId: x.user_id, username: x.username ?? undefined, displayName: x.display_name ?? undefined,
  shareBps: x.share_bps, hostCount: x.host_count, baseCents: String(x.base_cents), amountCents: String(x.amount_cents),
  status: x.status, paidAt: x.paid_at, payNote: x.pay_note ?? null,
});
export const referralStatementJson = (x) => ({
  id: x.id, periodKey: x.period_key, startsAt: x.starts_at, endsAt: x.ends_at,
  agencyId: x.agency_id, agencyName: x.agency_name ?? undefined, invitedAgencyId: x.invited_agency_id, invitedAgencyName: x.invited_agency_name ?? undefined,
  baseCents: String(x.base_cents), bps: x.bps, amountCents: String(x.amount_cents),
  status: x.status, paidAt: x.paid_at, payNote: x.pay_note ?? null,
});

// Dönemi kapatır: yayıncı maaşları (iki yöntem; Yöntem 2'de elmas kotası bakiyeden düşülür), seviye ödülleri,
// ajans primleri (yayıncı başına), asistan payları ve davet primleri. Bitmemiş dönem force olmadan kapanmaz.
export async function closePeriod({ adminId, periodKey, force = false }) {
  const b = parsePeriodKey(periodKey);
  if (b.end > new Date() && !force) throw fail('Bu dönem henüz bitmedi.', 409);
  return tx(async (c) => {
    const run = (t, p) => c.query(t, p);
    await c.query(`SELECT pg_advisory_xact_lock(hashtext('payout_close'))`);
    if ((await c.query(`SELECT 1 FROM payout_periods WHERE period_key = $1`, [b.key])).rowCount) throw fail('Bu dönem zaten kapatılmış.', 409);
    // Aylık ve haftalık dönemler karışırsa aynı hediyeler/mikrofon süresi iki kez ödenmesin: zaman aralığı çakışması reddedilir.
    const overlap = (await c.query(
      `SELECT period_key FROM payout_periods WHERE starts_at < $2 AND ends_at > $1 LIMIT 1`, [b.start, b.end],
    )).rows[0];
    if (overlap) throw fail(`Bu dönem, kapatılmış ${overlap.period_key} dönemiyle çakışıyor; aynı kazanç iki kez ödenemez.`, 409);
    const cfg = await loadPayConfig(run);
    const p = (await c.query(
      `INSERT INTO payout_periods(period_key, cycle, starts_at, ends_at, closed_by, config) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
      [b.key, b.cycle, b.start, b.end, adminId, JSON.stringify(configJson(cfg))],
    )).rows[0];

    // ---- Yayıncılar ----
    const hosts = (await c.query(
      `SELECT b.user_id, b.agency_id, b.approved_at, b.pay_method_pref, b.contract_tier FROM broadcasters b
       WHERE b.status = 'approved' AND b.agency_id IS NOT NULL ORDER BY b.user_id`,
    )).rows;
    const metrics = await hostPeriodMetrics(hosts, b.start, b.end, cfg.settings.validDayMinutes, run, videoRules(cfg.settings));
    const ev = cfg.settings.requireOfficialEvents ? await eventCounts(hosts.map((h) => h.user_id), b.start, b.end, run) : new Map();
    let totalSalary = 0n; let hostCount = 0;
    const rewarded = []; const paidHosts = [];
    for (const h of hosts) {
      const m = metrics.get(h.user_id);
      if (m.seconds === 0 && m.diamonds === 0n) continue; // dönemde hiç yayın / hediye yoksa özet oluşmaz
      // Satır kilitlenmez (dönem kapanırken yayıncıya hediye bekletilmesin); Yöntem 2 düşümü aşağıda koşullu UPDATE ile yapılır.
      const balance = BigInt((await c.query(`SELECT diamonds FROM users WHERE id = $1`, [h.user_id])).rows[0]?.diamonds ?? 0);
      const evOk = !cfg.settings.requireOfficialEvents || (ev.get(h.user_id) ?? 0) >= cfg.settings.minEventCount;
      // Sesli ve görüntülü ayrı hesaplanır (ayar açıksa); e.salaryCents iki tarafın toplamıdır.
      let e = evaluateHost(cfg, m, { pref: h.pay_method_pref, eventsOk: evOk, balance });

      // ---- Ağırlıklı hak ediş (sahibinin maaş tasarımı) ----
      //
      // Temel maaş yayıncının SÖZLEŞME kademesinden geliyor; koşulları ne oranda
      // tamamladıysa o oranda hak ediyor. Sözleşme kademesi yoksa null döner ve o yayıncı
      // için ağırlıklı hesap yazılmaz (uydurma temel maaş üretmek yerine).
      const tier = h.contract_tier == null ? null : cfg.levels.find((l) => l.level === h.contract_tier) ?? null;
      const w = evaluateWeightedSalary({
        tier,
        metrics: { validDays: m.validDays, seconds: m.seconds, diamonds: m.diamonds },
        eventsOk: evOk,
        weights: cfg.settings.salaryWeights,
      });

      // Hangi hesap ÖDEMEYE esas: bayrak kapalıyken eski basamak hesabı ödüyor, ağırlıklı
      // hesap yalnızca yazılıp gösteriliyor. Böylece sahibi iki sayıyı gerçek veri üzerinde
      // karşılaştırdıktan sonra geçiş yapıyor. Ağırlıklı hesap yoksa (sözleşme kademesi
      // atanmamış) bayrak açık olsa da eski hesap ödüyor: maaşsız bırakmak kabul edilemez.
      const useWeighted = cfg.settings.salaryWeightedEnabled === true && w !== null;

      // Yöntem 2 (elmas bakiyesini maaşa çevirme) YALNIZCA eski hesap öderken çalışır.
      //
      // Ağırlıklı hesapta maaş, sözleşme kademesinden geliyor; elmasla "maaş satın almak"
      // diye bir adım yok. İkisi birlikte çalışsaydı yayıncının elması düşülür, maaşı ise
      // ağırlıklı tutardan ödenirdi — yani elmasını alıp karşılığını vermemiş olurduk.
      // Yayıncı elmasını tutar, gelirini ayrıca bozdurmaya devam edebilir.
      let consumed = 0n;
      if (!useWeighted && e.method === 2) {
        const r = await c.query(
          `UPDATE users SET diamonds = diamonds - $2, updated_at = NOW() WHERE id = $1 AND diamonds >= $2 RETURNING diamonds`,
          [h.user_id, e.consume.toString()],
        );
        if (r.rowCount) {
          consumed = e.consume;
          await c.query(
            `INSERT INTO wallet_transactions(user_id, transaction_type, diamond_amount, reference_id, description) VALUES($1,'salary_conversion',$2,$3,$4)`,
            [h.user_id, (-consumed).toString(), b.key, `${b.key} maaşı (Yöntem 2): ${consumed} elmas maaşa çevrildi`],
          );
        } else {
          e = evaluateHost(cfg, m, { pref: 1, eventsOk: evOk, balance });
        }
      }
      const rewards = e.level ? await grantLevelRewards(c, h.user_id, e.level) : {};
      if (Object.keys(rewards).length) rewarded.push(h.user_id);

      const paidCents = useWeighted ? w.earnedCents : e.salaryCents;

      totalSalary += paidCents;
      hostCount += 1;
      if (paidCents > 0n) paidHosts.push({ userId: h.user_id, cents: paidCents });
      await c.query(
        `INSERT INTO host_statements(period_id, user_id, agency_id, seconds, diamonds, tier_level, base_salary_cents, penalty_applied, salary_cents, events_ok,
           valid_days, game_seconds, balance_diamonds, level1, level2, salary1_cents, salary2_cents, pay_method, consumed_diamonds, rewards,
           audio_seconds, audio_diamonds, audio_cents, video_seconds, video_diamonds, video_level, video_cents, video_shortfall,
           contract_tier, base_tier_cents, required_days, required_seconds, required_diamonds, diamond_target_ok,
           earned_bps, weighted_cents, weight_parts, salary_basis)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,
           $29,$30,$31,$32,$33,$34,$35,$36,$37,$38)`,
        [p.id, h.user_id, h.agency_id, m.seconds, m.diamonds.toString(), e.level?.level ?? null, e.baseCents.toString(), e.penalty, paidCents.toString(), evOk,
          m.validDays, m.gameSeconds, balance.toString(), e.level1?.level ?? null, e.level2?.level ?? null, e.salary1.toString(), e.salary2.toString(),
          e.method, consumed.toString(), JSON.stringify(rewards),
          e.split ? m.audio.seconds : m.seconds, (e.split ? m.audio.diamonds : m.diamonds).toString(), e.audioCents.toString(),
          e.split ? m.video.seconds : 0, (e.split ? m.video.diamonds : 0n).toString(), e.video?.level?.level ?? null, e.videoCents.toString(), e.video?.shortfall === true,
          // Ağırlıklı hesap. Hepsi NULL olabilir: sözleşme kademesi atanmamış yayıncıda
          // ağırlıklı hesap yapılmadı demek. 0 yazmak "hak etmedi" ile karışırdı.
          h.contract_tier ?? null, w ? w.baseCents.toString() : null,
          w ? w.required.days : null, w ? w.required.seconds : null, w ? w.required.diamonds.toString() : null,
          w ? w.diamondTargetOk : null,
          w ? w.earnedBps : null, w ? w.earnedCents.toString() : null, w ? JSON.stringify(w.parts) : null,
          useWeighted ? 'weighted' : 'tier'],
      );
    }

    // ---- Ajans primleri (yayıncı başına: o ajanstayken aldığı elmasa göre), asistan payları ----
    const gifts = await agencyGiftRows(null, b.start, b.end, run);
    const agencies = (await c.query(`SELECT id, referrer_agency_id FROM agencies WHERE status = 'active'`)).rows;
    const invitedBy = new Map(); // userId → { agencyId, invitedBy }
    for (const r of (await c.query(`SELECT user_id, agency_id, invited_by FROM broadcasters WHERE agency_id IS NOT NULL AND invited_by IS NOT NULL`)).rows) {
      invitedBy.set(r.user_id, { agencyId: r.agency_id, by: r.invited_by });
    }
    const assistants = new Map(); // agencyId → Map userId → shareBps
    for (const r of (await c.query(`SELECT agency_id, user_id, share_bps FROM agency_assistants WHERE status = 'active'`)).rows) {
      if (!assistants.has(r.agency_id)) assistants.set(r.agency_id, new Map());
      assistants.get(r.agency_id).set(r.user_id, r.share_bps);
    }
    let agencyCount = 0; let totalPrim = 0n; let assistantCount = 0;
    const primByAgency = new Map();
    for (const a of agencies) {
      const users = gifts.get(a.id);
      if (!users || !users.size) continue;
      let team = 0n; let prim = 0n; const details = [];
      const asBase = new Map(); // assistant → { base, hosts }
      for (const [uid, u] of users) {
        const ap = agencyPrim(cfg.levels, u.total);
        team += u.total; prim += ap.cents;
        const inv = invitedBy.get(uid);
        const by = inv && inv.agencyId === a.id && assistants.get(a.id)?.has(inv.by) ? inv.by : null;
        details.push({ userId: uid, diamonds: String(u.total), level: ap.level, cents: String(ap.cents), assistantId: by });
        if (by && ap.cents > 0n) {
          const cur = asBase.get(by) ?? { base: 0n, hosts: 0 };
          cur.base += ap.cents; cur.hosts += 1;
          asBase.set(by, cur);
        }
      }
      let asTotal = 0n;
      for (const [uid, x] of asBase) {
        const bps = assistants.get(a.id).get(uid) ?? 0;
        const amount = (x.base * BigInt(bps)) / 10000n;
        asTotal += amount;
        await c.query(
          `INSERT INTO assistant_statements(period_id, agency_id, user_id, share_bps, host_count, base_cents, amount_cents) VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [p.id, a.id, uid, bps, x.hosts, x.base.toString(), amount.toString()],
        );
        assistantCount += 1;
      }
      details.sort((x, y) => (BigInt(y.diamonds) > BigInt(x.diamonds) ? 1 : -1));
      await c.query(
        `INSERT INTO agency_statements(period_id, agency_id, team_diamonds, host_count, commission_bps, commission_diamonds,
           commission_cents, assistant_cents, owner_cents, details)
         VALUES($1,$2,$3,$4,0,0,$5,$6,$7,$8)`,
        [p.id, a.id, team.toString(), users.size, prim.toString(), asTotal.toString(), (prim - asTotal).toString(), JSON.stringify(details.slice(0, 500))],
      );
      primByAgency.set(a.id, prim);
      totalPrim += prim;
      agencyCount += 1;
    }

    // ---- Davet primleri: davet edilen ajansın priminden davet eden ajansa pay ----
    const active = new Set(agencies.map((a) => a.id));
    let referralCount = 0;
    for (const a of agencies) {
      if (!a.referrer_agency_id || !active.has(a.referrer_agency_id) || a.referrer_agency_id === a.id) continue;
      const base = primByAgency.get(a.id) ?? 0n;
      const amount = (base * BigInt(cfg.settings.referralBps)) / 10000n;
      if (amount <= 0n) continue;
      await c.query(
        `INSERT INTO referral_statements(period_id, agency_id, invited_agency_id, base_cents, bps, amount_cents) VALUES($1,$2,$3,$4,$5,$6)`,
        [p.id, a.referrer_agency_id, a.id, base.toString(), cfg.settings.referralBps, amount.toString()],
      );
      referralCount += 1;
    }

    await c.query(
      `INSERT INTO financial_audit_logs(admin_id, action, reference_type, reference_id, metadata) VALUES($1,'payout_period_close','payout_period',$2,$3)`,
      [adminId, p.id, JSON.stringify({ periodKey: b.key, hosts: hostCount, agencies: agencyCount, assistants: assistantCount, referrals: referralCount,
        totalSalaryCents: totalSalary.toString(), totalPrimCents: totalPrim.toString() })],
    );
    // Maaş ve primler dolar cüzdanlarına yatar, özetler "ödendi" olur (ayar kapalıysa eskisi gibi bekler; admin elle işaretler).
    // KYC onayı olmayan yayıncının maaşı yatmaz; özeti bekler (admin KYC'yi onaylayıp özeti ödeyince cüzdana geçer).
    let credited = { count: 0, cents: 0n };
    if ((await getConfig()).usdAutoCredit !== false) {
      await c.query(`UPDATE payout_periods SET wallet_mode = TRUE WHERE id = $1`, [p.id]);
      credited = await creditPeriod(c, p.id, adminId);
    }
    return {
      walletCredits: credited.count, walletCents: credited.cents.toString(),
      periodId: p.id, periodKey: b.key, hostStatements: hostCount, agencyStatements: agencyCount, assistantStatements: assistantCount,
      referralStatements: referralCount, totalSalaryCents: totalSalary.toString(), totalPrimCents: totalPrim.toString(),
      rewardedUserIds: rewarded, paidHosts: paidHosts.map((x) => ({ userId: x.userId, cents: x.cents.toString() })), currency: cfg.settings.currency,
    };
  });
}

export { commissionFor, nextCommissionTier };
