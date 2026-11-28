// Ajans sistemi v2: dönem ölçümleri (toplu sorgular). Gün sınırları Türkiye saatine göredir (UTC+3).
import { salaryGiftSql, scaleSelfDays, segmentOf } from './salary_rules.js';
import { query } from '../../infrastructure/database/database.js';
import { payLevelFromRow, DEFAULT_AGENCY_GRADES, evaluatePay, evaluateSimplePay, evaluateVideoPay, agencyPrim } from '../games/paytable.rules.js';
import { consumedDiamondsByUser } from '../wallet/advance_ledger.service.js';
import { validateWeights, DEFAULT_WEIGHTS } from '../wallet/salary_weights.rules.js';

const DAY = 86400;
const OFF = 10800; // +3 saat
export const dayIndex = (date) => Math.floor((Math.floor(new Date(date).getTime() / 1000) + OFF) / DAY);
export const dayStart = (idx) => new Date((idx * DAY - OFF) * 1000);
/** Gün numarası → Türkiye tarihi 'YYYY-AA-GG'. */
export const dayKey = (idx) => new Date(idx * DAY * 1000).toISOString().slice(0, 10);

/** Genel ayarlar + maaş tablosu. */
/** Ayarlardaki ağırlıkları güvenle okur. Veritabanındaki bozuk bir JSON yüzünden dönem
 *  kapanışının çökmesi, yanlış ağırlıkla hesaplamaktan da kötü olurdu: maaş hiç yazılmaz. */
function safeWeights(v) {
  try { return validateWeights(v ?? null); } catch { return { ...DEFAULT_WEIGHTS }; }
}

export async function loadPayConfig(run = query) {
  const s = (await run(`SELECT * FROM agency_settings WHERE id = 1`)).rows[0] ?? {};
  const levels = (await run(`SELECT * FROM host_pay_levels ORDER BY level`)).rows.map(payLevelFromRow);
  // Görüntülü yayın tablosu (boşsa sesli tablo kullanılır).
  const videoRows = (await run(`SELECT * FROM host_pay_levels_video ORDER BY level`)).rows.map(payLevelFromRow);
  let grades = DEFAULT_AGENCY_GRADES;
  if (Array.isArray(s.agency_grades) && s.agency_grades.length) {
    try { grades = s.agency_grades.map((g) => ({ name: String(g.name), min: BigInt(g.min) })); } catch { grades = DEFAULT_AGENCY_GRADES; }
  }
  return {
    settings: {
      cycle: s.cycle ?? 'monthly', penaltyBps: s.penalty_bps ?? 0, requireOfficialEvents: s.require_official_events === true,
      minEventCount: s.min_event_count ?? 0, currency: s.currency ?? 'USD',
      validDayMinutes: s.valid_day_minutes ?? 60, requireGameHours: s.require_game_hours === true,
      allowBalanceMethod: s.allow_balance_method !== false, maxAssistants: s.max_assistants ?? 7,
      maxAssistantBps: s.max_assistant_bps ?? 5000, referralBps: s.referral_bps ?? 500, transferWaitHours: s.transfer_wait_hours ?? 72,
      // Sesli / görüntülü ayrı hesap ve görüntülüye özgü kurallar (0 = kural kapalı).
      splitByRoomType: s.split_by_room_type !== false,
      videoDailyCapMinutes: s.video_daily_cap_minutes ?? 0, videoMinSessionMinutes: s.video_min_session_minutes ?? 0,
      videoShortfallCutBps: s.video_shortfall_cut_bps ?? 0,
      audioShortfallCutBps: s.audio_shortfall_cut_bps ?? 0,
      // Ağırlıklı maaş hak edişi (v2.150.0). Bozuk JSON yazılmış olsa bile maaş hesabı
      // çökmesin diye doğrulamadan geçiriliyor; geçmezse varsayılana dönüyor.
      salaryWeights: safeWeights(s.salary_weights),
      salaryWeightedEnabled: s.salary_weighted_enabled === true,
      salaryAutoTransfer: s.salary_auto_transfer === true,
      instantSalaryEnabled: s.instant_salary_enabled === true,
      instantSalaryBps: s.instant_salary_bps ?? 5000,
      // Ay sonu elmas kuralı (v2.152.22): maaş yalnızca kota kadar elmas bakiyeden düşülerek ödenir; kalan elmas dönem
      // kapanınca Coin'e çevrilir. Sütun yoksa (eski veritabanı) açık sayılır: sahibinin kararı bu.
      monthEndDiamondConvert: s.month_end_diamond_convert !== false,
      autoClosePeriod: s.auto_close_period !== false,
      salaryTransferDayFrom: s.salary_transfer_day_from ?? 1,
      salaryTransferDayTo: s.salary_transfer_day_to ?? 3,
    },
    levels,
    videoLevels: videoRows.length ? videoRows : levels,
    grades,
  };
}

