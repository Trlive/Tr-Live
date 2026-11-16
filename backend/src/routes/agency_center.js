// Ajans Merkezi v2: Ajansım + istatistikler, yayıncı istatistikleri, kazanç ayrıntısı, asistanlar, duyuru,
// transfer geçmişi, davet merkezi ve maaş tablosu.
import { Router } from 'express';
import { query, tx } from '../database.js';
import { requireAuth } from '../auth.js';
import { fail, uuid, text } from '../http.js';
import { hub } from '../realtime.js';
import { cleanPublic } from '../safe_text.js';
import { periodBounds, previousPeriod } from '../settlement.js';
import { loadConfig, agencyStatementJson, assistantStatementJson, referralStatementJson } from '../services/payouts.js';
import {
  estimateHosts, agencyGiftRows, agencyPrimSummary, agencyRanking, dayIndex, dayKey, totalBefore, gradesJson,
} from '../services/agency_metrics.js';
import { agencyAccess, requireOwner, expireAssistantInvites, ASSISTANT_INVITE_DAYS } from '../services/agency_ops.js';
import { notifyUser } from '../services/notify.js';
import { payLevelJson, gradeFor, agencyPrim, BADGE_NAMES } from '../paytable.js';
import { memberJson, TRANSFER_SELECT, transferJson, sendBroadcasterInvite } from './agencies.js';

export const router = Router();
// Yönlendirici '/api' altına bağlı: kimlik doğrulama yalnızca kendi yollarında (diğer isteklerde boşuna çalışmasın).
router.use(function requireAgencyAuth(req, res, next) {
  if (req.path.startsWith('/agency-center') || req.path.startsWith('/agency-assistant')) return requireAuth(req, res, next);
  return next();
});

const big = (v) => String(v ?? 0);
const pct = (cur, prev) => (prev > 0n ? Math.round(Number(((cur - prev) * 10000n) / prev)) / 100 : null);

function agencyCard(a, extra = {}) {
  return {
    id: a.id, name: a.name, logoUrl: a.logo_url, description: a.description ?? '', status: a.status, agencyCode: a.agency_code ?? null,
    createdAt: a.created_at, announcement: a.announcement ?? null, announcementAt: a.announcement_at ?? null,
    assistantsCanAnnounce: a.assistants_can_announce === true, ...extra,
  };
}

/** Ajansın bu dönem ve önceki dönem (aynı gün sayısı) elmas verisi, yayıncı tahminleri. */
async function agencyPeriodData(a, cfg) {
  const b = periodBounds(cfg.settings.cycle);
  const prev = previousPeriod(cfg.settings.cycle);
  const today = dayIndex(new Date());
  const curStart = dayIndex(b.start);
  const prevStart = dayIndex(prev.start);
  const prevSameEnd = prevStart + (today - curStart + 1); // bu tarihten önceki günler (dahil değil)
  const all = (await agencyGiftRows([a.id], prev.start, b.end)).get(a.id) ?? new Map();
  const cur = new Map(); const prevSame = new Map();
  let lastMonth = 0n; let lastSame = 0n; let todayD = 0n; let yesterdayD = 0n;
  for (const [uid, u] of all) {
    const c = { total: 0n, days: new Map() };
    let ps = 0n;
    for (const [d, v] of u.days) {
      if (d >= curStart) {
        c.total += v; c.days.set(d, v);
        if (d === today) todayD += v;
        if (d === today - 1) yesterdayD += v;
      } else {
        lastMonth += v;
        if (d < prevSameEnd) { lastSame += v; ps += v; }
      }
    }
    if (c.total > 0n) cur.set(uid, c);
    if (ps > 0n) prevSame.set(uid, ps);
  }
  // Ay başında dün önceki döneme düşer.
  if (today - 1 < curStart) {
    for (const u of all.values()) yesterdayD += u.days.get(today - 1) ?? 0n;
  }
  const prim = agencyPrimSummary(cfg.levels, cur, today);
  const hostRows = (await query(
    `SELECT br.user_id, br.approved_at, br.pay_method_pref, br.joined_agency_at, br.invited_by,
       u.id, u.username, u.display_name, u.avatar_url, u.public_id, iu.display_name AS invited_by_name
     FROM broadcasters br JOIN users u ON u.id = br.user_id LEFT JOIN users iu ON iu.id = br.invited_by
     WHERE br.agency_id = $1 AND br.status = 'approved' ORDER BY u.username`, [a.id],
  )).rows;
  const est = await estimateHosts(hostRows, cfg, b);
  const live = new Set();
  if (hostRows.length) {
    for (const r of (await query(
      `SELECT DISTINCT user_id FROM mic_sessions WHERE ended_at IS NULL AND user_id = ANY($1::uuid[])`, [hostRows.map((h) => h.user_id)],
    )).rows) live.add(r.user_id);
  }
  return { b, prev, today, prim, cur, prevSame, lastMonth, lastSame, todayD, yesterdayD, hostRows, est, live };
}

async function activeAssistants(agencyId) {
  return (await query(
    `SELECT s.id, s.user_id, s.share_bps, s.responded_at, s.created_at, u.username, u.display_name, u.avatar_url, u.public_id
     FROM agency_assistants s JOIN users u ON u.id = s.user_id WHERE s.agency_id = $1 AND s.status = 'active' ORDER BY s.responded_at NULLS LAST`,
    [agencyId],
  )).rows;
}

