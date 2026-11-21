// Gözlemlenebilirlik uçları: ölçümler ve alarmlar.
//
// Panelde zaten canlı sistem ekranı (CPU, bellek, havuz) vardı; eksik olan UÇ BAZINDA
// gecikme/hata ve ALARM listesiydi. Bunlar ayrı bir router'da tutuluyor çünkü admin.routes.js
// zaten büyük ve bu konu kendi başına bir modül.
import { Router } from 'express';
import { requireSuperAdmin } from '../../middleware/authentication/auth.js';
import { snapshot } from '../../infrastructure/observability/metrics.js';
import { poolStats } from '../../infrastructure/database/database.js';
import { ackAlert, listAlerts, runAlertChecks } from '../system/alerts.service.js';
import { fail } from '../../shared/errors/http.js';

// requireAuth ve requireStaff admin.routes.js'te bir kez uygulanıyor; burada yalnızca
// "süper admin" daraltması var. Ölçümler ve alarmlar yardımcı admine kapalı.
export const router = Router();

router.get('/metrics', requireSuperAdmin, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 40, 1), 200);
  const sortBy = ['p95', 'count', 'errors'].includes(req.query.sortBy) ? req.query.sortBy : 'p95';
  res.json({ ...snapshot({ limit, sortBy }), pool: poolStats() });
});

router.get('/alerts', requireSuperAdmin, async (req, res) => {
  const includeResolved = req.query.all === '1';
  res.json({ alerts: await listAlerts({ includeResolved, limit: Number(req.query.limit) || 50 }) });
});

// Elle çalıştırma: bir şeyi düzelttikten sonra alarmın kapandığını beklemeden görmek için.
router.post('/alerts/check', requireSuperAdmin, async (_req, res) => {
  res.json(await runAlertChecks());
});

// "Gördüm" işareti. Alarmı KAPATMAZ (durum düzelince kendi kapanır); yalnızca kimin
// haberdar olduğunu kaydeder, böylece iki kişi aynı sorunun peşine düşmez.
router.post('/alerts/:id/ack', requireSuperAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw fail('Geçersiz alarm.', 400);
  if (!await ackAlert(id, req.user.id)) throw fail('Alarm bulunamadı.', 404);
  res.json({ ok: true });
});
