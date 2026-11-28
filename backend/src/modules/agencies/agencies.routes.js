import { clientIp } from '../../middleware/security/firewall.js';
import { acceptWithAction } from '../contracts/contracts.service.js';
import { cleanDevice } from '../users/sessions.service.js';
import { requireContract } from '../contracts/contracts.routes.js';
import { Router } from 'express';
import { hub } from '../../infrastructure/websocket/realtime.js';
import { query, tx } from '../../infrastructure/database/database.js';
import { requireAuth } from '../../middleware/authentication/auth.js';
import { fail, uuid, text, httpsUrl } from '../../shared/errors/http.js';
import crypto from 'node:crypto';
import { periodBounds, parsePeriodKey } from '../games/settlement.service.js';
import { loadConfig, configJson, hostProgress, hostStatementJson, agencyStatementJson, assistantStatementJson } from '../wallet/payouts.service.js';
import { estimateHosts, agencyGiftRows, agencyPrimSummary } from './agency_metrics.service.js';
import { salaryStatus } from '../wallet/instant_salary.service.js';
import { agencyAccess, requireOwner, logTransfer, applyTransfer, notifyTransferResult, ESCALATE_DAYS } from './agency_ops.service.js';
import { notifyUser } from '../notifications/notify.service.js';

export const router = Router();
router.use(requireAuth);
// Ajans sahibinin eski panel uçları da ajans sözleşmesi onayına bağlı (bkz. agency_center.routes.js).
const agencyGate = requireContract('agency');
router.use((req, res, next) => (/^\/agencies\/[^/]+\/(dashboard|statements|requests|invite|broadcasters)(\/|$)/.test(req.path) ? agencyGate(req, res, next) : next()));

const agencyJson = (a) => ({
  id: a.id, name: a.name, logoUrl: a.logo_url, description: a.description, status: a.status,
  commissionBps: a.commission_bps, ownerId: a.owner_id, createdAt: a.created_at,
  broadcasterCount: a.broadcaster_count ?? undefined, agencyCode: a.agency_code ?? undefined,
});
const AGENCY_SELECT = `SELECT a.*, (SELECT COUNT(*)::int FROM broadcasters b WHERE b.agency_id = a.id AND b.status = 'approved') AS broadcaster_count FROM agencies a`;

const publicAgencyJson = (a) => { const j = agencyJson(a); delete j.agencyCode; return j; };

// Yönetim ekranlarında (ajans sahibi/yönetici) gerçek kimlik gösterilir; "gizli kullanıcı" maskesi uygulanmaz.
export const memberJson = (x) => ({ id: x.id, username: x.username, displayName: x.display_name, avatarUrl: x.avatar_url, publicId: x.public_id ?? undefined });

// 8 haneli ajans kodu (ilk hane 0 olmaz).
export async function ensureAgencyCode(agencyId, run = query) {
  const cur = (await run(`SELECT agency_code FROM agencies WHERE id = $1`, [agencyId])).rows[0];
  if (!cur) return null;
  if (cur.agency_code) return cur.agency_code;
  for (let i = 0; i < 10; i += 1) {
    const code = String(10000000 + crypto.randomInt(0, 90000000));
    try {
      const r = await run(`UPDATE agencies SET agency_code = $2 WHERE id = $1 AND agency_code IS NULL RETURNING agency_code`, [agencyId, code]);
      return r.rows[0]?.agency_code ?? (await run(`SELECT agency_code FROM agencies WHERE id = $1`, [agencyId])).rows[0].agency_code;
    } catch (error) {
      if (error.code !== '23505') throw error;
    }
  }
  throw fail('Ajans kodu üretilemedi.', 503);
}

async function ownedAgency(userId) {
  return (await query(`SELECT * FROM agencies WHERE owner_id = $1 AND status <> 'rejected'`, [userId])).rows[0] || null;
}

function boundsFrom(req, cycle) {
  try { return req.query.period ? parsePeriodKey(String(req.query.period)) : periodBounds(cycle); }
  catch { throw fail('Dönem anahtarı geçersiz (örn. 2026-10 veya W2026-09-28).'); }
}

// ---------------- Ajans ----------------
router.get('/agencies', async (req, res) => {
  const q = String(req.query.q ?? '').trim().toLowerCase();
  const r = await query(
    `${AGENCY_SELECT} WHERE a.status = 'active' AND ($1 = '' OR lower(a.name) LIKE $2 ESCAPE '\\') ORDER BY a.name LIMIT 100`,
    [q, `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`],
  );
  res.json({ agencies: r.rows.map(publicAgencyJson) });
});

// Ajansı yalnızca yönetici açar (Yönetim → Ajans/Yayıncı → "Ajans aç" ya da Davet Merkezi önerisini onaylar).
router.post('/agencies', async () => {
  throw fail('Ajanslar yönetici tarafından açılır. Ajans kurmak için destek ile iletişime geçin.', 403);
});