/** Asistan payları (bu dönem, tahmini): davet ettiği ve hâlâ ajansta olan yayıncıların ajans primi × pay oranı. */
function assistantShares(assistants, hostRows, prim) {
  const byInviter = new Map();
  for (const h of hostRows) {
    if (!h.invited_by) continue;
    const p = prim.perUser.get(h.user_id);
    const cur = byInviter.get(h.invited_by) ?? { hosts: 0, base: 0n };
    cur.hosts += 1;
    cur.base += p ? p.cents : 0n;
    byInviter.set(h.invited_by, cur);
  }
  return assistants.map((s) => {
    const x = byInviter.get(s.user_id) ?? { hosts: 0, base: 0n };
    return { ...s, hosts: x.hosts, base: x.base, amount: (x.base * BigInt(s.share_bps)) / 10000n };
  });
}

// ---------------- Rol / giriş ----------------
router.get('/agency-center/me', async (req, res) => {
  await expireAssistantInvites();
  const owned = (await query(`SELECT * FROM agencies WHERE owner_id = $1 AND status <> 'rejected'`, [req.user.id])).rows[0];
  const as = (await query(
    `SELECT s.id, s.share_bps, a.* FROM agency_assistants s JOIN agencies a ON a.id = s.agency_id WHERE s.user_id = $1 AND s.status = 'active'`,
    [req.user.id],
  )).rows[0];
  const inv = (await query(
    `SELECT COUNT(*)::int AS n FROM agency_assistants s JOIN agencies a ON a.id = s.agency_id AND a.status = 'active'
     WHERE s.user_id = $1 AND s.status = 'pending'`, [req.user.id],
  )).rows[0].n;
  res.json({
    owned: owned ? agencyCard(owned) : null,
    assistant: as ? { shareBps: as.share_bps, agency: agencyCard(as) } : null,
    assistantInvites: inv,
  });
});

router.get('/agency-center/pay-table', async (req, res) => {
  const cfg = await loadConfig();
  res.json({
    currency: cfg.settings.currency, levels: cfg.levels.map(payLevelJson), badges: BADGE_NAMES, grades: gradesJson(cfg.grades),
    // Görüntülü yayın tablosu ve kuralları (ayrı hesap kapalıysa split = false; uygulama tek tablo gösterir).
    split: cfg.settings.splitByRoomType !== false, videoLevels: (cfg.videoLevels ?? cfg.levels).map(payLevelJson),
    video: { dailyCapMinutes: cfg.settings.videoDailyCapMinutes, minSessionMinutes: cfg.settings.videoMinSessionMinutes, shortfallCutBps: cfg.settings.videoShortfallCutBps },
    settings: {
      cycle: cfg.settings.cycle, validDayMinutes: cfg.settings.validDayMinutes, requireGameHours: cfg.settings.requireGameHours,
      allowBalanceMethod: cfg.settings.allowBalanceMethod, referralBps: cfg.settings.referralBps,
    },
  });
});

// ---------------- Ajansım ----------------
router.get('/agency-center/:agencyId/home', async (req, res) => {
  const acc = await agencyAccess(uuid(req.params.agencyId, 'Ajans'), req.user);
  const a = acc.agency;
  const cfg = await loadConfig();
  const d = await agencyPeriodData(a, cfg);
  const owner = (await query(`SELECT id, username, display_name, avatar_url, public_id FROM users WHERE id = $1`, [a.owner_id])).rows[0];
  const hosts = d.hostRows;
  const minDays = cfg.levels[0]?.days ?? null;
  const daysLeft = Math.max(0, Math.ceil((new Date(d.b.end).getTime() - Date.now()) / 86400000));
  let activeToday = 0; let newThisMonth = 0; let dropped = 0; let behind = 0; let salary = 0n; let qualified = 0;
  for (const h of hosts) {
    const x = d.est.get(h.user_id);
    if (x.metrics.todaySeconds > 0) activeToday += 1;
    if (h.joined_agency_at && new Date(h.joined_agency_at) >= new Date(d.b.start)) newThisMonth += 1;
    const curD = d.cur.get(h.user_id)?.total ?? 0n;
    const prevD = d.prevSame.get(h.user_id) ?? 0n;
    if (prevD > 0n && curD * 10n < prevD * 8n) dropped += 1;
    if (minDays !== null && x.metrics.validDays + daysLeft < minDays) behind += 1;
    salary += x.eval.salaryCents;
    if (x.eval.salaryCents > 0n) qualified += 1;
  }
  const assistants = assistantShares(await activeAssistants(a.id), hosts, d.prim);
  const asTotal = assistants.reduce((t, s) => t + s.amount, 0n);
  const mine = acc.role === 'assistant' ? assistants.find((s) => s.user_id === req.user.id) : null;
  const grade = gradeFor(cfg.grades, d.prim.team);
  const ranking = await agencyRanking(d.b.start, d.b.end);
  const idx = ranking.findIndex((r) => r.id === a.id);
  const pendingTransfers = (await query(
    `SELECT COUNT(*)::int AS n FROM agency_transfers WHERE from_agency_id = $1 AND status = 'pending_source'`, [a.id],
  )).rows[0].n;
  const pendingInvites = (await query(`SELECT COUNT(*)::int AS n FROM agency_requests WHERE agency_id = $1 AND status = 'pending'`, [a.id])).rows[0].n;
  const isOwner = acc.role !== 'assistant';
  res.json({
    role: acc.role,
    agency: agencyCard(a, { owner: owner ? memberJson(owner) : null, broadcasterCount: hosts.length }),
    period: { key: d.b.key, startsAt: d.b.start, endsAt: d.b.end, daysLeft },
    currency: cfg.settings.currency,
    earnings: isOwner
      ? {
          monthCents: big(d.prim.nowCents), todayCents: big(d.prim.todayCents), yesterdayCents: big(d.prim.yesterdayCents),
          assistantCents: big(asTotal), ownerCents: big(d.prim.nowCents - asTotal),
        }
      : {
          myCents: big(mine?.amount ?? 0n), myBaseCents: big(mine?.base ?? 0n), myHosts: mine?.hosts ?? 0, shareBps: mine?.share_bps ?? 0,
        },
    stats: {
      monthDiamonds: big(d.prim.team), lastSameDiamonds: big(d.lastSame), lastMonthDiamonds: big(d.lastMonth), changePct: pct(d.prim.team, d.lastSame),
      todayDiamonds: big(d.todayD), yesterdayDiamonds: big(d.yesterdayD),
      broadcasters: hosts.length, activeToday, liveNow: d.live.size, newThisMonth, dropped, behindDays: behind,
      salaryCents: isOwner ? big(salary) : null, qualified, minDays,
    },
    grade: {
      name: grade.current?.name ?? null, min: big(grade.current?.min ?? 0n),
      next: grade.next ? { name: grade.next.name, min: big(grade.next.min), remaining: big(grade.remaining) } : null,
      grades: gradesJson(cfg.grades),
    },
    rank: {
      rank: idx >= 0 ? idx + 1 : null, total: ranking.length,
      gapToPrev: idx > 0 ? big(ranking[idx - 1].diamonds - ranking[idx].diamonds) : null,
      gapNeeded: idx < 0 && ranking.length ? big(ranking[ranking.length - 1].diamonds - d.prim.team + 1n) : null,
    },
    tasks: [
      { key: 'new_hosts', title: 'Bu ay yeni yayıncı', value: newThisMonth, target: 3 },
      { key: 'active_today', title: 'Bugün yayın yapan yayıncı', value: activeToday, target: Math.max(1, Math.ceil(hosts.length * 0.6)) },
      { key: 'qualified', title: 'Maaş seviyesine ulaşan yayıncı', value: qualified, target: Math.max(1, Math.ceil(hosts.length * 0.3)) },
    ],
    pendingTransfers: isOwner ? pendingTransfers : 0,
    pendingInvites,
    assistantCount: assistants.length,
  });
});

