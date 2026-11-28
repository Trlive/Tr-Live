// Sözleşme uçları: kullanıcı (/api/contracts) ve süper yönetici (/api/admin/contracts). Kurallar: contracts.service.js.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import { query } from '../../infrastructure/database/database.js';
import { requireAuth, requireSuperAdmin } from '../../middleware/authentication/auth.js';
import { userLimit, clientIp } from '../../middleware/security/firewall.js';
import { fail, uuid } from '../../shared/errors/http.js';
import { cleanDevice } from '../users/sessions.service.js';
import { getConfig, phoneVerifyOn } from '../system/app_config.service.js';
import { log } from '../../infrastructure/observability/log.js';
import { jwtSecret } from '../../config.js';
import { KINDS, isKind, statusFor, viewFor, accept, publishTemplate, relationOf, hasAccepted } from './contracts.service.js';

export const router = Router();
export const adminRouter = Router();
export const publicRouter = Router();
router.use(requireAuth);

// ---------------------------------------------------------------- PDF indirme bağlantısı
// Uygulama PDF'i telefonun tarayıcısında açar; tarayıcıda oturum başlığı olmadığı için tek belgeye özel, 5 dakikalık imzalı
// bağlantı verilir. Bağlantıda belge kimliği ve bitiş zamanı imzalıdır; başka belgeye ya da süre sonrasına kullanılamaz.
const LINK_TTL_SEC = 300;
const b64u = (b) => Buffer.from(b).toString('base64url');
const linkSig = (body) => b64u(crypto.createHmac('sha256', jwtSecret()).update(`contract-pdf|${body}`).digest());
export function pdfLinkToken(acceptanceId, now = Date.now()) {
  const body = b64u(`${acceptanceId}|${Math.floor(now / 1000) + LINK_TTL_SEC}`);
  return `${body}.${linkSig(body)}`;
}
export function readPdfLinkToken(token, now = Date.now()) {
  const [body, sig] = String(token ?? '').split('.');
  if (!body || !sig || body.length > 200) return null;
  const want = linkSig(body);
  if (want.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
  const [id, exp] = Buffer.from(body, 'base64url').toString().split('|');
  if (!/^[0-9a-f-]{36}$/i.test(id ?? '') || !(Number(exp) > Math.floor(now / 1000))) return null;
  return id;
}

const maskPhone = (p) => (p ? `${p.slice(0, 4)}••••${p.slice(-2)}` : null);

/**
 * Kapı: kullanıcı bu türün tarafıysa (ör. bayi hesabı sahibi) ve o tür için yayımlanmış bir sözleşme varsa, en az bir sürümü
 * onaylamış olmalı. Değilse 428 + code: 'contract_required' (uygulama sözleşme ekranını açar). Taraf olmayan (ör. ajans asistanı)
 * ve sözleşme yayımlanmamış türler etkilenmez.
 */
export const requireContract = (kind) => async (req, res, next) => {
  try {
    if (!req.user) return next();
    if (!(await relationOf(req.user.id, kind))) return next();
    if (await hasAccepted(req.user.id, kind)) return next();
    return res.status(428).json({ code: 'contract_required', kind, message: `${KINDS[kind].title} onayınızı bekliyor. Devam etmek için sözleşmeyi okuyup onaylayın.` });
  } catch (e) { return next(e); }
};

router.get('/', async (req, res) => {
  res.json({ contracts: await statusFor(req.user.id) });
});

router.get('/acceptances', async (req, res) => {
  const r = await query(
    `SELECT id, contract_no, kind, version, method, accepted_at FROM contract_acceptances WHERE user_id = $1 ORDER BY accepted_at DESC`, [req.user.id],
  );
  res.json({ acceptances: r.rows.map((x) => ({ id: x.id, contractNo: x.contract_no, kind: x.kind, version: x.version, method: x.method, acceptedAt: x.accepted_at })) });
});

async function sendPdf(res, id, ownerId = null) {
  const r = (await query(
    `SELECT contract_no, pdf, pdf_sha256 FROM contract_acceptances WHERE id = $1 AND ($2::uuid IS NULL OR user_id = $2)`, [id, ownerId],
  )).rows[0];
  if (!r) throw fail('Belge bulunamadı.', 404);
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${r.contract_no}.pdf"`,
    'X-Content-SHA256': r.pdf_sha256,
    'Cache-Control': 'private, no-store',
  });
  res.send(r.pdf);
}