router.get('/agencies/mine', async (req, res) => {
  let owned = await ownedAgency(req.user.id);
  if (owned && owned.status === 'active' && !owned.agency_code) { await ensureAgencyCode(owned.id); owned = await ownedAgency(req.user.id); }
  const membership = (await query(
    `SELECT b.status, b.joined_agency_at, a.id, a.name, a.logo_url, a.description, a.status AS agency_status
     FROM broadcasters b LEFT JOIN agencies a ON a.id = b.agency_id WHERE b.user_id = $1`,
    [req.user.id],
  )).rows[0];
  const assistant = (await query(
    `SELECT s.id, s.share_bps, a.id AS agency_id, a.name, a.logo_url, a.status FROM agency_assistants s JOIN agencies a ON a.id = s.agency_id
     WHERE s.user_id = $1 AND s.status = 'active'`, [req.user.id],
  )).rows[0];
  res.json({
    owned: owned ? agencyJson(owned) : null,
    membership: membership ? {
      broadcasterStatus: membership.status,
      agency: membership.id ? { id: membership.id, name: membership.name, logoUrl: membership.logo_url, description: membership.description, status: membership.agency_status } : null,
      joinedAt: membership.joined_agency_at,
    } : null,
    assistant: assistant ? { id: assistant.id, shareBps: assistant.share_bps, agency: { id: assistant.agency_id, name: assistant.name, logoUrl: assistant.logo_url, status: assistant.status } } : null,
  });
});

router.patch('/agencies/:agencyId', async (req, res) => {
  const acc = await agencyAccess(uuid(req.params.agencyId, 'Ajans'), req.user);
  requireOwner(acc);
  const sets = []; const values = [];
  if (req.body?.description !== undefined) { values.push(text(req.body.description, 'Açıklama', { max: 500 })); sets.push(`description = $${values.length}`); }
  if (req.body?.logoUrl !== undefined) { values.push(httpsUrl(req.body.logoUrl, 'Logo adresi')); sets.push(`logo_url = $${values.length}`); }
  if (!sets.length) throw fail('Değiştirilecek alan yok.');
  values.push(acc.agency.id);
  await query(`UPDATE agencies SET ${sets.join(', ')} WHERE id = $${values.length}`, values);
  res.json({ ok: true });
});