// ---------------- Yayıncı istatistikleri ----------------
router.get('/agency-center/:agencyId/hosts', async (req, res) => {
  const acc = await agencyAccess(uuid(req.params.agencyId, 'Ajans'), req.user);
  const a = acc.agency;
  const cfg = await loadConfig();
  const d = await agencyPeriodData(a, cfg);
  const minDays = cfg.levels[0]?.days ?? null;
  const daysLeft = Math.max(0, Math.ceil((new Date(d.b.end).getTime() - Date.now()) / 86400000));
  const rows = d.hostRows
    .filter((h) => acc.role !== 'assistant' || h.invited_by === req.user.id)
    .map((h) => {
      const x = d.est.get(h.user_id);
      const e = x.eval;
      const ag = d.prim.perUser.get(h.user_id);
      const curD = d.cur.get(h.user_id)?.total ?? 0n;
      const prevD = d.prevSame.get(h.user_id) ?? 0n;
      return {
        ...memberJson(h), joinedAt: h.joined_agency_at, liveNow: d.live.has(h.user_id),
        invitedBy: h.invited_by ? { id: h.invited_by, displayName: h.invited_by_name } : null,
        seconds: x.metrics.seconds, todaySeconds: x.metrics.todaySeconds, validDays: x.metrics.validDays, gameSeconds: x.metrics.gameSeconds,
        diamonds: big(x.metrics.diamonds), agencyDiamonds: big(curD), lastSameDiamonds: big(prevD), changePct: pct(curD, prevD),
        level1: e.level1?.level ?? null, level2: e.level2?.level ?? null, method: e.method, level: e.level?.level ?? null,
        salaryCents: big(e.salaryCents), agencyCents: big(ag?.cents ?? 0n), agencyLevel: ag?.level ?? null,
        blocked: e.blocked?.level ?? null, blockedBy: e.blockedBy,
        next: e.next ? { level: e.next.level, diamonds: big(e.next.diamonds), remaining: big(e.nextRemaining) } : null,
        dropped: prevD > 0n && curD * 10n < prevD * 8n,
        behindDays: minDays !== null && x.metrics.validDays + daysLeft < minDays,
        isNew: Boolean(h.joined_agency_at && new Date(h.joined_agency_at) >= new Date(d.b.start)),
      };
    });
  rows.sort((x, y) => (BigInt(y.diamonds) > BigInt(x.diamonds) ? 1 : BigInt(y.diamonds) < BigInt(x.diamonds) ? -1 : 0));
  res.json({
    role: acc.role, period: { key: d.b.key, startsAt: d.b.start, endsAt: d.b.end, daysLeft }, currency: cfg.settings.currency,
    requirements: { validDayMinutes: cfg.settings.validDayMinutes, requireGameHours: cfg.settings.requireGameHours, minDays },
    hosts: rows,
  });
});

