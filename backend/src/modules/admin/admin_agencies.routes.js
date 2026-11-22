// Yönetici paneli — ajans ve yayıncı.
// Ortak yardımcılar ve import'lar: admin.shared.js
import { Router } from 'express';
import { DEFAULT_PAY_LEVELS, SETTING_COLUMNS, TRANSFER_SELECT, agencyDupError, agencyIdByCode, auditStaff, applyTransfer, cleanPublic, config, configJson, createAgency, ensureAgencyCode, fail, hub, loadConfig, logTransfer, notifyTransferResult, notifyUser, oneOf, positiveInt, query, requireSuperAdmin, savePayLevels, text, transferJson, tx, uuid, validateAgencyConfig, validateGrades, validatePayLevels } from './admin.shared.js';

export const router = Router();

// ---------------- Ajans ve yayıncı ----------------
router.get('/agencies', async (req, res) => {
  const status = req.query.status ? oneOf(String(req.query.status), ['pending', 'active', 'suspended', 'rejected'], 'Durum') : null;
  const r = await query(
    `SELECT a.*, u.username AS owner_username, ra.name AS referrer_name, ra.agency_code AS referrer_code,
       (SELECT COUNT(*)::int FROM broadcasters b WHERE b.agency_id = a.id) AS broadcaster_count,
       (SELECT COUNT(*)::int FROM agency_assistants s WHERE s.agency_id = a.id AND s.status = 'active') AS assistant_count
     FROM agencies a JOIN users u ON u.id = a.owner_id LEFT JOIN agencies ra ON ra.id = a.referrer_agency_id
     WHERE ($1::text IS NULL OR a.status = $1) ORDER BY a.created_at DESC LIMIT 200`,
    [status],
  );
  res.json({ agencies: r.rows.map((a) => ({
    id: a.id, name: a.name, ownerId: a.owner_id, ownerUsername: a.owner_username, status: a.status,
    commissionBps: a.commission_bps, overrideBps: a.commission_override_bps, agencyCode: a.agency_code, broadcasterCount: a.broadcaster_count, createdAt: a.created_at,
    assistantCount: a.assistant_count, referrer: a.referrer_agency_id ? { id: a.referrer_agency_id, name: a.referrer_name, agencyCode: a.referrer_code } : null,
  })) });
});

// Yönetici bir kullanıcıyı (ID / kullanıcı adı ile seçilir) ajans sahibi yapar; ajans doğrudan aktif açılır.
router.post('/agencies', requireSuperAdmin, async (req, res) => {
  const userId = uuid(req.body?.userId, 'Kullanıcı');
  const name = cleanPublic(text(req.body?.name, 'Ajans adı', { min: 3, max: 60, required: true }), 'Ajans adı');
  const description = text(req.body?.description, 'Açıklama', { max: 500 });
  const referrerAgencyId = req.body?.referrerCode ? await agencyIdByCode(req.body.referrerCode) : null;
  let agency;
  try {
    agency = await tx((c) => createAgency(c, { userId, name, description, adminId: req.user.id, referrerAgencyId }));
  } catch (error) {
    throw agencyDupError(error);
  }
  const code = await ensureAgencyCode(agency.id);
  hub.sendToUser(userId, { type: 'agency_created', agency: { id: agency.id, name: agency.name } });
  res.status(201).json({ agency: { id: agency.id, name: agency.name, status: agency.status, agencyCode: code } });
});

// Davet eden ajans (Davet Merkezi primi) sonradan ayarlanır / kaldırılır.

// Davet eden ajans (Davet Merkezi primi) sonradan ayarlanır / kaldırılır.
router.post('/agencies/:agencyId/referrer', requireSuperAdmin, async (req, res) => {
  const agencyId = uuid(req.params.agencyId, 'Ajans');
  const ref = req.body?.code ? await agencyIdByCode(req.body.code) : null;
  if (ref === agencyId) throw fail('Ajans kendi kendini davet etmiş olamaz.');
  if (ref && (await query(`SELECT 1 FROM agencies WHERE id = $1 AND referrer_agency_id = $2`, [ref, agencyId])).rowCount) {
    throw fail('İki ajans birbirini davet etmiş olamaz.');
  }
  const r = await query(`UPDATE agencies SET referrer_agency_id = $2 WHERE id = $1 RETURNING id`, [agencyId, ref]);
  if (!r.rowCount) throw fail('Ajans bulunamadı.', 404);
  await query(`INSERT INTO financial_audit_logs(admin_id, action, reference_type, reference_id, metadata) VALUES($1,'agency_referrer','agency',$2,$3)`,
    [req.user.id, agencyId, JSON.stringify({ referrerAgencyId: ref })]);
  res.json({ ok: true });
});

