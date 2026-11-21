import { Router } from 'express';
import { optionalAuth } from '../../middleware/authentication/auth.js';
import { fail } from '../../shared/errors/http.js';
import { layoutFor, adminLayout, saveLayout, setEnabled, history, rollback } from './sdui.service.js';
import { TAB_TARGETS, OPEN_SCREENS, ICONS, SECTION_TYPES } from './sdui.schema.js';

export const router = Router();

/// Uygulamanın okuduğu düzen. Kapalıysa `layout: null` döner ve uygulama kendi yerleşik
/// düzenini çizer — hata değil, normal durum.
///
/// Sürüm ETag olarak gönderilir: düzen değişmediyse gövde hiç inmez.
router.get('/sdui/:screen', optionalAuth, async (req, res, next) => {
  try {
    const screen = String(req.params.screen || '');
    if (!/^[a-z][a-z0-9_]{1,30}$/.test(screen)) throw fail('Ekran adı geçersiz.');
    const layout = await layoutFor(screen);
    if (!layout) {
      // Kapalıyken de kısa süre önbelleklenir: her açılışta sorulması bedava olsun.
      res.set('Cache-Control', 'public, max-age=60');
      return res.json({ layout: null });
    }
    const etag = `"${layout.version}"`;
    res.set({ ETag: etag, 'Cache-Control': 'public, max-age=60' });
    if (req.headers['if-none-match'] === etag) return res.status(304).end();
    res.json({ layout });
  } catch (e) { next(e); }
});

// --- Yönetim -------------------------------------------------------------------------------

export const adminRouter = Router();

/// Panelin düzenleyici için ihtiyaç duyduğu seçenekler. Koda gömülü listeyi panelde tekrar
/// yazmak yerine sunucudan okunur: iki liste birbirinden ayrı düşmez.
adminRouter.get('/sdui/options', (_req, res) => {
  res.json({ tabTargets: TAB_TARGETS, openScreens: OPEN_SCREENS, icons: ICONS, sectionTypes: SECTION_TYPES });
});

adminRouter.get('/sdui/:screen', async (req, res, next) => {
  try {
    const row = await adminLayout(String(req.params.screen));
    if (!row) throw fail('Ekran bulunamadı.', 404);
    res.json({ layout: row, history: await history(String(req.params.screen), 20) });
  } catch (e) { next(e); }
});

adminRouter.put('/sdui/:screen', async (req, res, next) => {
  try {
    const b = req.body ?? {};
    res.json({
      layout: await saveLayout(String(req.params.screen), b.payload ?? {}, {
        adminId: req.user?.id,
        enabled: b.enabled === undefined ? undefined : b.enabled === true,
        note: b.note,
      }),
    });
  } catch (e) { next(e); }
});

/// Açma/kapama — içeriğe dokunmaz. Sorun anında en hızlı düğme; düzeni düzeltmeye çalışmadan
/// önce kapatılır ve uygulama yerleşik düzenine döner.
adminRouter.post('/sdui/:screen/enabled', async (req, res, next) => {
  try {
    res.json({ layout: await setEnabled(String(req.params.screen), req.body?.enabled === true, req.user?.id) });
  } catch (e) { next(e); }
});

adminRouter.post('/sdui/:screen/rollback', async (req, res, next) => {
  try {
    const id = Number.parseInt(req.body?.historyId, 10);
    if (!Number.isInteger(id)) throw fail('Sürüm numarası gerekli.');
    res.json({ layout: await rollback(String(req.params.screen), id, req.user?.id) });
  } catch (e) { next(e); }
});
