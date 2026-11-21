// Yönetici paneli — basım bütçesi ve mutabakat.
// Ortak yardımcılar ve import'lar: admin.shared.js
import { Router } from 'express';
import { bigAmount, budget, fail, listBudgets, periodKey, positiveInt, query, reconcileStatus, requireSuperAdmin, runReconciliation, text } from './admin.shared.js';

export const router = Router();

// ---------------- Basım bütçeleri (sıfırdan üretilen Coin) ----------------
router.get('/finance/budgets', requireSuperAdmin, async (req, res) => {
  const period = /^\d{4}-\d{2}$/.test(String(req.query.period ?? '')) ? String(req.query.period) : periodKey();
  res.json({ period, budgets: await listBudgets(period) });
});

router.put('/finance/budgets/:key', requireSuperAdmin, async (req, res) => {
  const key = text(req.params.key, 'Bütçe', { max: 40, required: true });
  const sets = [];
  const vals = [key];
  if (req.body?.monthlyLimit !== undefined) {
    const n = bigAmount(req.body.monthlyLimit, 'Aylık sınır');
    sets.push(`monthly_limit = $${vals.push(n.toString())}`);
  }
  if (req.body?.enabled !== undefined) sets.push(`enabled = $${vals.push(req.body.enabled === true)}`);
  if (req.body?.note !== undefined) sets.push(`note = $${vals.push(text(req.body.note, 'Not', { max: 400 }) ?? '')}`);
  if (!sets.length) throw fail('Değişecek alan yok.');
  const r = await query(`UPDATE coin_budgets SET ${sets.join(', ')}, updated_at = NOW() WHERE key = $1 RETURNING key`, vals);
  if (!r.rowCount) throw fail('Bütçe bulunamadı.', 404);
  await query(
    `INSERT INTO financial_audit_logs(admin_id, action, reference_type, reference_id, metadata) VALUES($1,'coin_budget','budget',$2,$3)`,
    [req.user.id, key, JSON.stringify(req.body ?? {})],
  ).catch(() => {});
  res.json({ ok: true });
});

// GET /finance/issuances KALDIRILDI (sahibin kararı): test, etkinlik, telafi ve pazarlama
// basımlarının listesi hiçbir yerde gösterilmiyor. Bütçe kartındaki aylık sayaç duruyor.

// ---------------- Mutabakat (bakiye ↔ işlem defteri) ----------------

// ---------------- Mutabakat (bakiye ↔ işlem defteri) ----------------
router.get('/finance/reconcile', requireSuperAdmin, async (_req, res) => {
  const st = await reconcileStatus();
  const runs = (await query(
    `SELECT id, started_at, finished_at, users_checked, users_new, mismatches, coin_diff, diamond_diff,
            total_coins, total_diamonds, manual, failed, note
       FROM wallet_recon_runs ORDER BY id DESC LIMIT 30`,
  )).rows;
  const items = (await query(
    `SELECT i.id, i.run_id, i.coin_diff, i.diamond_diff, i.actual_coins, i.actual_diamonds, i.resolved,
            i.resolve_note, i.resolved_at, i.created_at,
            u.id AS uid, u.public_id, u.display_name, u.username
       FROM wallet_recon_items i JOIN users u ON u.id = i.user_id
      ORDER BY i.resolved, i.id DESC LIMIT 200`,
  )).rows;
  res.json({
    ...st,
    runs: runs.map((r) => ({
      id: String(r.id), startedAt: r.started_at, finishedAt: r.finished_at, usersChecked: r.users_checked,
      usersNew: r.users_new, mismatches: r.mismatches, coinDiff: String(r.coin_diff), diamondDiff: String(r.diamond_diff),
      totalCoins: String(r.total_coins), totalDiamonds: String(r.total_diamonds), manual: r.manual, failed: r.failed, note: r.note,
    })),
    items: items.map((i) => ({
      id: String(i.id), runId: String(i.run_id), coinDiff: String(i.coin_diff), diamondDiff: String(i.diamond_diff),
      coins: String(i.actual_coins), diamonds: String(i.actual_diamonds), resolved: i.resolved,
      resolveNote: i.resolve_note, resolvedAt: i.resolved_at, createdAt: i.created_at,
      user: { id: i.uid, publicId: i.public_id, displayName: i.display_name, username: i.username },
    })),
  });
});

router.post('/finance/reconcile/run', requireSuperAdmin, async (req, res) => {
  res.json(await runReconciliation({ manual: true, startedBy: req.user.id }));
});

router.post('/finance/reconcile/items/:id/resolve', requireSuperAdmin, async (req, res) => {
  const id = positiveInt(req.params.id, 'Kayıt', 1e12);
  const note = text(req.body?.note, 'Not', { max: 400 }) || null;
  const r = await query(
    `UPDATE wallet_recon_items SET resolved = TRUE, resolved_by = $2, resolved_at = NOW(), resolve_note = $3
      WHERE id = $1 AND NOT resolved RETURNING id`, [id, req.user.id, note],
  );
  if (!r.rowCount) throw fail('Kayıt bulunamadı ya da zaten çözülmüş.', 404);
  res.json({ ok: true });
});

// ---------------- Müzik kütüphanesi (yalnızca yönetici) ----------------
// Telif: yalnızca kullanım hakkına sahip olduğunuz parçaları ekleyin; lisans notu zorunludur.