export const gradesJson = (grades) => grades.map((g) => ({ name: g.name, min: String(g.min) }));

/**
 * Yayıncıların dönem ölçümleri.
 * hosts: [{ user_id, approved_at }] — süre ve hediyeler yayıncı onayından SONRA sayılır.
 * Dönüş: Map userId → { seconds, validDays, gameSeconds, diamonds, todaySeconds, days: Map(dayIdx → seconds), giftDays: Map(dayIdx → BigInt),
 *   audio: { seconds, validDays, diamonds }, video: { seconds, rawSeconds, validDays, diamonds } }
 * Üst düzey alanlar iki tarafın TOPLAMIDIR (panel grafikleri için). audio / video: odanın türüne göre ayrılmış ölçümler.
 * Görüntülü tarafta [video] kuralları uygulanır: minSessionMinutes'ten kısa oturumlar sayılmaz, bir günde en fazla
 * dailyCapMinutes sayılır (0 = sınırsız). rawSeconds: kurallar uygulanmadan önceki süre.
 */
export async function hostPeriodMetrics(hosts, start, end, validDayMinutes = 60, run = query, video = {}) {
  const out = new Map();
  if (!hosts.length) return out;
  const startMs = new Date(start).getTime();
  const ids = []; const froms = [];
  for (const h of hosts) {
    const appr = h.approved_at ? new Date(h.approved_at).getTime() : 0;
    ids.push(h.user_id);
    froms.push(new Date(Math.max(appr, startMs)).toISOString());
    out.set(h.user_id, {
      seconds: 0, validDays: 0, gameSeconds: 0, diamonds: 0n, todaySeconds: 0, days: new Map(), giftDays: new Map(),
      audio: { seconds: 0, validDays: 0, diamonds: 0n, days: new Map() },
      video: { seconds: 0, rawSeconds: 0, validDays: 0, diamonds: 0n, days: new Map() },
    });
  }
  const endIso = new Date(end).toISOString();
  const mic = await run(
    `WITH x AS (SELECT * FROM unnest($1::uuid[], $2::timestamptz[]) AS t(user_id, from_ts)),
     s AS (
       SELECT m.user_id, (CASE WHEN r.room_type = 'video' THEN 'video' ELSE 'audio' END) AS kind,
         FLOOR(EXTRACT(EPOCH FROM GREATEST(m.started_at, x.from_ts)))::bigint AS st,
         FLOOR(EXTRACT(EPOCH FROM LEAST(COALESCE(m.ended_at, NOW()), $3::timestamptz)))::bigint AS en
       FROM mic_sessions m JOIN x ON x.user_id = m.user_id LEFT JOIN rooms r ON r.id = m.room_id
       WHERE m.started_at < $3::timestamptz AND COALESCE(m.ended_at, NOW()) > x.from_ts
     )
     SELECT s.user_id, s.kind, g.day::int AS day,
       SUM(LEAST(s.en, (g.day + 1) * 86400 - 10800) - GREATEST(s.st, g.day * 86400 - 10800))::bigint AS sec,
       COALESCE(SUM(LEAST(s.en, (g.day + 1) * 86400 - 10800) - GREATEST(s.st, g.day * 86400 - 10800)) FILTER (WHERE s.en - s.st >= $4::bigint), 0)::bigint AS sec_ok
     FROM s CROSS JOIN LATERAL generate_series((s.st + 10800) / 86400, (s.en - 1 + 10800) / 86400) AS g(day)
     WHERE s.en > s.st
     GROUP BY s.user_id, s.kind, g.day`,
    [ids, froms, endIso, Math.max(0, Number(video.minSessionMinutes ?? 0)) * 60],
  );
  const capSec = Math.max(0, Number(video.dailyCapMinutes ?? 0)) * 60;
  const today = dayIndex(new Date());
  const minSec = Math.max(1, Number(validDayMinutes)) * 60;
  for (const r of mic.rows) {
    const m = out.get(r.user_id);
    if (!m) continue;
    const sec = Number(r.sec);
    m.days.set(r.day, (m.days.get(r.day) ?? 0) + sec);
    if (r.kind === 'video') {
      // Görüntülü: kısa oturumlar sayılmaz (sec_ok), günlük üst sınır uygulanır.
      const counted = capSec > 0 ? Math.min(Number(r.sec_ok), capSec) : Number(r.sec_ok);
      m.video.rawSeconds += sec;
      m.video.days.set(r.day, (m.video.days.get(r.day) ?? 0) + counted);
    } else {
      m.audio.days.set(r.day, (m.audio.days.get(r.day) ?? 0) + sec);
    }
  }
  for (const m of out.values()) {
    for (const k of [m.audio, m.video]) {
      for (const sec of k.days.values()) {
        k.seconds += sec;
        if (sec >= minSec) k.validDays += 1;
      }
    }
    for (const [d, sec] of m.days) {
      m.seconds += sec;
      if (sec >= minSec) m.validDays += 1;
      if (d === today) m.todaySeconds = sec;
    }
  }
  const gifts = await run(
    `WITH x AS (SELECT * FROM unnest($1::uuid[], $2::timestamptz[]) AS t(user_id, from_ts))
     SELECT g.receiver_id AS user_id, ((FLOOR(EXTRACT(EPOCH FROM g.created_at))::bigint + 10800) / 86400)::int AS day,
       (CASE WHEN r.room_type = 'video' THEN 'video' ELSE 'audio' END) AS kind,
       (g.sender_id = g.receiver_id) AS self,
       SUM(COALESCE(g.diamond_amount, g.coin_amount))::text AS d
     FROM gift_transactions g JOIN x ON x.user_id = g.receiver_id LEFT JOIN rooms r ON r.id = g.room_id
     WHERE ${salaryGiftSql('r')} AND g.created_at >= x.from_ts AND g.created_at < $3::timestamptz
     GROUP BY 1, 2, 3, 4`,
    [ids, froms, endIso],
  );
  // Kendine hediyeler ayrı toplanır; dönem sonunda %20 sınırıyla (salary_rules.js) eklenir. Görüntülü odada kendine hediye
  // salaryGiftSql ile zaten dışarıda kalır, yani buradaki kendine hediyeler sesli taraftır.
  const add = (m, day, kind, d) => {
    m.diamonds += d;
    m.giftDays.set(day, (m.giftDays.get(day) ?? 0n) + d);
    (kind === 'video' ? m.video : m.audio).diamonds += d;
  };
  const selfOf = new Map(); // userId -> Map(day -> BigInt)
  for (const r of gifts.rows) {
    const m = out.get(r.user_id);
    if (!m) continue;
    const d = BigInt(r.d);
    if (r.self) {
      let sd = selfOf.get(r.user_id);
      if (!sd) { sd = new Map(); selfOf.set(r.user_id, sd); }
      sd.set(r.day, (sd.get(r.day) ?? 0n) + d);
      continue;
    }
    add(m, r.day, r.kind, d);
  }
  for (const [uid, sd] of selfOf) {
    const m = out.get(uid);
    const { counted, days } = scaleSelfDays(m.diamonds, sd);
    for (const [day, d] of days) add(m, day, 'audio', d);
    m.selfDiamonds = counted;
  }
  // Oyun süresi: yayıncının oyuncu olarak katıldığı oda oyunları (bir oyun en fazla 3 saat sayılır).
  const games = await run(
    `WITH x AS (SELECT * FROM unnest($1::uuid[], $2::timestamptz[]) AS t(user_id, from_ts))
     SELECT p.user_id, COALESCE(SUM(GREATEST(0, EXTRACT(EPOCH FROM (
         LEAST(COALESCE(rg.finished_at, NOW()), rg.started_at + INTERVAL '3 hours', $3::timestamptz) - GREATEST(rg.started_at, x.from_ts))))), 0)::bigint AS s
     FROM room_game_players p JOIN room_games rg ON rg.id = p.game_id JOIN x ON x.user_id = p.user_id
     WHERE rg.started_at IS NOT NULL AND rg.started_at < $3::timestamptz AND COALESCE(rg.finished_at, NOW()) > x.from_ts
     GROUP BY p.user_id`,
    [ids, froms, endIso],
  );
  for (const r of games.rows) {
    const m = out.get(r.user_id);
    if (m) m.gameSeconds = Number(r.s);
  }
  return out;
}