// Komisyon para etkisi taşıdığı için yalnızca yönetici.

// Komisyon para etkisi taşıdığı için yalnızca yönetici.
router.post('/agencies/:agencyId/status', requireSuperAdmin, async (req, res) => {
  const agencyId = uuid(req.params.agencyId, 'Ajans');
  const status = oneOf(req.body?.status, ['active', 'suspended', 'rejected'], 'Durum');
  let bps = null;
  if (req.body?.commissionBps !== undefined) {
    bps = Number(req.body.commissionBps);
    if (!Number.isInteger(bps) || bps < 0 || bps > 10000) throw fail('Komisyon 0-10000 (baz puan) arasında olmalı.');
  }
  const r = await query(
    `UPDATE agencies SET status = $2::text, commission_bps = COALESCE($3, commission_bps),
       approved_by = CASE WHEN $2::text = 'active' THEN $4::uuid ELSE approved_by END,
       approved_at = CASE WHEN $2::text = 'active' THEN NOW() ELSE approved_at END
     WHERE id = $1 RETURNING id, status, commission_bps`,
    [agencyId, status, bps, req.user.id],
  );
  if (!r.rowCount) throw fail('Ajans bulunamadı.', 404);
  if (status === 'active') await ensureAgencyCode(agencyId);
  await query(
    `INSERT INTO financial_audit_logs(admin_id, action, reference_type, reference_id, metadata) VALUES($1,'agency_status','agency',$2,$3)`,
    [req.user.id, agencyId, JSON.stringify({ status, commissionBps: r.rows[0].commission_bps })],
  );
  res.json({ agency: r.rows[0] });
});

router.get('/broadcasters', async (req, res) => {
  const status = req.query.status ? oneOf(String(req.query.status), ['pending', 'approved', 'rejected', 'suspended'], 'Durum') : null;
  const r = await query(
    `SELECT b.user_id, b.status, b.applied_at, b.agency_id, u.username, u.display_name, a.name AS agency_name
     FROM broadcasters b JOIN users u ON u.id = b.user_id LEFT JOIN agencies a ON a.id = b.agency_id
     WHERE ($1::text IS NULL OR b.status = $1) ORDER BY b.applied_at DESC LIMIT 200`,
    [status],
  );
  res.json({ broadcasters: r.rows.map((b) => ({
    userId: b.user_id, username: b.username, displayName: b.display_name, status: b.status, appliedAt: b.applied_at,
    agencyId: b.agency_id, agencyName: b.agency_name,
  })) });
});

router.post('/broadcasters/:userId/status', async (req, res) => {
  const userId = uuid(req.params.userId, 'Kullanıcı');
  const status = oneOf(req.body?.status, ['approved', 'rejected', 'suspended'], 'Durum');
  const row = await tx(async (c) => {
    const prev = (await c.query(`SELECT agency_id FROM broadcasters WHERE user_id = $1 FOR UPDATE`, [userId])).rows[0];
    if (!prev) throw fail('Yayıncı başvurusu bulunamadı.', 404);
    const r = await c.query(
      `UPDATE broadcasters SET status = $2::text,
         approved_by = CASE WHEN $2::text = 'approved' THEN $3::uuid ELSE approved_by END,
         approved_at = CASE WHEN $2::text = 'approved' THEN NOW() ELSE approved_at END,
         agency_id = CASE WHEN $2::text IN ('rejected','suspended') THEN NULL ELSE agency_id END,
         invited_by = CASE WHEN $2::text IN ('rejected','suspended') THEN NULL ELSE invited_by END
       WHERE user_id = $1 RETURNING user_id, status, agency_id`,
      [userId, status, req.user.id],
    );
    if (prev.agency_id && !r.rows[0].agency_id) {
      await c.query(
        `UPDATE agency_transfers SET status = 'cancelled', decided_at = NOW(), decided_by = $2, note = 'Platform: yayıncılık durumu değişti.'
         WHERE user_id = $1 AND status IN ('pending_source','pending_platform')`, [userId, req.user.id],
      );
      await logTransfer(c, { userId, from: prev.agency_id, kind: 'admin', decidedBy: req.user.id, note: `Yayıncılık ${status === 'suspended' ? 'askıya alındı' : 'reddedildi'}` });
    }
    await c.query(
      `INSERT INTO financial_audit_logs(admin_id, user_id, action, reference_type, metadata) VALUES($1,$2,'broadcaster_status','broadcaster',$3)`,
      [req.user.id, userId, JSON.stringify({ status })],
    );
    return r.rows[0];
  });
  res.json({ broadcaster: { user_id: row.user_id, status: row.status } });
});