// Ajans paneli (v2.65 ve öncesi uygulamalar için; yeni uygulama /api/agency-center kullanır).
router.get('/agencies/:agencyId/dashboard', async (req, res) => {
  const acc = await agencyAccess(uuid(req.params.agencyId, 'Ajans'), req.user);
  requireOwner(acc);
  const a = acc.agency;
  const cfg = await loadConfig();
  const b = boundsFrom(req, cfg.settings.cycle);
  const hosts = (await query(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, u.public_id, br.status, br.joined_agency_at, br.approved_at, br.pay_method_pref, br.user_id
     FROM broadcasters br JOIN users u ON u.id = br.user_id WHERE br.agency_id = $1 ORDER BY u.username`, [a.id],
  )).rows;
  const est = await estimateHosts(hosts.filter((h) => h.status === 'approved'), cfg, b);
  const rows = hosts.map((h) => {
    const x = est.get(h.id);
    return {
      ...memberJson(h), status: h.status, joinedAt: h.joined_agency_at, seconds: x?.metrics.seconds ?? 0, diamonds: String(x?.metrics.diamonds ?? 0n),
      tier: x?.eval.level?.level ?? null, estimatedCents: String(x?.eval.salaryCents ?? 0n), atRisk: Boolean(x?.eval.penalty), eventsOk: x?.eventsOk ?? true,
    };
  });
  rows.sort((x, y) => (BigInt(y.diamonds) > BigInt(x.diamonds) ? 1 : BigInt(y.diamonds) < BigInt(x.diamonds) ? -1 : 0));
  const gifts = (await agencyGiftRows([a.id], b.start, b.end)).get(a.id) ?? new Map();
  const prim = agencyPrimSummary(cfg.levels, gifts);
  res.json({
    agency: agencyJson(a), periodKey: b.key, cycle: b.cycle, startsAt: b.start, endsAt: b.end, currency: cfg.settings.currency,
    broadcasters: rows,
    totals: {
      teamDiamonds: String(prim.team), seconds: rows.reduce((t, x) => t + x.seconds, 0),
      commissionBps: 0, commissionTier: null, estimatedCommissionDiamonds: '0', estimatedCommissionCents: String(prim.nowCents),
      overrideBps: null,
      estimatedSalaryCents: String(rows.reduce((t, x) => t + BigInt(x.estimatedCents), 0n)),
      next: null,
    },
    config: configJson(cfg),
  });
});

router.get('/agencies/:agencyId/statements', async (req, res) => {
  const acc = await agencyAccess(uuid(req.params.agencyId, 'Ajans'), req.user);
  const a = acc.agency;
  if (acc.role === 'assistant') {
    const mine = (await query(
      `SELECT s.*, p.period_key, p.starts_at, p.ends_at, $3::text AS agency_name FROM assistant_statements s JOIN payout_periods p ON p.id = s.period_id
       WHERE s.agency_id = $1 AND s.user_id = $2 ORDER BY p.starts_at DESC LIMIT 24`, [a.id, req.user.id, a.name],
    )).rows;
    return res.json({ agencyStatements: [], hostStatements: [], assistantStatements: mine.map(assistantStatementJson) });
  }
  const ags = (await query(
    `SELECT s.*, p.period_key, p.starts_at, p.ends_at, $2::text AS agency_name FROM agency_statements s JOIN payout_periods p ON p.id = s.period_id
     WHERE s.agency_id = $1 ORDER BY p.starts_at DESC LIMIT 24`, [a.id, a.name],
  )).rows;
  const hosts = (await query(
    `SELECT h.*, p.period_key, p.starts_at, p.ends_at, u.username, u.display_name FROM host_statements h
     JOIN payout_periods p ON p.id = h.period_id JOIN users u ON u.id = h.user_id
     WHERE h.agency_id = $1 ORDER BY p.starts_at DESC, h.salary_cents DESC LIMIT 200`, [a.id],
  )).rows;
  const asst = (await query(
    `SELECT s.*, p.period_key, p.starts_at, p.ends_at, u.username, u.display_name FROM assistant_statements s
     JOIN payout_periods p ON p.id = s.period_id JOIN users u ON u.id = s.user_id
     WHERE s.agency_id = $1 ORDER BY p.starts_at DESC LIMIT 100`, [a.id],
  )).rows;
  res.json({ agencyStatements: ags.map(agencyStatementJson), hostStatements: hosts.map(hostStatementJson), assistantStatements: asst.map(assistantStatementJson) });
});

// Ajans koduyla ajans bilgisi.
router.get('/agencies/by-code/:code', async (req, res) => {
  const code = String(req.params.code ?? '');
  if (!/^\d{8}$/.test(code)) throw fail('Ajans kodu 8 haneli olmalı.');
  const a = (await query(`${AGENCY_SELECT} WHERE a.agency_code = $1 AND a.status = 'active'`, [code])).rows[0];
  if (!a) throw fail('Bu koda ait ajans bulunamadı.', 404);
  res.json({ agency: publicAgencyJson(a) });
});

// Yayıncılık yalnızca ajans daveti ile: başvuru yolları kapalı.
const INVITE_ONLY = 'Yayıncı olmak için bir ajans sahibinin sizi davet etmesi gerekir.';
router.post('/agencies/apply-by-code', async () => { throw fail(INVITE_ONLY, 403); });

router.get('/agencies/:agencyId/requests', async (req, res) => {
  const acc = await agencyAccess(uuid(req.params.agencyId, 'Ajans'), req.user);
  const r = await query(
    `SELECT q.id AS request_id, q.direction, q.created_at AS request_created_at, q.invited_by, iu.display_name AS invited_by_name,
       u.id, u.username, u.display_name, u.avatar_url, u.public_id
     FROM agency_requests q JOIN users u ON u.id = q.user_id LEFT JOIN users iu ON iu.id = q.invited_by
     WHERE q.agency_id = $1 AND q.status = 'pending' AND ($2::uuid IS NULL OR q.invited_by = $2)
     ORDER BY q.created_at DESC`,
    [acc.agency.id, acc.role === 'assistant' ? req.user.id : null],
  );
  res.json({ requests: r.rows.map((x) => ({
    id: x.request_id, direction: x.direction, createdAt: x.request_created_at, user: memberJson(x),
    invitedBy: x.invited_by ? { id: x.invited_by, displayName: x.invited_by_name } : null,
  })) });
});

/** Yayıncı daveti (ajans sahibi ya da asistan). Başka ajanstaki yayıncı kabul ederse transfer isteği oluşur. */
export async function sendBroadcasterInvite(acc, inviter, userId) {
  const a = acc.agency;
  if (a.status !== 'active') throw fail('Ajans henüz aktif değil.', 409);
  if (userId === inviter.id) throw fail('Kendinizi davet edemezsiniz.');
  const target = (await query(`SELECT account_status FROM users WHERE id = $1`, [userId])).rows[0];
  if (!target || target.account_status !== 'active') throw fail('Kullanıcı bulunamadı.', 404);
  const b = (await query(`SELECT status, agency_id FROM broadcasters WHERE user_id = $1`, [userId])).rows[0];
  if (b?.status === 'suspended') throw fail('Bu kullanıcının yayıncılığı askıya alınmış; davet edilemez.', 409);
  if (b?.agency_id === a.id) throw fail('Bu yayıncı zaten ajansınızda.', 409);
  if ((await query(`SELECT 1 FROM agency_transfers WHERE user_id = $1 AND status IN ('pending_source','pending_platform')`, [userId])).rowCount) {
    throw fail('Bu yayıncının bekleyen bir transfer isteği var.', 409);
  }
  try {
    const r = await query(
      `INSERT INTO agency_requests(agency_id, user_id, direction, invited_by) VALUES($1,$2,'invite',$3) RETURNING id`,
      [a.id, userId, acc.role === 'assistant' ? inviter.id : null],
    );
    // Davet, kullanıcının Mesajlar sayfasına düşer.
    hub.sendToUser(userId, { type: 'agency_invite', requestId: r.rows[0].id, agency: { id: a.id, name: a.name, logoUrl: a.logo_url }, transfer: Boolean(b?.agency_id) });
    return { requestId: r.rows[0].id, transfer: Boolean(b?.agency_id) };
  } catch (error) {
    if (error.code === '23505') throw fail('Bu kullanıcı için bekleyen bir davet zaten var.', 409);
    throw error;
  }
}

router.post('/agencies/:agencyId/invite', async (req, res) => {
  const acc = await agencyAccess(uuid(req.params.agencyId, 'Ajans'), req.user);
  if (acc.role === 'admin') throw fail('Davet ajans sahibi ya da asistanı tarafından gönderilir.', 403);
  const r = await sendBroadcasterInvite(acc, req.user, uuid(req.body?.userId, 'Kullanıcı'));
  res.status(201).json({ ok: true, ...r });
});

router.post('/agencies/:agencyId/apply', async () => { throw fail(INVITE_ONLY, 403); });

// Davet eden değil, karşı taraf yanıtlar: davete kullanıcı, (eski) başvuruya ajans sahibi.
router.post('/agency-requests/:requestId/respond', async (req, res) => {
  const requestId = uuid(req.params.requestId, 'İstek');
  const accept = req.body?.accept === true;
  const cfg = await loadConfig();
  const wait = cfg.settings.transferWaitHours;
  const out = await tx(async (c) => {
    const q = (await c.query(`SELECT * FROM agency_requests WHERE id = $1 AND status = 'pending' FOR UPDATE`, [requestId])).rows[0];
    if (!q) throw fail('İstek bulunamadı veya yanıtlanmış.', 404);
    const agency = (await c.query(`SELECT * FROM agencies WHERE id = $1`, [q.agency_id])).rows[0];
    const allowed = q.direction === 'apply' ? agency.owner_id === req.user.id : q.user_id === req.user.id;
    if (!allowed) throw fail('Bu isteği yanıtlama yetkiniz yok.', 403);
    // Eski (davet sisteminden önceki) başvurular artık kabul edilemez; yalnızca reddedilir.
    if (accept && q.direction === 'apply') throw fail(INVITE_ONLY, 403);
    let result = { accepted: accept };
    if (accept) {
      if (agency.status !== 'active') throw fail('Ajans aktif değil.', 409);
      // Yayıncı sözleşmesi daveti kabul ederken, AYNI işlemde kabul edilir (uygulama contract: true gönderir; eski sürüme 428).
      await acceptWithAction(c, req.user, 'broadcaster', { consent: req.body?.contract === true, via: 'agency_invite', ip: clientIp(req), device: cleanDevice(req.body?.device) });
      const b = (await c.query(`SELECT status, agency_id FROM broadcasters WHERE user_id = $1 FOR UPDATE`, [q.user_id])).rows[0];
      if (b?.status === 'suspended') throw fail('Yayıncılığınız askıya alınmış. Destek ile iletişime geçin.', 409);
      if (b?.agency_id === agency.id) throw fail('Zaten bu ajansın yayıncısısınız.', 409);
      if ((await c.query(`SELECT 1 FROM agency_transfers WHERE user_id = $1 AND status IN ('pending_source','pending_platform')`, [q.user_id])).rowCount) {
        throw fail('Bekleyen bir transfer isteğiniz var; sonuçlanmadan yeni ajansa geçemezsiniz.', 409);
      }
      if (b?.agency_id && b.status === 'approved') {
        // Ajans değiştirme: kaynak ajans onayı (ya da süre dolunca otomatik onay). Kaynak ajans aktif değilse
        // (askıda / kapalı) onaylayacak kimse yok: transfer anında yapılır.
        const src = (await c.query(`SELECT status FROM agencies WHERE id = $1`, [b.agency_id])).rows[0];
        if (wait === 0 || !src || src.status !== 'active') {
          await c.query(`UPDATE broadcasters SET agency_id = $2, joined_agency_at = NOW(), invited_by = $3 WHERE user_id = $1`, [q.user_id, agency.id, q.invited_by]);
          await logTransfer(c, { userId: q.user_id, from: b.agency_id, to: agency.id, kind: 'transfer', invitedBy: q.invited_by, decidedBy: q.user_id });
          result = { accepted: true, transfer: 'approved' };
        } else {
          const t = (await c.query(
            `INSERT INTO agency_transfers(user_id, from_agency_id, to_agency_id, kind, status, invited_by, auto_at)
             VALUES($1,$2,$3,'transfer','pending_source',$4, NOW() + ($5::int * INTERVAL '1 hour')) RETURNING id, auto_at`,
            [q.user_id, b.agency_id, agency.id, q.invited_by, wait],
          )).rows[0];
          result = { accepted: true, transfer: 'pending', transferId: t.id, autoAt: t.auto_at, fromAgencyId: b.agency_id };
        }
      } else {
        // Ajansı olmayan kullanıcı ajansın onaylı yayıncısı olur (eski başvuru durumu ne olursa olsun).
        await c.query(
          `INSERT INTO broadcasters(user_id, agency_id, status, approved_at, joined_agency_at, invited_by) VALUES($1,$2,'approved',NOW(),NOW(),$3)
           ON CONFLICT (user_id) DO UPDATE SET agency_id = EXCLUDED.agency_id, status = 'approved',
             approved_at = COALESCE(broadcasters.approved_at, NOW()), joined_agency_at = NOW(), invited_by = EXCLUDED.invited_by`,
          [q.user_id, agency.id, q.invited_by],
        );
        await logTransfer(c, { userId: q.user_id, to: agency.id, kind: 'join', invitedBy: q.invited_by, decidedBy: q.user_id });
      }
      await c.query(`UPDATE agency_requests SET status = 'cancelled', responded_at = NOW() WHERE user_id = $1 AND status = 'pending' AND id <> $2`, [q.user_id, q.id]);
    }
    await c.query(`UPDATE agency_requests SET status = $2, responded_at = NOW() WHERE id = $1`, [q.id, accept ? 'accepted' : 'rejected']);
    return result;
  });
  if (out.transfer === 'pending') {
    const src = (await query(`SELECT owner_id, name FROM agencies WHERE id = $1`, [out.fromAgencyId])).rows[0];
    if (src) {
      notifyUser(src.owner_id, 'agency_transfer', 'Transfer isteği',
        `${req.user.display_name || req.user.username} ajansınızdan ayrılıp başka bir ajansa geçmek istiyor. Ajans Merkezi → Transfer geçmişi'nden yanıtlayın.`,
        { transferId: out.transferId });
    }
  }
  delete out.fromAgencyId;
  res.json({ ok: true, ...out });
});

