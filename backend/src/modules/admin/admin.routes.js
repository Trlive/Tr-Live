// Yönetici paneli API'si — modül girişi.
//
// Bu dosya 2.391 satırdı; konularına bölündü. Burada yalnızca ortak ara katmanlar (kimlik, personel
// yetkisi, denetim kaydı) ve alt router'ların bağlanması var. Her alt router aynı '/api/admin' yoluna
// bağlanır, yani API adresleri bölmeden önceki ile birebir aynıdır.
//
// Alt dosyalar: admin_agencies, admin_catalog, admin_coins, admin_dealers, admin_events, admin_finance, admin_moderation, admin_security, admin_support, admin_users, admin_wip
// Ortak yardımcılar: admin.shared.js
import { Router } from 'express';
import { SUPPORT_COIN_LIMIT, SUPPORT_COIN_LOADS_PER_HOUR, SUPPORT_LEVEL_LIMIT, config, fail, mountPanelRoutes, requireAuth, requireStaff, supportMayCall } from './admin.shared.js';
import { router as agenciesRouter } from './admin_agencies.routes.js';
import { router as catalogRouter } from './admin_catalog.routes.js';
import { router as coinsRouter } from './admin_coins.routes.js';
import { router as dealersRouter } from './admin_dealers.routes.js';
import { router as eventsRouter } from './admin_events.routes.js';
import { router as financeRouter } from './admin_finance.routes.js';
import { router as flagsRouter } from './admin_flags.routes.js';
import { adminRouter as sduiAdminRouter } from '../sdui/sdui.routes.js';
import { adminRouter as sduiV2AdminRouter } from '../sdui/v2/sdui_v2.routes.js';
import { router as moderationRouter } from './admin_moderation.routes.js';
import { router as observabilityRouter } from './admin_observability.routes.js';
import { router as securityRouter } from './admin_security.routes.js';
import { router as supportRouter } from './admin_support.routes.js';
import { router as usersRouter } from './admin_users.routes.js';
import { router as wipRouter } from './admin_wip.routes.js';

export const router = Router();

router.use(requireAuth, requireStaff);
// Yardımcı admin ('support') yalnızca dar yetkilere sahiptir (nick, profil fotoğrafı, ban). Diğer her şey yöneticiye aittir.

// Yardımcı admin ('support') yalnızca dar yetkilere sahiptir (nick, profil fotoğrafı, ban). Diğer her şey yöneticiye aittir.
router.use((req, res, next) => {
  if (req.user.system_role === 'admin') return next();
  if (supportMayCall(req.method, req.path)) return next();
  next(fail('Bu işlem yalnızca yöneticiye aittir.', 403));
});

router.get('/me/permissions', (req, res) => {
  const admin = req.user.system_role === 'admin';
  res.json({
    role: req.user.system_role, full: admin,
    can: admin ? ['all'] : ['search_users', 'ban', 'unban', 'change_display_name', 'change_avatar', 'chat_restriction',
      'load_coins', 'grant_level', 'grant_wip', 'grant_items'],
    limits: admin ? null : {
      coinsPerLoad: Number(SUPPORT_COIN_LIMIT), coinsPerDay: Number(config.supportCoinDailyLimit), loadsPerHour: SUPPORT_COIN_LOADS_PER_HOUR,
      maxLevel: SUPPORT_LEVEL_LIMIT,
    },
  });
});

// Web paneli: kullanıcı listesi / ayrıntısı, odalar, hareketler, istatistik (admin_panel.js).
mountPanelRoutes(router);

// Alt router'lar: hepsi aynı kök yola bağlı — yol ön eki EKLENMEZ, adresler değişmez.
router.use(agenciesRouter);
router.use(catalogRouter);
router.use(coinsRouter);
router.use(dealersRouter);
router.use(eventsRouter);
router.use(financeRouter);
router.use(flagsRouter);
router.use(sduiAdminRouter);
router.use(sduiV2AdminRouter);
router.use(moderationRouter);
router.use(observabilityRouter);
router.use(securityRouter);
router.use(supportRouter);
router.use(usersRouter);
router.use(wipRouter);