/**
 * Ajans adına alınan elmaslar (hediye anında yayıncının bağlı olduğu ajans): ajans → kullanıcı → gün → elmas.
 * agencyIds boşsa tüm ajanslar.
 */
export async function agencyGiftRows(agencyIds, start, end, run = query, periodStarts = []) {
  // periodStarts: aralık birden çok dönemi kapsıyorsa sonraki dönemlerin başlangıç günleri (dayIndex). Kendine hediye
  // sınırı her dönem için ayrı uygulanır (ödenenle aynı sonuç).
  const r = await run(
    `SELECT g.receiver_agency_id AS agency_id, g.receiver_id AS user_id,
       ((FLOOR(EXTRACT(EPOCH FROM g.created_at))::bigint + 10800) / 86400)::int AS day,
       (g.sender_id = g.receiver_id) AS self,
       SUM(COALESCE(g.diamond_amount, g.coin_amount))::text AS d
     FROM gift_transactions g LEFT JOIN rooms r ON r.id = g.room_id
     WHERE g.receiver_agency_id IS NOT NULL AND ($1::uuid[] IS NULL OR g.receiver_agency_id = ANY($1::uuid[]))
       AND ${salaryGiftSql('r')} AND g.created_at >= $2::timestamptz AND g.created_at < $3::timestamptz
     GROUP BY 1, 2, 3, 4`,
    [agencyIds && agencyIds.length ? agencyIds : null, new Date(start).toISOString(), new Date(end).toISOString()],
  );
  // Map agencyId → Map userId → { total: BigInt, days: Map(day → BigInt) }
  const out = new Map();
  const selfOf = new Map(); // "ajans|kullanıcı|dilim" -> Map(gün -> BigInt)
  const othersOf = new Map(); // aynı anahtar -> BigInt
  const userRow = (agencyId, userId) => {
    let a = out.get(agencyId);
    if (!a) { a = new Map(); out.set(agencyId, a); }
    let u = a.get(userId);
    if (!u) { u = { total: 0n, days: new Map() }; a.set(userId, u); }
    return u;
  };
  for (const x of r.rows) {
    const u = userRow(x.agency_id, x.user_id);
    const d = BigInt(x.d);
    const key = `${x.agency_id}|${x.user_id}|${segmentOf(x.day, periodStarts)}`;
    if (x.self) {
      let sd = selfOf.get(key);
      if (!sd) { sd = new Map(); selfOf.set(key, sd); }
      sd.set(x.day, (sd.get(x.day) ?? 0n) + d);
      continue;
    }
    othersOf.set(key, (othersOf.get(key) ?? 0n) + d);
    u.total += d;
    u.days.set(x.day, (u.days.get(x.day) ?? 0n) + d);
  }
  // Kendine hediye: dönem dilimi başına %20 sınırı (salary_rules.js).
  for (const [key, sd] of selfOf) {
    const [agencyId, userId] = key.split('|');
    const u = userRow(agencyId, userId);
    const { counted, days } = scaleSelfDays(othersOf.get(key) ?? 0n, sd);
    u.total += counted;
    for (const [day, d] of days) u.days.set(day, (u.days.get(day) ?? 0n) + d);
  }
  return out;
}