// Ajans sahibi kendi ajansında yayıncı olabilir (davet beklemeden).
router.post('/agencies/:agencyId/self-join', async (req, res) => {
  const acc = await agencyAccess(uuid(req.params.agencyId, 'Ajans'), req.user);
  const a = acc.agency;
  if (a.owner_id !== req.user.id) throw fail('Yalnızca ajans sahibi.', 403);
  if (a.status !== 'active') throw fail('Ajans henüz aktif değil.', 409);
  await tx(async (c) => {
    const b = (await c.query(`SELECT status, agency_id FROM broadcasters WHERE user_id = $1 FOR UPDATE`, [req.user.id])).rows[0];
    if (b?.status === 'suspended') throw fail('Yayıncılığınız askıya alınmış. Destek ile iletişime geçin.', 409);
    if (b?.agency_id === a.id && b.status === 'approved') throw fail('Zaten bu ajansın yayıncısısınız.', 409);
    await acceptWithAction(c, req.user, 'broadcaster', { consent: req.body?.contract === true, via: 'self_join', ip: clientIp(req), device: cleanDevice(req.body?.device) });
    if (b?.agency_id && b.agency_id !== a.id) throw fail('Başka bir ajansa bağlısınız. Önce o ajanstan ayrılın.', 409);
    await c.query(
      `INSERT INTO broadcasters(user_id, agency_id, status, approved_at, joined_agency_at) VALUES($1,$2,'approved',NOW(),NOW())
       ON CONFLICT (user_id) DO UPDATE SET agency_id = EXCLUDED.agency_id, status = 'approved',
         approved_at = COALESCE(broadcasters.approved_at, NOW()), joined_agency_at = NOW(), invited_by = NULL`,
      [req.user.id, a.id],
    );
    await c.query(`UPDATE agency_requests SET status = 'cancelled', responded_at = NOW() WHERE user_id = $1 AND status = 'pending'`, [req.user.id]);
    await logTransfer(c, { userId: req.user.id, to: a.id, kind: 'join', decidedBy: req.user.id });
  });
  res.json({ ok: true });
});