// ---------------- Ajans ayarları ve maaş tablosu ----------------

// ---------------- Ajans ayarları ve maaş tablosu ----------------
router.get('/agency-config', async (req, res) => {
  res.json({ config: configJson(await loadConfig()) });
});

router.put('/agency-config', requireSuperAdmin, async (req, res) => {
  const v = validateAgencyConfig(req.body);
  const grades = req.body?.agencyGrades !== undefined ? validateGrades(req.body.agencyGrades) : null;
  await tx(async (c) => {
    if (v.settings) {
      for (const [k, col] of Object.entries(SETTING_COLUMNS)) {
        if (v.settings[k] !== undefined) await c.query(`UPDATE agency_settings SET ${col} = $1, updated_at = NOW() WHERE id = 1`, [v.settings[k]]);
      }
    }
    // Ağırlıklar JSONB: SETTING_COLUMNS döngüsünden geçmiyor, doğrulanıp ayrıca yazılıyor.
    if (v.salaryWeights) {
      await c.query(`UPDATE agency_settings SET salary_weights = $1, updated_at = NOW() WHERE id = 1`,
        [JSON.stringify(v.salaryWeights)]);
    }
    if (grades) {
      await c.query(`UPDATE agency_settings SET agency_grades = $1, updated_at = NOW() WHERE id = 1`,
        [JSON.stringify(grades.map((g) => ({ name: g.name, min: g.min.toString() })))]);
    }
    if (v.salaryTiers) {
      await c.query(`DELETE FROM host_salary_tiers`);
      for (const t of v.salaryTiers) {
        await c.query(`INSERT INTO host_salary_tiers(level, required_hours, required_diamonds, salary_cents) VALUES($1,$2,$3,$4)`, [t.level, t.hours, t.diamonds.toString(), t.salaryCents.toString()]);
      }
    }
    if (v.commissionTiers) {
      await c.query(`DELETE FROM agency_commission_tiers`);
      for (const t of v.commissionTiers) {
        await c.query(`INSERT INTO agency_commission_tiers(level, min_team_diamonds, commission_bps) VALUES($1,$2,$3)`, [t.level, t.minDiamonds.toString(), t.bps]);
      }
    }
    await c.query(`INSERT INTO financial_audit_logs(admin_id, action, reference_type, metadata) VALUES($1,'agency_config_update','agency_config',$2)`,
      [req.user.id, JSON.stringify([...Object.keys(v), ...(grades ? ['agencyGrades'] : [])])]);
  });
  res.json({ config: configJson(await loadConfig()) });
});

// kind: 'audio' (sesli oda tablosu) | 'video' (görüntülü yayın tablosu).

router.put('/pay-levels', requireSuperAdmin, async (req, res) => {
  const levels = validatePayLevels(req.body?.levels);
  const kind = req.body?.kind === 'video' || req.query.kind === 'video' ? 'video' : 'audio';
  await tx(async (c) => {
    await savePayLevels(c, levels, kind);
    await c.query(`INSERT INTO financial_audit_logs(admin_id, action, reference_type, metadata) VALUES($1,'pay_levels_update','agency_config',$2)`,
      [req.user.id, JSON.stringify({ levels: levels.length, kind })]);
  });
  res.json({ config: configJson(await loadConfig()) });
});

router.post('/pay-levels/reset', requireSuperAdmin, async (req, res) => {
  await tx(async (c) => {
    const kind = req.body?.kind === 'video' || req.query.kind === 'video' ? 'video' : 'audio';
    await savePayLevels(c, DEFAULT_PAY_LEVELS, kind);
    await c.query(`INSERT INTO financial_audit_logs(admin_id, action, reference_type, metadata) VALUES($1,'pay_levels_reset','agency_config',$2)`, [req.user.id, JSON.stringify({ kind })]);
  });
  res.json({ config: configJson(await loadConfig()) });
});

