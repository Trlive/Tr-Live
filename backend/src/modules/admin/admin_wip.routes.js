// Yönetici paneli — WIP ayrıcalıkları.
// Ortak yardımcılar ve import'lar: admin.shared.js
import { Router } from 'express';
import { announceUserChange, assertStaffTarget, bigAmount, cleanFeatures, fail, ghostNow, positiveInt, query, refreshGhost, requireSuperAdmin, text, uuid, wipLevel } from './admin.shared.js';

export const router = Router();

// ---------------- WIP ----------------
router.post('/users/:userId/wip', async (req, res) => {
  const userId = uuid(req.params.userId, 'Kullanıcı');
  const level = wipLevel(req.body?.level);
  const days = positiveInt(req.body?.days, 'WIP süresi', 3650);
  await assertStaffTarget(req, userId);
  const wasGhost = await ghostNow(userId);
  const r = await query(
    `INSERT INTO user_wip(user_id, level, starts_at, expires_at, is_active)
     VALUES($1,$2,NOW(),NOW() + ($3::int * INTERVAL '1 day'),TRUE)
     ON CONFLICT (user_id) DO UPDATE SET level = EXCLUDED.level, starts_at = EXCLUDED.starts_at, expires_at = EXCLUDED.expires_at, is_active = TRUE
     RETURNING level, starts_at, expires_at`,
    [userId, level, days],
  );
  await query(
    `INSERT INTO financial_audit_logs(admin_id, user_id, action, reference_type, metadata) VALUES($1,$2,'admin_wip_grant','wip',$3)`,
    [req.user.id, userId, JSON.stringify({ level, days, by: req.user.system_role })],
  );
  await refreshGhost(userId, wasGhost);
  res.json({ wip: r.rows[0] });
  announceUserChange(userId);
});

router.delete('/users/:userId/wip', async (req, res) => {
  const userId = uuid(req.params.userId, 'Kullanıcı');
  await assertStaffTarget(req, userId);
  const wasGhost = await ghostNow(userId);
  await query(`UPDATE user_wip SET is_active = FALSE WHERE user_id = $1`, [userId]);
  await query(`INSERT INTO financial_audit_logs(admin_id, user_id, action, reference_type) VALUES($1,$2,'admin_wip_revoke','wip')`, [req.user.id, userId]);
  await refreshGhost(userId, wasGhost);
  res.json({ ok: true });
  announceUserChange(userId);
});

router.patch('/wip/tiers/:level', requireSuperAdmin, async (req, res) => {
  const level = wipLevel(Number(req.params.level));
  const name = req.body?.name !== undefined ? text(req.body.name, 'Ad', { min: 2, max: 60, required: true }) : null;
  const features = req.body?.features !== undefined ? cleanFeatures(req.body.features) : null;
  if (name === null && features === null) throw fail('Değiştirilecek alan yok.');
  const r = await query(
    `UPDATE wip_tiers SET name = COALESCE($2, name), features = features || COALESCE($3::jsonb, '{}'::jsonb) WHERE level = $1 RETURNING level, name, features`,
    [level, name, features ? JSON.stringify(features) : null],
  );
  res.json({ tier: r.rows[0] });
});

router.post('/wip/plans', requireSuperAdmin, async (req, res) => {
  const r = await query(
    `INSERT INTO wip_plans(name, level, duration_days, price_coins) VALUES($1,$2,$3,$4) RETURNING id, name, level, duration_days, price_coins`,
    [text(req.body?.name, 'Ad', { min: 2, max: 100, required: true }), wipLevel(req.body?.level),
      positiveInt(req.body?.durationDays, 'Süre', 3650), bigAmount(req.body?.priceCoins, 'Fiyat').toString()],
  );
  res.status(201).json({ plan: r.rows[0] });
});

// ---------------- Envanter ----------------