// ---------------- Kazanç ayrıntısı ----------------
router.get('/agency-center/:agencyId/earnings', async (req, res) => {
  const acc = await agencyAccess(uuid(req.params.agencyId, 'Ajans'), req.user);
  const a = acc.agency;
  const cfg = await loadConfig();
  const d = await agencyPeriodData(a, cfg);
  const assistants = assistantShares(await activeAssistants(a.id), d.hostRows, d.prim);
  const isOwner = acc.role !== 'assistant';
  // Asistan yalnızca davet ettiği yayıncıların payını görür.
  const myHosts = isOwner ? null : new Set(d.hostRows.filter((h) => h.invited_by === req.user.id).map((h) => h.user_id));
  const users = isOwner ? d.cur : new Map([...d.cur].filter(([uid]) => myHosts.has(uid)));
  const curStart = dayIndex(d.b.start);
  const days = [];
  let prevPrim = 0n;
  for (let day = curStart; day <= d.today && day < dayIndex(d.b.end); day += 1) {
    let dia = 0n; let primThrough = 0n;
    for (const u of users.values()) {
      dia += u.days.get(day) ?? 0n;
      primThrough += agencyPrim(cfg.levels, totalBefore(u, day + 1)).cents;
    }
    days.push({ day: dayKey(day), diamonds: big(dia), primCents: big(primThrough - prevPrim) });
    prevPrim = primThrough;
  }
  const ids = [...users.keys()];
  const names = new Map();
  if (ids.length) {
    for (const r of (await query(`SELECT id, username, display_name, avatar_url, public_id FROM users WHERE id = ANY($1::uuid[])`, [ids])).rows) names.set(r.id, r);
  }
  const inviter = new Map(d.hostRows.map((h) => [h.user_id, h.invited_by ? { id: h.invited_by, displayName: h.invited_by_name } : null]));
  const hosts = ids.map((uid) => {
    const p = d.prim.perUser.get(uid);
    const n = names.get(uid);
    return {
      ...(n ? memberJson(n) : { id: uid }), agencyDiamonds: big(p?.diamonds ?? 0n), level: p?.level ?? null, agencyCents: big(p?.cents ?? 0n),
      inAgency: inviter.has(uid), invitedBy: inviter.get(uid) ?? null,
    };
  }).sort((x, y) => (BigInt(y.agencyDiamonds) > BigInt(x.agencyDiamonds) ? 1 : -1));
  const mine = assistants.find((s) => s.user_id === req.user.id);
  const statements = isOwner
    ? (await query(
        `SELECT s.*, p.period_key, p.starts_at, p.ends_at, $2::text AS agency_name FROM agency_statements s JOIN payout_periods p ON p.id = s.period_id
         WHERE s.agency_id = $1 ORDER BY p.starts_at DESC LIMIT 12`, [a.id, a.name],
      )).rows.map(agencyStatementJson)
    : (await query(
        `SELECT s.*, p.period_key, p.starts_at, p.ends_at, $3::text AS agency_name FROM assistant_statements s JOIN payout_periods p ON p.id = s.period_id
         WHERE s.agency_id = $1 AND s.user_id = $2 ORDER BY p.starts_at DESC LIMIT 12`, [a.id, req.user.id, a.name],
      )).rows.map(assistantStatementJson);
  const asTotal = assistants.reduce((t, s) => t + s.amount, 0n);
  res.json({
    role: acc.role, period: { key: d.b.key, startsAt: d.b.start, endsAt: d.b.end }, currency: cfg.settings.currency,
    days, hosts,
    totals: isOwner
      ? { commissionCents: big(d.prim.nowCents), assistantCents: big(asTotal), ownerCents: big(d.prim.nowCents - asTotal), teamDiamonds: big(d.prim.team) }
      : { baseCents: big(mine?.base ?? 0n), myCents: big(mine?.amount ?? 0n), shareBps: mine?.share_bps ?? 0 },
    assistants: isOwner ? assistants.map((s) => ({
      ...memberJson({ ...s, id: s.user_id }), shareBps: s.share_bps, hosts: s.hosts, baseCents: big(s.base), amountCents: big(s.amount),
    })) : [],
    statements,
  });
});

// ---------------- Duyuru ve ayarlar ----------------
router.post('/agency-center/:agencyId/announcement', async (req, res) => {
  const acc = await agencyAccess(uuid(req.params.agencyId, 'Ajans'), req.user);
  const a = acc.agency;
  if (acc.role === 'assistant' && !a.assistants_can_announce) throw fail('Duyuruyu yalnızca ajans sahibi düzenleyebilir.', 403);
  if (acc.role === 'admin') throw fail('Duyuruyu ajans sahibi düzenler.', 403);
  requireActive(acc);
  const t = text(req.body?.text, 'Duyuru', { max: 200 });
  if (t) cleanPublic(t, 'Duyuru');
  if (a.announcement_at && Date.now() - new Date(a.announcement_at).getTime() < 60e3) throw fail('Duyuru çok sık değiştiriliyor; 1 dakika sonra tekrar deneyin.', 429);
  await query(`UPDATE agencies SET announcement = $2, announcement_at = NOW() WHERE id = $1`, [a.id, t]);
  res.json({ ok: true, announcement: t });
  if (t && t !== a.announcement) {
    const hosts = (await query(`SELECT user_id FROM broadcasters WHERE agency_id = $1 AND status = 'approved' AND user_id <> $2`, [a.id, req.user.id])).rows;
    for (const h of hosts) await notifyUser(h.user_id, 'agency_notice', `📢 ${a.name} duyurusu`, t, { agencyId: a.id });
  }
});