router.post('/agencies/:agencyId/commission-override', requireSuperAdmin, async (req, res) => {
  const agencyId = uuid(req.params.agencyId, 'Ajans');
  let bps = req.body?.bps;
  if (bps !== null) {
    if (!Number.isInteger(bps) || bps < 0 || bps > 10000) throw fail('Oran 0-10000 (baz puan) olmalı veya null.');
  }
  const r = await query(`UPDATE agencies SET commission_override_bps = $2 WHERE id = $1 RETURNING id, commission_override_bps`, [agencyId, bps]);
  if (!r.rowCount) throw fail('Ajans bulunamadı.', 404);
  await query(`INSERT INTO financial_audit_logs(admin_id, action, reference_type, reference_id, metadata) VALUES($1,'agency_commission_override','agency',$2,$3)`, [req.user.id, agencyId, JSON.stringify({ bps })]);
  res.json({ ok: true, overrideBps: r.rows[0].commission_override_bps });
});

/// Yayıncının SÖZLEŞME kademesi: ağırlıklı maaş hesabının temel maaşı buradan gelir.
///
/// Üst sınır maaş tablosunun kendisinden okunuyor. Sabit 10 yazılmıştı; tablo ise 44
/// kademeli, yani 11. kademeden yukarısı hiç atanamıyordu ve bu sütun maaş hesabında
/// kullanılmadığı sürece kimsenin dikkatini çekmemişti.
router.post('/broadcasters/:userId/contract', requireSuperAdmin, async (req, res) => {
  const userId = uuid(req.params.userId, 'Kullanıcı');
  const cfg = await loadConfig();
  const maxLevel = cfg.levels.reduce((a, l) => Math.max(a, l.level), 0) || 1;
  const tier = req.body?.tier === null ? null : positiveInt(req.body?.tier, 'Kademe', maxLevel);
  // Tabloda gerçekten var olan bir kademe olmalı: olmayan kademe, temel maaşı 0 yapardı.
  if (tier !== null && !cfg.levels.some((l) => l.level === tier)) {
    throw fail(`Maaş tablosunda ${tier}. kademe yok (1-${maxLevel}).`);
  }
  const r = await query(`UPDATE broadcasters SET contract_tier = $2 WHERE user_id = $1 RETURNING user_id`, [userId, tier]);
  if (!r.rowCount) throw fail('Yayıncı bulunamadı.', 404);
  await auditStaff(req, 'broadcaster_contract_tier', { userId, tier });
  res.json({ ok: true, tier, maxLevel });
});

// ---------------- Transferler (platform incelemesi) ----------------

// ---------------- Transferler (platform incelemesi) ----------------
router.get('/agency-transfers', async (req, res) => {
  const st = String(req.query.status ?? 'pending');
  const list = st === 'pending' ? ['pending_platform', 'pending_source'] : st === 'all' ? null : [oneOf(st, ['pending_platform', 'pending_source', 'approved', 'rejected', 'cancelled'], 'Durum')];
  const r = await query(
    `${TRANSFER_SELECT} WHERE ($1::text[] IS NULL OR t.status = ANY($1::text[]))
     ORDER BY (t.status = 'pending_platform') DESC, t.created_at DESC LIMIT 200`, [list],
  );
  res.json({ transfers: r.rows.map(transferJson) });
});