router.post('/agencies/:agencyId/broadcasters/:userId/remove', async (req, res) => {
  const acc = await agencyAccess(uuid(req.params.agencyId, 'Ajans'), req.user);
  requireOwner(acc);
  const userId = uuid(req.params.userId, 'Kullanıcı');
  await tx(async (c) => {
    const r = await c.query(
      `UPDATE broadcasters SET agency_id = NULL, joined_agency_at = NULL, invited_by = NULL WHERE user_id = $1 AND agency_id = $2 RETURNING user_id`,
      [userId, acc.agency.id],
    );
    if (!r.rowCount) throw fail('Yayıncı bu ajansta değil.', 404);
    await c.query(
      `UPDATE agency_transfers SET status = 'cancelled', decided_at = NOW(), decided_by = $2, note = 'Yayıncı ajanstan çıkarıldı.'
       WHERE user_id = $1 AND status IN ('pending_source','pending_platform')`, [userId, req.user.id],
    );
    await logTransfer(c, { userId, from: acc.agency.id, kind: 'removed', decidedBy: req.user.id });
  });
  hub.sendToUser(userId, { type: 'agency_update' });
  res.json({ ok: true });
});

// ---------------- Yayıncı ----------------
router.post('/broadcaster/apply', async () => { throw fail(INVITE_ONLY, 403); });