router.post('/agency-center/:agencyId/settings', async (req, res) => {
  const acc = await agencyAccess(uuid(req.params.agencyId, 'Ajans'), req.user);
  requireOwner(acc);
  requireActive(acc);
  if (typeof req.body?.assistantsCanAnnounce !== 'boolean') throw fail('Ayar geçersiz.');
  await query(`UPDATE agencies SET assistants_can_announce = $2 WHERE id = $1`, [acc.agency.id, req.body.assistantsCanAnnounce]);
  res.json({ ok: true });
});

// Yayıncı daveti (ajans sahibi ya da asistan).
router.post('/agency-center/:agencyId/invite', async (req, res) => {
  const acc = await agencyAccess(uuid(req.params.agencyId, 'Ajans'), req.user);
  if (acc.role === 'admin') throw fail('Davet ajans sahibi ya da asistanı tarafından gönderilir.', 403);
  const r = await sendBroadcasterInvite(acc, req.user, uuid(req.body?.userId, 'Kullanıcı'));
  res.status(201).json({ ok: true, ...r });
});

router.post('/agency-center/:agencyId/invites/:requestId/cancel', async (req, res) => {
  const acc = await agencyAccess(uuid(req.params.agencyId, 'Ajans'), req.user);
  const r = await query(
    `UPDATE agency_requests SET status = 'cancelled', responded_at = NOW()
     WHERE id = $1 AND agency_id = $2 AND status = 'pending' AND direction = 'invite' AND ($3::uuid IS NULL OR invited_by = $3) RETURNING id`,
    [uuid(req.params.requestId, 'Davet'), acc.agency.id, acc.role === 'assistant' ? req.user.id : null],
  );
  if (!r.rowCount) throw fail('Bekleyen davet bulunamadı.', 404);
  res.json({ ok: true });
});

// ---------------- Asistanlar ----------------
router.get('/agency-center/:agencyId/assistants', async (req, res) => {
  const acc = await agencyAccess(uuid(req.params.agencyId, 'Ajans'), req.user);
  requireOwner(acc);
  await expireAssistantInvites();
  const a = acc.agency;
  const cfg = await loadConfig();
  const d = await agencyPeriodData(a, cfg);
  const active = assistantShares(await activeAssistants(a.id), d.hostRows, d.prim);
  const pending = (await query(
    `SELECT s.id, s.user_id, s.share_bps, s.created_at, u.username, u.display_name, u.avatar_url, u.public_id
     FROM agency_assistants s JOIN users u ON u.id = s.user_id WHERE s.agency_id = $1 AND s.status = 'pending' ORDER BY s.created_at DESC`, [a.id],
  )).rows;
  const history = (await query(
    `SELECT s.id, s.user_id, s.share_bps, s.status, s.created_at, s.responded_at, s.ended_at, u.username, u.display_name, u.avatar_url, u.public_id
     FROM agency_assistants s JOIN users u ON u.id = s.user_id
     WHERE s.agency_id = $1 AND s.status IN ('removed','resigned','rejected','cancelled')
     ORDER BY COALESCE(s.ended_at, s.responded_at, s.created_at) DESC LIMIT 50`, [a.id],
  )).rows;
  const person = (s) => memberJson({ ...s, id: s.user_id });
  res.json({
    currency: cfg.settings.currency, maxAssistants: cfg.settings.maxAssistants, maxShareBps: cfg.settings.maxAssistantBps,
    inviteDays: ASSISTANT_INVITE_DAYS,
    active: active.map((s) => ({ id: s.id, user: person(s), shareBps: s.share_bps, since: s.responded_at, hosts: s.hosts, baseCents: big(s.base), amountCents: big(s.amount) })),
    pending: pending.map((s) => ({
      id: s.id, user: person(s), shareBps: s.share_bps, createdAt: s.created_at,
      expiresAt: new Date(new Date(s.created_at).getTime() + ASSISTANT_INVITE_DAYS * 86400e3),
    })),
    history: history.map((s) => ({ id: s.id, user: person(s), shareBps: s.share_bps, status: s.status, createdAt: s.created_at, respondedAt: s.responded_at, endedAt: s.ended_at })),
  });
});

function requireActive(acc) {
  if (acc.agency.status !== 'active') throw fail('Ajans aktif değil.', 409);
}

function shareBps(v, max) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > max) throw fail(`Pay oranı %0 ile %${max / 100} arasında olmalı.`);
  return n;
}