/** Bir ajansın kullanıcı bazında elmasları için "şu güne kadar" (dahil değil) toplam. */
export function totalBefore(userRow, dayIdx) {
  let t = 0n;
  for (const [d, v] of userRow.days) if (d < dayIdx) t += v;
  return t;
}

/** Ajans primi (kullanıcı bazında, şart aranmaz) ve gün bazında prim artışı. */
export function agencyPrimSummary(levels, usersMap, today = dayIndex(new Date())) {
  let now = 0n; let beforeToday = 0n; let beforeYesterday = 0n; let team = 0n;
  const perUser = new Map();
  for (const [uid, u] of usersMap) {
    const p = agencyPrim(levels, u.total);
    perUser.set(uid, { diamonds: u.total, level: p.level, cents: p.cents });
    now += p.cents;
    team += u.total;
    beforeToday += agencyPrim(levels, totalBefore(u, today)).cents;
    beforeYesterday += agencyPrim(levels, totalBefore(u, today - 1)).cents;
  }
  return { team, nowCents: now, todayCents: now - beforeToday, yesterdayCents: beforeToday - beforeYesterday, perUser };
}

/** Resmi etkinlik sayıları (zorunluysa). */
export async function eventCounts(userIds, start, end, run = query) {
  const out = new Map();
  if (!userIds.length) return out;
  const r = await run(
    `SELECT a.user_id, COUNT(*)::int AS n FROM official_event_attendance a JOIN official_events e ON e.id = a.event_id
     WHERE a.user_id = ANY($1::uuid[]) AND e.starts_at >= $2::timestamptz AND e.starts_at < $3::timestamptz GROUP BY a.user_id`,
    [userIds, new Date(start).toISOString(), new Date(end).toISOString()],
  );
  for (const x of r.rows) out.set(x.user_id, x.n);
  return out;
}