const transferJson = (t) => ({
  id: t.id, kind: t.kind, status: t.status, createdAt: t.created_at, autoAt: t.auto_at, decidedAt: t.decided_at, note: t.note ?? null,
  from: t.from_agency_id ? { id: t.from_agency_id, name: t.from_name ?? null } : null,
  to: t.to_agency_id ? { id: t.to_agency_id, name: t.to_name ?? null } : null,
  user: t.u_id ? { id: t.u_id, username: t.u_username, displayName: t.u_display_name, avatarUrl: t.u_avatar_url, publicId: t.u_public_id ?? null } : undefined,
  invitedBy: t.invited_by ? { id: t.invited_by, displayName: t.inv_name ?? null } : null,
  // Kaynak ajansın reddettiği transfer 7 gün içinde platforma taşınabilir (platformun kararı kesindir).
  canEscalate: t.status === 'rejected' && Boolean(t.decided_at) && !String(t.note ?? '').startsWith('Platform:')
    && Date.now() - new Date(t.decided_at).getTime() < ESCALATE_DAYS * 86400e3,
});
export const TRANSFER_SELECT = `SELECT t.*, fa.name AS from_name, ta.name AS to_name, iu.display_name AS inv_name,
    u.id AS u_id, u.username AS u_username, u.display_name AS u_display_name, u.avatar_url AS u_avatar_url, u.public_id AS u_public_id
  FROM agency_transfers t JOIN users u ON u.id = t.user_id
  LEFT JOIN agencies fa ON fa.id = t.from_agency_id LEFT JOIN agencies ta ON ta.id = t.to_agency_id LEFT JOIN users iu ON iu.id = t.invited_by`;
export { transferJson };