router.post('/agency-center/:agencyId/assistants/invite', async (req, res) => {
  const acc = await agencyAccess(uuid(req.params.agencyId, 'Ajans'), req.user);
  requireOwner(acc);
  const a = acc.agency;
  if (a.status !== 'active') throw fail('Ajans aktif değil.', 409);
  const cfg = await loadConfig();
  const userId = uuid(req.body?.userId, 'Kullanıcı');
  const bps = shareBps(req.body?.shareBps ?? 0, cfg.settings.maxAssistantBps);
  if (userId === a.owner_id) throw fail('Ajans sahibi kendi ajansının asistanı olamaz.');
  await expireAssistantInvites();
  const r = await tx(async (c) => {
    await c.query(`SELECT 1 FROM agencies WHERE id = $1 FOR UPDATE`, [a.id]);
    const u = (await c.query(`SELECT account_status FROM users WHERE id = $1`, [userId])).rows[0];
    if (!u || u.account_status !== 'active') throw fail('Kullanıcı bulunamadı.', 404);
    if ((await c.query(`SELECT 1 FROM agencies WHERE owner_id = $1 AND status <> 'rejected'`, [userId])).rowCount) throw fail('Başka bir ajansın sahibi asistan olamaz.', 409);
    if ((await c.query(`SELECT 1 FROM agency_assistants WHERE user_id = $1 AND status = 'active'`, [userId])).rowCount) throw fail('Bu kişi zaten bir ajansın asistanı.', 409);
    const n = (await c.query(`SELECT COUNT(*)::int AS n FROM agency_assistants WHERE agency_id = $1 AND status IN ('active','pending')`, [a.id])).rows[0].n;
    if (n >= cfg.settings.maxAssistants) throw fail(`En fazla ${cfg.settings.maxAssistants} asistan (bekleyen davetler dahil) olabilir.`, 409);
    try {
      return (await c.query(
        `INSERT INTO agency_assistants(agency_id, user_id, share_bps, invited_by) VALUES($1,$2,$3,$4) RETURNING id`, [a.id, userId, bps, req.user.id],
      )).rows[0];
    } catch (error) {
      if (error.code === '23505') throw fail('Bu kişiye zaten bekleyen bir davet var.', 409);
      throw error;
    }
  });
  notifyUser(userId, 'agency_assistant', 'Ajans asistanlığı daveti',
    `"${a.name}" ajansı seni asistanı olarak davet etti (pay: %${bps / 100}). Mesajlar → Ajans daveti'nden yanıtla.`, { inviteId: r.id });
  hub.sendToUser(userId, { type: 'agency_assistant_invite', agency: { id: a.id, name: a.name } });
  res.status(201).json({ ok: true, id: r.id });
});

router.post('/agency-center/:agencyId/assistants/:id/share', async (req, res) => {
  const acc = await agencyAccess(uuid(req.params.agencyId, 'Ajans'), req.user);
  requireOwner(acc);
  requireActive(acc);
  const cfg = await loadConfig();
  const bps = shareBps(req.body?.shareBps, cfg.settings.maxAssistantBps);
  const r = await query(
    `UPDATE agency_assistants SET share_bps = $3 WHERE id = $1 AND agency_id = $2 AND status IN ('active','pending') RETURNING user_id`,
    [uuid(req.params.id, 'Asistan'), acc.agency.id, bps],
  );
  if (!r.rowCount) throw fail('Asistan bulunamadı.', 404);
  res.json({ ok: true });
});

router.post('/agency-center/:agencyId/assistants/:id/remove', async (req, res) => {
  const acc = await agencyAccess(uuid(req.params.agencyId, 'Ajans'), req.user);
  requireOwner(acc);
  const r = await query(
    `UPDATE agency_assistants SET status = CASE WHEN status = 'pending' THEN 'cancelled' ELSE 'removed' END, ended_at = NOW(), ended_by = $3
     WHERE id = $1 AND agency_id = $2 AND status IN ('active','pending') RETURNING user_id, status`,
    [uuid(req.params.id, 'Asistan'), acc.agency.id, req.user.id],
  );
  if (!r.rowCount) throw fail('Asistan bulunamadı.', 404);
  if (r.rows[0].status === 'removed') {
    notifyUser(r.rows[0].user_id, 'agency_assistant', 'Asistanlık sona erdi', `"${acc.agency.name}" ajansındaki asistanlığın sonlandırıldı.`, {});
    hub.sendToUser(r.rows[0].user_id, { type: 'agency_update' });
  }
  res.json({ ok: true });
});

// Davet edilen kişi: bekleyen asistan davetleri ve yanıt.
router.get('/agency-assistant/invites', async (req, res) => {
  await expireAssistantInvites();
  const r = await query(
    `SELECT s.id, s.share_bps, s.created_at, a.id AS agency_id, a.name, a.logo_url, u.display_name AS owner_name
     FROM agency_assistants s JOIN agencies a ON a.id = s.agency_id JOIN users u ON u.id = a.owner_id
     WHERE s.user_id = $1 AND s.status = 'pending' AND a.status = 'active' ORDER BY s.created_at DESC`, [req.user.id],
  );
  res.json({ invites: r.rows.map((x) => ({
    id: x.id, shareBps: x.share_bps, createdAt: x.created_at,
    expiresAt: new Date(new Date(x.created_at).getTime() + ASSISTANT_INVITE_DAYS * 86400e3),
    agency: { id: x.agency_id, name: x.name, logoUrl: x.logo_url, ownerName: x.owner_name },
  })) });
});

