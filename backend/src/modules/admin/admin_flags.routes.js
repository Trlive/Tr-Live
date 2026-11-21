import { Router } from 'express';
import { fail } from '../../shared/errors/http.js';
import { allFlags, upsertFlag, flagAudit, evaluate, bucketOf } from '../system/feature_flags.service.js';
import { query } from '../../infrastructure/database/database.js';
import { offloadStatus, runOffload, dropDbCopies } from '../media/offload.service.js';

/// Özellik bayraklarının yönetimi.
///
/// Bu ekran, canlıda ilerleme kararımızın güvenlik valfi: riskli bir özellik %1'e açılır,
/// sorun çıkarsa saniyeler içinde sıfıra indirilir. Her değişiklik kim/ne zaman/hangi orandan
/// hangi orana olarak kaydedilir.
export const router = Router();

router.get('/flags', async (_req, res) => {
  res.json({ flags: await allFlags(true) });
});

router.put('/flags/:key', async (req, res, next) => {
  try {
    const b = req.body || {};
    const patch = {};
    for (const k of ['description', 'min_app_version']) if (b[k] !== undefined) patch[k] = String(b[k]).slice(0, 300);
    if (b.enabled !== undefined) patch.enabled = b.enabled === true;
    if (b.rolloutPercent !== undefined) patch.rollout_percent = Number.parseInt(b.rolloutPercent, 10);
    if (b.allowUserIds !== undefined) patch.allow_user_ids = Array.isArray(b.allowUserIds) ? b.allowUserIds : [];
    if (b.denyUserIds !== undefined) patch.deny_user_ids = Array.isArray(b.denyUserIds) ? b.denyUserIds : [];
    if (b.platforms !== undefined) patch.platforms = Array.isArray(b.platforms) ? b.platforms : [];
    res.json({ flag: await upsertFlag(req.params.key, patch, req.user?.id) });
  } catch (e) { next(e); }
});

router.get('/flags/audit', async (req, res) => {
  res.json({ items: await flagAudit(req.query.key ? String(req.query.key) : null, 100) });
});

/// "Bu kullanıcıda açık mı?" sorusunun cevabı.
///
/// Kademeli açmada en sık sorulan soru bu: şikâyet eden kullanıcı özelliği görüyor mu, görmüyorsa
/// neden. Kovasını da gösterir, çünkü "%10'a çıkardım ama hâlâ görmüyor" durumunda cevap kovadadır.
router.get('/flags/:key/check', async (req, res, next) => {
  try {
    const flags = await allFlags(true);
    const flag = flags.find((f) => f.key === req.params.key);
    if (!flag) throw fail('Bayrak bulunamadı.', 404);
    const uid = String(req.query.userId || '');
    if (!/^[0-9a-f-]{36}$/i.test(uid)) throw fail('Kullanıcı kimliği gerekli.');
    const u = (await query(`SELECT id, display_name FROM users WHERE id = $1`, [uid])).rows[0];
    if (!u) throw fail('Kullanıcı bulunamadı.', 404);
    res.json({
      user: { id: u.id, displayName: u.display_name },
      on: evaluate(flag, { userId: uid, appVersion: String(req.query.appVersion || '999.0.0'), platform: String(req.query.platform || 'android') }),
      bucket: bucketOf(uid, flag.key),
      rolloutPercent: flag.rollout_percent,
      inAllowList: (flag.allow_user_ids || []).includes(uid),
      inDenyList: (flag.deny_user_ids || []).includes(uid),
    });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// Medya deposu (R2) — taşıma durumu ve elle tetikleme.
// Bayraklarla aynı dosyada: ikisi de "altyapıyı kademeli devreye alma" işi.
// ---------------------------------------------------------------------------

router.get('/storage/status', async (_req, res, next) => {
  try { res.json(await offloadStatus()); } catch (e) { next(e); }
});

router.post('/storage/offload', async (req, res, next) => {
  try { res.json(await runOffload({ limit: Number.parseInt(req.body?.limit, 10) || 25 })); } catch (e) { next(e); }
});

/// Veritabanı kopyasını siler. Taşımadan AYRI bir adım: R2'de bir sorun çıkarsa
/// `storage_key` temizlenip eski davranışa dönülebilsin diye bir süre iki kopya birden durur.
router.post('/storage/drop-db-copies', async (req, res, next) => {
  try {
    res.json(await dropDbCopies({
      olderThanDays: Number.parseInt(req.body?.olderThanDays, 10) || 7,
      limit: Number.parseInt(req.body?.limit, 10) || 500,
    }));
  } catch (e) { next(e); }
});