router.get('/broadcaster/me', async (req, res) => {
  const b = (await query(
    `SELECT b.user_id, b.status, b.joined_agency_at, b.approved_at, b.pay_method_pref, a.id AS agency_id, a.name AS agency_name, a.logo_url AS agency_logo,
       a.announcement, a.announcement_at
     FROM broadcasters b LEFT JOIN agencies a ON a.id = b.agency_id WHERE b.user_id = $1`,
    [req.user.id],
  )).rows[0];
  if (!b) return res.json({ broadcaster: null });
  const cfg = await loadConfig();
  const progress = b.status === 'approved' ? await hostProgress(b, cfg) : null;
  const total = (await query(
    `SELECT COALESCE(SUM(COALESCE(diamond_amount, coin_amount)), 0) AS diamonds FROM gift_transactions WHERE receiver_id = $1 AND sender_id <> $1`, [req.user.id],
  )).rows[0];
  const kyc = (await query(`SELECT kyc_status FROM users WHERE id = $1`, [req.user.id])).rows[0].kyc_status;
  // Para çekme yalnızca maaş hak edildiğinde görünür: bu dönemde kotayı doldurup maaşı hak etmiş (tahmini maaş > 0) ya da
  // kapanmış dönemden henüz ödenmemiş maaşı var.
  const unpaid = (await query(
    `SELECT COALESCE(SUM(salary_cents), 0)::text AS cents FROM host_statements WHERE user_id = $1 AND status = 'pending' AND salary_cents > 0`,
    [req.user.id],
  )).rows[0].cents;
  // Maaş yalnızca ajanstaki yayıncıya hesaplanır (ajansı olmayana dönem kapanınca maaş çıkmaz).
  let withdrawEligible = b.status === 'approved' && ((Boolean(b.agency_id) && BigInt(progress?.estimatedCents ?? 0) > 0n) || BigInt(unpaid) > 0n);
  // Önceki dönem bitti ama yönetim henüz kapatmadı: o dönemde hak edilen maaş da sayılır (yeni dönem başında düğme kaybolmasın).
  if (!withdrawEligible && b.status === 'approved' && b.agency_id && progress) {
    const prevDate = new Date(new Date(progress.startsAt).getTime() - 1000);
    const prevKey = periodBounds(cfg.settings.cycle, prevDate).key;
    const closed = await query(`SELECT 1 FROM payout_periods WHERE period_key = $1`, [prevKey]);
    if (!closed.rowCount) {
      const prev = await hostProgress(b, cfg, prevDate);
      withdrawEligible = BigInt(prev.estimatedCents) > 0n;
    }
  }
  const pending = (await query(`${TRANSFER_SELECT} WHERE t.user_id = $1 AND t.status IN ('pending_source','pending_platform')`, [req.user.id])).rows[0];
  const lastRejected = pending ? null : (await query(
    `${TRANSFER_SELECT} WHERE t.user_id = $1 AND t.status = 'rejected' AND t.decided_at > NOW() - ($2::int * INTERVAL '1 day') ORDER BY t.decided_at DESC LIMIT 1`,
    [req.user.id, ESCALATE_DAYS],
  )).rows[0];
  res.json({
    broadcaster: {
      status: b.status,
      agency: b.agency_id ? { id: b.agency_id, name: b.agency_name, logoUrl: b.agency_logo } : null,
      announcement: b.agency_id && b.announcement ? { text: b.announcement, at: b.announcement_at } : null,
      joinedAgencyAt: b.joined_agency_at, totalDiamonds: String(total.diamonds), kycStatus: kyc,
      payPref: b.pay_method_pref ?? 0,
      pendingTransfer: pending ? transferJson(pending) : null,
      rejectedTransfer: lastRejected ? transferJson(lastRejected) : null,
      progress: progress ?? undefined, config: configJson(cfg),
      withdrawEligible, unpaidSalaryCents: unpaid,
      // "Maaşım neden yatmadı?" — engel listesi (telefon doğrulama, ajans, sözleşme, kota, bakiye...).
      salaryStatus: b.status === 'approved' ? await salaryStatus(req.user.id) : undefined,
    },
  });
});

router.post('/broadcaster/pay-pref', async (req, res) => {
  const pref = req.body?.pref === 1 ? 1 : 0;
  const r = await query(`UPDATE broadcasters SET pay_method_pref = $2 WHERE user_id = $1 RETURNING pay_method_pref`, [req.user.id, pref]);
  if (!r.rowCount) throw fail('Yayıncı değilsiniz.', 404);
  res.json({ ok: true, payPref: r.rows[0].pay_method_pref });
});

router.get('/broadcaster/statements', async (req, res) => {
  const r = await query(
    `SELECT h.*, p.period_key, p.starts_at, p.ends_at, u.username, a.name AS agency_name FROM host_statements h
     JOIN payout_periods p ON p.id = h.period_id JOIN users u ON u.id = h.user_id LEFT JOIN agencies a ON a.id = h.agency_id
     WHERE h.user_id = $1 ORDER BY p.starts_at DESC LIMIT 24`, [req.user.id],
  );
  res.json({ statements: r.rows.map(hostStatementJson) });
});

router.get('/broadcaster/requests', async (req, res) => {
  const r = await query(
    `SELECT q.id, q.direction, q.created_at, a.id AS agency_id, a.name AS agency_name, a.logo_url AS agency_logo,
       (SELECT b.agency_id FROM broadcasters b WHERE b.user_id = q.user_id AND b.status = 'approved') AS current_agency
     FROM agency_requests q JOIN agencies a ON a.id = q.agency_id WHERE q.user_id = $1 AND q.status = 'pending' ORDER BY q.created_at DESC`,
    [req.user.id],
  );
  res.json({
    requests: r.rows.map((x) => ({
      id: x.id, direction: x.direction, createdAt: x.created_at, agency: { id: x.agency_id, name: x.agency_name, logoUrl: x.agency_logo },
      transfer: Boolean(x.current_agency && x.current_agency !== x.agency_id),
    })),
  });
});

router.get('/broadcaster/transfers', async (req, res) => {
  const r = await query(`${TRANSFER_SELECT} WHERE t.user_id = $1 ORDER BY t.created_at DESC LIMIT 30`, [req.user.id]);
  res.json({ transfers: r.rows.map(transferJson) });
});