router.post('/agency-assistant/invites/:id/respond', async (req, res) => {
  const id = uuid(req.params.id, 'Davet');
  const accept = req.body?.accept === true;
  const cfg = await loadConfig();
  const out = await tx(async (c) => {
    const s = (await c.query(`SELECT * FROM agency_assistants WHERE id = $1 AND user_id = $2 AND status = 'pending' FOR UPDATE`, [id, req.user.id])).rows[0];
    if (!s) throw fail('Davet bulunamadı veya yanıtlanmış.', 404);
    if (Date.now() - new Date(s.created_at).getTime() > ASSISTANT_INVITE_DAYS * 86400e3) {
      await c.query(`UPDATE agency_assistants SET status = 'cancelled', ended_at = NOW() WHERE id = $1`, [id]);
      return { expired: true };
    }
    const a = (await c.query(`SELECT id, name, owner_id, status FROM agencies WHERE id = $1 FOR UPDATE`, [s.agency_id])).rows[0];
    if (!accept) {
      await c.query(`UPDATE agency_assistants SET status = 'rejected', responded_at = NOW() WHERE id = $1`, [id]);
      return { agency: a, accepted: false };
    }
    if (!a || a.status !== 'active') throw fail('Ajans aktif değil.', 409);
    if ((await c.query(`SELECT 1 FROM agencies WHERE owner_id = $1 AND status <> 'rejected'`, [req.user.id])).rowCount) throw fail('Ajans sahibi asistan olamaz.', 409);
    if ((await c.query(`SELECT 1 FROM agency_assistants WHERE user_id = $1 AND status = 'active'`, [req.user.id])).rowCount) {
      throw fail('Zaten bir ajansın asistanısınız. Önce o görevden ayrılın.', 409);
    }
    const n = (await c.query(`SELECT COUNT(*)::int AS n FROM agency_assistants WHERE agency_id = $1 AND status = 'active'`, [a.id])).rows[0].n;
    if (n >= cfg.settings.maxAssistants) throw fail('Ajansın asistan kontenjanı dolu.', 409);
    await c.query(`UPDATE agency_assistants SET status = 'active', responded_at = NOW() WHERE id = $1`, [id]);
    await c.query(
      `UPDATE agency_assistants SET status = 'cancelled', ended_at = NOW() WHERE user_id = $1 AND status = 'pending' AND id <> $2`, [req.user.id, id],
    );
    return { agency: a, accepted: true };
  }).catch((error) => {
    if (error.code === '23505') throw fail('Zaten bir ajansın asistanısınız.', 409);
    throw error;
  });
  if (out.expired) throw fail('Davetin süresi dolmuş.', 410);
  notifyUser(out.agency.owner_id, 'agency_assistant', out.accepted ? 'Asistan daveti kabul edildi' : 'Asistan daveti reddedildi',
    `${req.user.display_name || req.user.username} asistanlık davetini ${out.accepted ? 'kabul etti' : 'reddetti'}.`, {});
  res.json({ ok: true, accepted: out.accepted, agencyId: out.agency.id });
});

router.post('/agency-assistant/resign', async (req, res) => {
  const r = await query(
    `UPDATE agency_assistants SET status = 'resigned', ended_at = NOW(), ended_by = $1 WHERE user_id = $1 AND status = 'active'
     RETURNING agency_id`, [req.user.id],
  );
  if (!r.rowCount) throw fail('Asistan değilsiniz.', 404);
  const a = (await query(`SELECT owner_id FROM agencies WHERE id = $1`, [r.rows[0].agency_id])).rows[0];
  if (a) notifyUser(a.owner_id, 'agency_assistant', 'Asistan ayrıldı', `${req.user.display_name || req.user.username} asistanlıktan ayrıldı.`, {});
  res.json({ ok: true });
});

// ---------------- Transfer geçmişi ----------------
router.get('/agency-center/:agencyId/transfers', async (req, res) => {
  const acc = await agencyAccess(uuid(req.params.agencyId, 'Ajans'), req.user);
  const a = acc.agency;
  const dir = ['in', 'out'].includes(String(req.query.dir)) ? String(req.query.dir) : 'all';
  const st = String(req.query.status ?? 'all');
  const statusList = {
    pending: ['pending_source', 'pending_platform'], approved: ['approved'], rejected: ['rejected'], cancelled: ['cancelled'],
  }[st] ?? null;
  const where = dir === 'in' ? 't.to_agency_id = $1' : dir === 'out' ? 't.from_agency_id = $1' : '(t.to_agency_id = $1 OR t.from_agency_id = $1)';
  const r = await query(
    `${TRANSFER_SELECT} WHERE ${where} AND ($2::text[] IS NULL OR t.status = ANY($2::text[])) ORDER BY t.created_at DESC LIMIT 200`,
    [a.id, statusList],
  );
  const counts = (await query(
    `SELECT COUNT(*) FILTER (WHERE to_agency_id = $1 AND status = 'approved')::int AS joined,
            COUNT(*) FILTER (WHERE from_agency_id = $1 AND status = 'approved')::int AS left,
            COUNT(*) FILTER (WHERE from_agency_id = $1 AND status = 'pending_source')::int AS pending
     FROM agency_transfers WHERE to_agency_id = $1 OR from_agency_id = $1`, [a.id],
  )).rows[0];
  res.json({
    role: acc.role, counts,
    transfers: r.rows.map((t) => ({
      ...transferJson(t), direction: t.to_agency_id === a.id ? 'in' : 'out',
      canDecide: acc.role === 'owner' && t.status === 'pending_source' && t.from_agency_id === a.id,
    })),
  });
});