/** Yayıncıların tahmini maaşı (canlı dönem). hosts: [{ user_id, approved_at, pay_method_pref }] */
/** Görüntülü taraf kuralları (ayarlar → hostPeriodMetrics / evaluateVideoPay). */
export const videoRules = (settings) => ({
  dailyCapMinutes: settings.videoDailyCapMinutes ?? 0, minSessionMinutes: settings.videoMinSessionMinutes ?? 0,
  shortfallCutBps: settings.videoShortfallCutBps ?? 0,
});

/**
 * Bir yayıncının maaş hesabı: ayrı hesap açıkken sesli (cfg.levels) ve görüntülü (cfg.videoLevels) ayrı değerlendirilir.
 * Dönüş: sesli değerlendirme + { salaryCents: TOPLAM, audioCents, videoCents, video: görüntülü değerlendirme | null }.
 * Bakiye yöntemi (Yöntem 2) yalnızca sesli tabloda geçerlidir.
 */
export function evaluateHost(cfg, m, { pref = 0, eventsOk = true, balance = 0n } = {}) {
  const split = cfg.settings.splitByRoomType !== false;
  const src = split ? m.audio : m;
  // Ay içi maaş kuralı açıksa (instantSalaryEnabled) sesli maaş basit kuralla hesaplanır: şartlar tamamsa %100, biri eksikse %50 (tam dolara aşağı).
  const evalAudio = cfg.settings.instantSalaryEnabled === true ? evaluateSimplePay : evaluatePay;
  const audio = evalAudio({
    levels: cfg.levels, settings: cfg.settings, pref, eventsOk,
    metrics: { seconds: src.seconds, validDays: src.validDays, gameSeconds: m.gameSeconds, diamonds: src.diamonds, balance },
  });
  const video = split ? evaluateVideoPay({
    levels: cfg.videoLevels ?? cfg.levels, settings: cfg.settings, video: videoRules(cfg.settings), eventsOk,
    metrics: { seconds: m.video.seconds, validDays: m.video.validDays, gameSeconds: m.gameSeconds, diamonds: m.video.diamonds },
  }) : null;
  const videoCents = video ? video.salaryCents : 0n;
  return { ...audio, audioCents: audio.salaryCents, videoCents, salaryCents: audio.salaryCents + videoCents, video, split };
}