router.post('/agency-transfers/:id/decide', requireSuperAdmin, async (req, res) => {
  const id = uuid(req.params.id, 'Transfer');
  const approve = req.body?.approve === true;
  const note = text(req.body?.note, 'Not', { max: 200 });
  const r = await tx(async (c) => {
    const t = (await c.query(`SELECT * FROM agency_transfers WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!t || !['pending_platform', 'pending_source'].includes(t.status)) throw fail('Bekleyen transfer bulunamadı.', 404);
    if (approve) return { t, res: await applyTransfer(c, t, req.user.id) };
    const n = `Platform: ${note ?? 'reddedildi'}`;
    await c.query(`UPDATE agency_transfers SET status = 'rejected', decided_at = NOW(), decided_by = $2, note = $3 WHERE id = $1`, [id, req.user.id, n]);
    return { t, res: { ok: false, note: n } };
  });
  await query(`INSERT INTO financial_audit_logs(admin_id, user_id, action, reference_type, reference_id, metadata) VALUES($1,$2,'agency_transfer_decide','agency_transfer',$3,$4)`,
    [req.user.id, r.t.user_id, id, JSON.stringify({ approve, applied: r.res.ok })]);
  await notifyTransferResult(r.t, r.res.ok, r.res.note);
  res.json({ ok: true, applied: r.res.ok, note: r.res.note ?? null });
});

// ---------------- Ajans başvuruları (Davet Merkezi önerileri) ----------------

// ---------------- Ajans başvuruları (Davet Merkezi önerileri) ----------------
router.get('/agency-applications', async (req, res) => {
  const st = String(req.query.status ?? 'pending');
  const r = await query(
    `SELECT x.*, u.username, u.display_name, u.public_id, ra.name AS referrer_name, cu.username AS created_by_username
     FROM agency_applications x JOIN users u ON u.id = x.user_id LEFT JOIN agencies ra ON ra.id = x.referrer_agency_id
     LEFT JOIN users cu ON cu.id = x.created_by
     WHERE ($1 = 'all' OR x.status = $1) ORDER BY x.created_at DESC LIMIT 100`, [st],
  );
  res.json({ applications: r.rows.map((x) => ({
    id: x.id, name: x.name, note: x.note, status: x.status, createdAt: x.created_at, decidedAt: x.decided_at,
    user: { id: x.user_id, username: x.username, displayName: x.display_name, publicId: x.public_id },
    referrer: x.referrer_agency_id ? { id: x.referrer_agency_id, name: x.referrer_name } : null, createdBy: x.created_by_username ?? null,
  })) });
});

router.post('/agency-applications/:id/decide', requireSuperAdmin, async (req, res) => {
  const id = uuid(req.params.id, 'Başvuru');
  const approve = req.body?.approve === true;
  const rename = req.body?.name ? cleanPublic(text(req.body.name, 'Ajans adı', { min: 3, max: 60 }), 'Ajans adı') : null;
  let out;
  try {
    out = await tx(async (c) => {
      const x = (await c.query(`SELECT * FROM agency_applications WHERE id = $1 AND status = 'pending' FOR UPDATE`, [id])).rows[0];
      if (!x) throw fail('Bekleyen başvuru bulunamadı.', 404);
      if (!approve) {
        await c.query(`UPDATE agency_applications SET status = 'rejected', decided_at = NOW(), decided_by = $2 WHERE id = $1`, [id, req.user.id]);
        return { x, agency: null };
      }
      const ref = x.referrer_agency_id
        ? (await c.query(`SELECT id FROM agencies WHERE id = $1 AND status = 'active'`, [x.referrer_agency_id])).rows[0]?.id ?? null : null;
      const agency = await createAgency(c, { userId: x.user_id, name: rename ?? x.name, adminId: req.user.id, referrerAgencyId: ref });
      await c.query(`UPDATE agency_applications SET status = 'approved', decided_at = NOW(), decided_by = $2, agency_id = $3 WHERE id = $1`, [id, req.user.id, agency.id]);
      return { x, agency };
    });
  } catch (error) {
    throw agencyDupError(error);
  }
  if (out.agency) {
    await ensureAgencyCode(out.agency.id);
    hub.sendToUser(out.x.user_id, { type: 'agency_created', agency: { id: out.agency.id, name: out.agency.name } });
  }
  if (out.x.referrer_agency_id) {
    const ref = (await query(`SELECT owner_id FROM agencies WHERE id = $1`, [out.x.referrer_agency_id])).rows[0];
    if (ref) {
      notifyUser(ref.owner_id, 'agency_notice', out.agency ? 'Ajans öneriniz onaylandı' : 'Ajans öneriniz onaylanmadı',
        out.agency ? `"${out.agency.name}" ajansı açıldı. Davet Merkezi'nde takip edebilirsiniz.` : `"${out.x.name}" ajans öneriniz onaylanmadı.`, {});
    }
  }
  res.json({ ok: true, agencyId: out.agency?.id ?? null });
});

// ---------------- Özel ID ve yayıncı rozeti ----------------