router.get('/acceptances/:id/pdf', async (req, res) => {
  await sendPdf(res, uuid(req.params.id, 'Belge'), req.user.id);
});

router.post('/acceptances/:id/link', userLimit('contract_pdf_link', 30, 15 * 60e3), async (req, res) => {
  const id = uuid(req.params.id, 'Belge');
  const own = await query(`SELECT 1 FROM contract_acceptances WHERE id = $1 AND user_id = $2`, [id, req.user.id]);
  if (!own.rowCount) throw fail('Belge bulunamadı.', 404);
  res.json({ path: `/api/contract-pdf/${pdfLinkToken(id)}`, expiresIn: LINK_TTL_SEC });
});

// Oturumsuz (imzalı bağlantı). app.js'te /api/contract-pdf altına bağlanır.
publicRouter.get('/:token', async (req, res) => {
  const id = readPdfLinkToken(req.params.token);
  if (!id) throw fail('Bağlantının süresi dolmuş ya da geçersiz. Uygulamadan yeniden açın.', 410);
  await sendPdf(res, id);
});

router.get('/:kind', async (req, res) => {
  const v = await viewFor(req.user, String(req.params.kind));
  const cfg = await getConfig();
  const sms = phoneVerifyOn(cfg);
  res.json({
    kind: v.kind, title: v.title, version: v.version, text: v.text, sha256: v.sha256,
    // Onayın ikinci adımı: SMS (Firebase) ya da SMS yapılandırılmamışsa hesap şifresi.
    method: sms ? 'sms' : 'password', phone: sms ? req.user.phone ?? null : null, phoneMasked: maskPhone(req.user.phone),
  });
});

router.post('/:kind/accept', userLimit('contract_accept', 10, 15 * 60e3), async (req, res) => {
  const kind = String(req.params.kind);
  if (!isKind(kind)) throw fail('Sözleşme türü geçersiz.', 404);
  const sha = String(req.body?.sha256 ?? '');
  if (!/^[0-9a-f]{64}$/.test(sha)) throw fail('Sözleşme özeti eksik.');
  const out = await accept(req.user, kind, {
    sha, scrolled: req.body?.scrolled === true, idToken: req.body?.idToken, password: req.body?.password,
    ip: clientIp(req), device: cleanDevice(req.body?.device),
  });
  if (!out.already) log.info('contract_accepted', { userId: req.user.id, kind, contractNo: out.contractNo });
  res.status(out.already ? 200 : 201).json({ ok: true, id: out.id, contractNo: out.contractNo, already: out.already });
});

// ---------------------------------------------------------------- Süper yönetici
adminRouter.use(requireAuth, requireSuperAdmin);

// Taslaklar (yayımlanmamış, [KARAR] notlu metinler) bu klasörde. Yayımlamak için panelde metin düzenlenip sürüm verilir.
const DRAFT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'drafts');
const DRAFT_FILES = { broadcaster: '1_yayinci_sozlesmesi.md', agency: '2_ajans_sahibi_sozlesmesi.md', dealer: '3_coin_bayilik_sozlesmesi.md' };