// ---------------- Davet merkezi ----------------
router.get('/agency-center/:agencyId/invite-center', async (req, res) => {
  const acc = await agencyAccess(uuid(req.params.agencyId, 'Ajans'), req.user);
  requireOwner(acc);
  const a = acc.agency;
  const cfg = await loadConfig();
  const b = periodBounds(cfg.settings.cycle);
  const bps = BigInt(cfg.settings.referralBps);
  const invited = (await query(
    `SELECT a.id, a.name, a.logo_url, a.status, a.created_at, u.id AS owner_id, u.username, u.display_name, u.avatar_url, u.public_id,
       (SELECT COUNT(*)::int FROM broadcasters br WHERE br.agency_id = a.id AND br.status = 'approved') AS hosts
     FROM agencies a JOIN users u ON u.id = a.owner_id WHERE a.referrer_agency_id = $1 AND a.status <> 'rejected' ORDER BY a.created_at DESC`,
    [a.id],
  )).rows;
  const activeIds = invited.filter((x) => x.status === 'active').map((x) => x.id);
  const gifts = activeIds.length ? await agencyGiftRows(activeIds, b.start, b.end) : new Map();
  let month = 0n; let today = 0n; let yesterday = 0n;
  const list = invited.map((x) => {
    const p = agencyPrimSummary(cfg.levels, gifts.get(x.id) ?? new Map());
    const mine = (p.nowCents * bps) / 10000n;
    if (x.status === 'active') {
      month += mine; today += (p.todayCents * bps) / 10000n; yesterday += (p.yesterdayCents * bps) / 10000n;
    }
    return {
      id: x.id, name: x.name, logoUrl: x.logo_url, status: x.status, createdAt: x.created_at, hosts: x.hosts,
      owner: memberJson({ ...x, id: x.owner_id }),
      monthDiamonds: big(p.team), monthPrimCents: big(p.nowCents), myRewardCents: big(x.status === 'active' ? mine : 0n),
    };
  });
  const sums = (await query(
    `SELECT COALESCE(SUM(amount_cents) FILTER (WHERE status = 'paid'), 0)::text AS paid,
            COALESCE(SUM(amount_cents) FILTER (WHERE status = 'pending'), 0)::text AS pending
     FROM referral_statements WHERE agency_id = $1`, [a.id],
  )).rows[0];
  const statements = (await query(
    `SELECT s.*, p.period_key, p.starts_at, p.ends_at, ia.name AS invited_agency_name FROM referral_statements s
     JOIN payout_periods p ON p.id = s.period_id JOIN agencies ia ON ia.id = s.invited_agency_id
     WHERE s.agency_id = $1 ORDER BY p.starts_at DESC, s.amount_cents DESC LIMIT 50`, [a.id],
  )).rows;
  const apps = (await query(
    `SELECT x.id, x.name, x.status, x.created_at, x.decided_at, u.id AS uid, u.username, u.display_name, u.avatar_url, u.public_id
     FROM agency_applications x JOIN users u ON u.id = x.user_id WHERE x.referrer_agency_id = $1 ORDER BY x.created_at DESC LIMIT 30`, [a.id],
  )).rows;
  const ranking = (await query(
    `SELECT r.id, r.name, r.logo_url, COUNT(x.id)::int AS n FROM agencies x JOIN agencies r ON r.id = x.referrer_agency_id
     WHERE x.status = 'active' AND r.status = 'active' GROUP BY r.id, r.name, r.logo_url ORDER BY n DESC, r.name LIMIT 20`,
  )).rows;
  res.json({
    code: a.agency_code, referralBps: cfg.settings.referralBps, currency: cfg.settings.currency, period: { key: b.key },
    rewards: { todayCents: big(today), yesterdayCents: big(yesterday), monthCents: big(month), paidCents: sums.paid, pendingCents: sums.pending },
    invited: list,
    applications: apps.map((x) => ({ id: x.id, name: x.name, status: x.status, createdAt: x.created_at, decidedAt: x.decided_at, user: memberJson({ ...x, id: x.uid }) })),
    statements: statements.map(referralStatementJson),
    ranking: ranking.map((r) => ({ id: r.id, name: r.name, logoUrl: r.logo_url, invited: r.n, isMe: r.id === a.id })),
  });
});

// Yeni ajans önerisi (yönetici onaylayınca açılır; davet eden ajans olarak kaydedilir).
router.post('/agency-center/:agencyId/referrals', async (req, res) => {
  const acc = await agencyAccess(uuid(req.params.agencyId, 'Ajans'), req.user);
  if (acc.role !== 'owner') throw fail('Ajans önerisini ajans sahibi gönderir.', 403);
  const a = acc.agency;
  if (a.status !== 'active') throw fail('Ajans aktif değil.', 409);
  const userId = uuid(req.body?.userId, 'Kullanıcı');
  const name = cleanPublic(text(req.body?.name, 'Ajans adı', { min: 3, max: 60, required: true }), 'Ajans adı');
  const note = text(req.body?.note, 'Not', { max: 300 });
  if (userId === req.user.id) throw fail('Kendinizi öneremezsiniz.');
  const u = (await query(`SELECT account_status FROM users WHERE id = $1`, [userId])).rows[0];
  if (!u || u.account_status !== 'active') throw fail('Kullanıcı bulunamadı.', 404);
  if ((await query(`SELECT 1 FROM agencies WHERE owner_id = $1 AND status <> 'rejected'`, [userId])).rowCount) throw fail('Bu kişinin zaten bir ajansı var.', 409);
  try {
    const r = await query(
      `INSERT INTO agency_applications(user_id, referrer_agency_id, name, note, created_by) VALUES($1,$2,$3,$4,$5) RETURNING id`,
      [userId, a.id, name, note, req.user.id],
    );
    res.status(201).json({ ok: true, id: r.rows[0].id });
  } catch (error) {
    if (error.code === '23505') throw fail('Bu kişi için bekleyen bir ajans başvurusu zaten var.', 409);
    throw error;
  }
});

router.post('/agency-center/:agencyId/referrals/:id/cancel', async (req, res) => {
  const acc = await agencyAccess(uuid(req.params.agencyId, 'Ajans'), req.user);
  requireOwner(acc);
  const r = await query(
    `UPDATE agency_applications SET status = 'cancelled', decided_at = NOW() WHERE id = $1 AND referrer_agency_id = $2 AND status = 'pending' RETURNING id`,
    [uuid(req.params.id, 'Başvuru'), acc.agency.id],
  );
  if (!r.rowCount) throw fail('Bekleyen başvuru bulunamadı.', 404);
  res.json({ ok: true });
});