// Ajanstan ayrılma: bekleme süresi varsa ajans onayı (ya da süre dolunca otomatik) gerekir.
router.post('/broadcaster/leave-agency', async (req, res) => {
  const cfg = await loadConfig();
  const wait = cfg.settings.transferWaitHours;
  const out = await tx(async (c) => {
    const b = (await c.query(`SELECT agency_id, status FROM broadcasters WHERE user_id = $1 FOR UPDATE`, [req.user.id])).rows[0];
    if (!b?.agency_id) throw fail('Bir ajansa bağlı değilsiniz.', 404);
    if ((await c.query(`SELECT 1 FROM agency_transfers WHERE user_id = $1 AND status IN ('pending_source','pending_platform')`, [req.user.id])).rowCount) {
      throw fail('Bekleyen bir transfer isteğiniz zaten var.', 409);
    }
    const a = (await c.query(`SELECT owner_id, status FROM agencies WHERE id = $1`, [b.agency_id])).rows[0];
    // Kendi ajansından ayrılan sahip, askıdaki / kapalı ajans ya da bekleme süresi 0 ise anında ayrılır.
    if (wait === 0 || !a || a.owner_id === req.user.id || a.status !== 'active' || b.status !== 'approved') {
      await c.query(`UPDATE broadcasters SET agency_id = NULL, joined_agency_at = NULL, invited_by = NULL WHERE user_id = $1`, [req.user.id]);
      await logTransfer(c, { userId: req.user.id, from: b.agency_id, kind: 'leave', decidedBy: req.user.id });
      return { pending: false };
    }
    const t = (await c.query(
      `INSERT INTO agency_transfers(user_id, from_agency_id, kind, status, auto_at) VALUES($1,$2,'leave','pending_source', NOW() + ($3::int * INTERVAL '1 hour'))
       RETURNING id, auto_at`,
      [req.user.id, b.agency_id, wait],
    )).rows[0];
    return { pending: true, transferId: t.id, autoAt: t.auto_at, ownerId: a.owner_id };
  });
  if (out.pending) {
    notifyUser(out.ownerId, 'agency_transfer', 'Ayrılma isteği',
      `${req.user.display_name || req.user.username} ajansınızdan ayrılmak istiyor. Ajans Merkezi → Transfer geçmişi'nden yanıtlayın.`, { transferId: out.transferId });
    delete out.ownerId;
  }
  res.json({ ok: true, ...out });
});

// Kaynak ajans sahibi bekleyen transferi onaylar / reddeder.
router.post('/agency-transfers/:id/respond', async (req, res) => {
  const id = uuid(req.params.id, 'Transfer');
  const approve = req.body?.approve === true;
  const note = text(req.body?.note, 'Not', { max: 200 });
  const r = await tx(async (c) => {
    const t = (await c.query(`SELECT * FROM agency_transfers WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!t || t.status !== 'pending_source') throw fail('Bekleyen transfer bulunamadı.', 404);
    const a = (await c.query(`SELECT owner_id FROM agencies WHERE id = $1`, [t.from_agency_id])).rows[0];
    if (!a || a.owner_id !== req.user.id) throw fail('Bu transferi yalnızca kaynak ajansın sahibi yanıtlayabilir.', 403);
    if (approve) return { t, res: await applyTransfer(c, t, req.user.id) };
    await c.query(`UPDATE agency_transfers SET status = 'rejected', decided_at = NOW(), decided_by = $2, note = $3 WHERE id = $1`, [id, req.user.id, note]);
    return { t, res: { ok: false, note } };
  });
  await notifyTransferResult(r.t, r.res.ok, r.res.note);
  res.json({ ok: true, applied: r.res.ok, note: r.res.note ?? null });
});

// Reddedilen transferi yayıncı platform (yönetim) incelemesine taşır.
router.post('/agency-transfers/:id/escalate', async (req, res) => {
  const id = uuid(req.params.id, 'Transfer');
  const r = await query(
    `UPDATE agency_transfers SET status = 'pending_platform', note = NULL, decided_at = NULL, decided_by = NULL
     WHERE id = $1 AND user_id = $2 AND status = 'rejected' AND decided_at > NOW() - ($3::int * INTERVAL '1 day')
       AND COALESCE(note, '') NOT LIKE 'Platform:%'
       AND NOT EXISTS (SELECT 1 FROM agency_transfers o WHERE o.user_id = $2 AND o.status IN ('pending_source','pending_platform'))
     RETURNING id`,
    [id, req.user.id, ESCALATE_DAYS],
  );
  if (!r.rowCount) throw fail('Bu transfer platforma taşınamaz (süresi geçmiş ya da başka bir istek bekliyor).', 409);
  res.json({ ok: true });
});

router.post('/agency-transfers/:id/cancel', async (req, res) => {
  const id = uuid(req.params.id, 'Transfer');
  const r = await query(
    `UPDATE agency_transfers SET status = 'cancelled', decided_at = NOW(), decided_by = $2, note = 'Yayıncı vazgeçti.'
     WHERE id = $1 AND user_id = $2 AND status IN ('pending_source','pending_platform') RETURNING id`, [id, req.user.id],
  );
  if (!r.rowCount) throw fail('Bekleyen transfer bulunamadı.', 404);
  res.json({ ok: true });
});
