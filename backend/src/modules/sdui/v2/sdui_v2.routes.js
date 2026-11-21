// SDUI v2 uçları.
//
// Uygulama ucu (`/api/sdui/v2/:screenId`) oturum İSTEMEZ: yardım ve etkinlik gibi ekranlar
// girişten önce de açılabilmeli. Ama kademeli açılış kimlik ister; oturumsuz istekte ekran
// yalnızca %100'e açıldıysa döner (service bunu uyguluyor).
import { Router } from 'express';
import { optionalAuth, requireSuperAdmin } from '../../../middleware/authentication/auth.js';
import { fail } from '../../../shared/errors/http.js';
import {
  adminScreen, history, listScreens, previewDraft, publish, rollback, saveDraft, screenFor, setRollout,
} from './sdui_v2.service.js';
import { API_ACTIONS, COMPONENTS, ICONS, OPEN_SCREENS, SOURCES, TONES } from './sdui_v2.schema.js';

export const router = Router();

/// Uygulamanın ekranı aldığı uç.
///
/// Sürüm başlığı (`If-None-Match`) ile gelen istek değişmemişse 304 döner: ekran açılışında
/// her seferinde birkaç KB indirmek, yavaş bağlantıda açılışı geciktiren en sessiz sebeptir.
router.get('/sdui/v2/:screenId', optionalAuth, async (req, res) => {
  const screenId = String(req.params.screenId);
  if (!/^[a-z][a-z0-9_]{1,30}$/.test(screenId)) throw fail('Ekran adı geçersiz.', 400);
  const out = await screenFor(screenId, {
    userId: req.user?.id ?? null,
    appVersion: String(req.get('x-app-version') ?? req.query.appVersion ?? '0.0.0'),
    platform: String(req.get('x-platform') ?? '') || null,
  });
  // null = uygulama kendi yerleşik ekranını çizsin. Hata DEĞİL: yayın yok, sürüm yetmiyor
  // ya da kullanıcı kademeli açılış diliminde değil. Uygulama üçünü de aynı biçimde karşılar.
  if (!out) return res.json({ screenId, root: null });
  res.set('ETag', `"${out.revision}"`);
  if (req.get('if-none-match') === `"${out.revision}"`) return res.status(304).end();
  res.json(out);
});

// ---------------- Yönetim ----------------

export const adminRouter = Router();
adminRouter.use(requireSuperAdmin);

/// Bileşen kataloğu: panel düzenleyicisi hangi bileşenlerin ve alanların olduğunu buradan
/// öğrenir. Katalog iki yere yazılsaydı (panel + sunucu) biri eskir ve panel, sunucunun
/// kabul etmeyeceği düzenler kaydettirmeye çalışırdı.
adminRouter.get('/sdui2/catalog', async (_req, res) => {
  res.json({
    components: COMPONENTS,
    icons: ICONS,
    tones: TONES,
    openScreens: OPEN_SCREENS,
    sources: SOURCES,
    apiActions: Object.keys(API_ACTIONS),
  });
});

adminRouter.get('/sdui2/screens', async (_req, res) => {
  res.json({ screens: await listScreens() });
});

adminRouter.get('/sdui2/screens/:screenId', async (req, res) => {
  const out = await adminScreen(String(req.params.screenId));
  if (!out) throw fail('Ekran bulunamadı.', 404);
  res.json(out);
});

adminRouter.put('/sdui2/screens/:screenId/draft', async (req, res) => {
  res.json(await saveDraft(String(req.params.screenId), req.body?.layout ?? req.body, req.user.id));
});

/// Önizleme: taslağı, yayınlamadan, istenen uygulama sürümü gözüyle gösterir.
/// Sürüm parametresi önemli — "eski telefonda nasıl görünecek" sorusu ancak böyle yanıtlanır.
adminRouter.get('/sdui2/screens/:screenId/preview', async (req, res) => {
  res.json(await previewDraft(String(req.params.screenId), {
    appVersion: String(req.query.appVersion ?? '999.0.0'),
    userId: req.user.id,
    platform: String(req.query.platform ?? '') || null,
  }));
});

adminRouter.post('/sdui2/screens/:screenId/publish', async (req, res) => {
  res.json(await publish(String(req.params.screenId), {
    rollout: req.body?.rollout ?? 1,
    minApp: req.body?.minApp ?? null,
    note: req.body?.note ?? '',
  }, req.user.id));
});

adminRouter.post('/sdui2/screens/:screenId/rollout', async (req, res) => {
  res.json(await setRollout(String(req.params.screenId), req.body?.rollout, req.user.id));
});

adminRouter.get('/sdui2/screens/:screenId/history', async (req, res) => {
  res.json({ versions: await history(String(req.params.screenId), Number(req.query.limit) || 30) });
});

adminRouter.post('/sdui2/screens/:screenId/rollback', async (req, res) => {
  const id = Number(req.body?.versionId);
  if (!Number.isInteger(id) || id <= 0) throw fail('Sürüm kimliği geçersiz.', 400);
  res.json(await rollback(String(req.params.screenId), id, req.user.id));
});