adminRouter.get('/templates', async (req, res) => {
  const r = await query(
    `SELECT t.id, t.kind, t.version, t.title, t.body, t.sha256, t.published_at, u.username AS published_by,
            (SELECT COUNT(*)::int FROM contract_acceptances a WHERE a.template_id = t.id) AS acceptances
     FROM contract_templates t LEFT JOIN users u ON u.id = t.published_by ORDER BY t.kind, t.published_at DESC`,
  );
  const drafts = {};
  for (const [kind, file] of Object.entries(DRAFT_FILES)) {
    try { drafts[kind] = fs.readFileSync(path.join(DRAFT_DIR, file), 'utf8'); } catch { drafts[kind] = ''; }
  }
  res.json({
    kinds: Object.entries(KINDS).map(([k, v]) => ({ kind: k, title: v.title, prefix: v.prefix })),
    templates: r.rows.map((x) => ({
      id: x.id, kind: x.kind, version: x.version, title: x.title, body: x.body, sha256: x.sha256, publishedAt: x.published_at,
      publishedBy: x.published_by, acceptances: x.acceptances,
    })),
    drafts,
  });
});

adminRouter.post('/templates', userLimit('contract_publish', 20, 3600e3), async (req, res) => {
  const t = await publishTemplate({ kind: req.body?.kind, version: req.body?.version, title: req.body?.title, body: req.body?.body, adminId: req.user.id });
  log.warn('contract_published', { kind: t.kind, version: t.version, adminId: req.user.id, sha256: t.sha256 });
  res.status(201).json({ template: t });
});

adminRouter.get('/acceptances', async (req, res) => {
  const kind = req.query.kind && isKind(String(req.query.kind)) ? String(req.query.kind) : null;
  const q = String(req.query.q ?? '').trim().slice(0, 60);
  const r = await query(
    `SELECT a.id, a.contract_no, a.kind, a.version, a.method, a.phone, a.ip, a.accepted_at, a.rendered_sha256, a.pdf_sha256, a.party
     FROM contract_acceptances a
     WHERE ($1::text IS NULL OR a.kind = $1)
       AND ($2 = '' OR a.contract_no ILIKE '%' || $2 || '%' OR a.party->>'username' ILIKE '%' || $2 || '%' OR a.party->>'publicId' = $2)
     ORDER BY a.accepted_at DESC LIMIT 200`,
    [kind, q],
  );
  res.json({
    acceptances: r.rows.map((x) => ({
      id: x.id, contractNo: x.contract_no, kind: x.kind, version: x.version, method: x.method, phone: x.phone, ip: x.ip,
      acceptedAt: x.accepted_at, renderedSha256: x.rendered_sha256, pdfSha256: x.pdf_sha256,
      name: x.party?.name ?? null, username: x.party?.username ?? null, publicId: x.party?.publicId ?? null,
    })),
  });
});

/** Sözleşmesi yayımlanmış türde henüz hiçbir sürümü onaylamamış taraflar (ödemesi bekleyecek olanlar). */
adminRouter.get('/pending', async (req, res) => {
  const kind = String(req.query.kind ?? 'broadcaster');
  if (!isKind(kind)) throw fail('Tür geçersiz.');
  const src = {
    broadcaster: `SELECT u.id, u.username, u.display_name, u.public_id FROM broadcasters b JOIN users u ON u.id = b.user_id WHERE b.status = 'approved'`,
    agency: `SELECT u.id, u.username, u.display_name, u.public_id FROM agencies a JOIN users u ON u.id = a.owner_id WHERE a.status = 'active'`,
    dealer: `SELECT u.id, u.username, u.display_name, u.public_id FROM dealer_accounts d JOIN users u ON u.id = d.owner_user_id WHERE d.is_active`,
  }[kind];
  const r = await query(
    `SELECT x.* FROM (${src}) x
     WHERE EXISTS (SELECT 1 FROM contract_templates t WHERE t.kind = $1)
       AND NOT EXISTS (SELECT 1 FROM contract_acceptances a WHERE a.user_id = x.id AND a.kind = $1)
     ORDER BY x.username LIMIT 500`,
    [kind],
  );
  res.json({ kind, users: r.rows.map((x) => ({ id: x.id, username: x.username, displayName: x.display_name, publicId: x.public_id })) });
});

adminRouter.get('/acceptances/:id/pdf', async (req, res) => {
  await sendPdf(res, uuid(req.params.id, 'Belge'));
});