export async function estimateHosts(hosts, cfg, bounds, run = query) {
  const metrics = await hostPeriodMetrics(hosts, bounds.start, bounds.end, cfg.settings.validDayMinutes, run, videoRules(cfg.settings));
  const ids = hosts.map((h) => h.user_id);
  const bal = new Map();
  if (ids.length) {
    for (const r of (await run(`SELECT id, diamonds FROM users WHERE id = ANY($1::uuid[])`, [ids])).rows) bal.set(r.id, BigInt(r.diamonds));
  }
  // Dönem içinde avansla Fasulyeye çevrilen elmas bakiyeye geri eklenir: "elmas bozdurma" şartı avansın kendi düşümüyle bozulmaz.
  const effBal = new Map(bal);
  if (cfg.settings.instantSalaryEnabled === true) {
    for (const [id, c] of await consumedDiamondsByUser(run, ids, bounds.start, bounds.end)) effBal.set(id, (effBal.get(id) ?? 0n) + c);
  }
  const ev = cfg.settings.requireOfficialEvents ? await eventCounts(ids, bounds.start, bounds.end, run) : new Map();
  const out = new Map();
  for (const h of hosts) {
    const m = metrics.get(h.user_id);
    const evOk = !cfg.settings.requireOfficialEvents || (ev.get(h.user_id) ?? 0) >= cfg.settings.minEventCount;
    const e = evaluateHost(cfg, m, { pref: h.pay_method_pref ?? 0, eventsOk: evOk, balance: effBal.get(h.user_id) ?? 0n });
    out.set(h.user_id, { metrics: m, eval: e, balance: bal.get(h.user_id) ?? 0n, eventCount: ev.get(h.user_id) ?? 0, eventsOk: evOk });
  }
  return out;
}

/** Ajansların aylık ekip elmasına göre sıralaması. */
export async function agencyRanking(start, end, run = query) {
  const r = await run(
    `SELECT g.receiver_agency_id AS id, a.name, SUM(COALESCE(g.diamond_amount, g.coin_amount))::text AS d
     FROM gift_transactions g JOIN agencies a ON a.id = g.receiver_agency_id AND a.status = 'active'
     WHERE g.sender_id <> g.receiver_id AND g.created_at >= $1::timestamptz AND g.created_at < $2::timestamptz
     GROUP BY 1, 2 ORDER BY SUM(COALESCE(g.diamond_amount, g.coin_amount)) DESC`,
    [new Date(start).toISOString(), new Date(end).toISOString()],
  );
  return r.rows.map((x) => ({ id: x.id, name: x.name, diamonds: BigInt(x.d) }));
}
