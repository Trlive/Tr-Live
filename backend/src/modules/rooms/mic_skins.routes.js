import { Router } from 'express';
import { query, tx } from '../../infrastructure/database/database.js';
import { requireAuth, requireSuperAdmin } from '../../middleware/authentication/auth.js';
import { userLimit } from '../../middleware/security/firewall.js';
import { fail, uuid, positiveInt, text } from '../../shared/errors/http.js';
import { idempotent } from '../../middleware/validation/idempotency.js';
import { skinView, skinUntil, buySkin, giftSkin } from './mic_skins.service.js';

export const router = Router();
router.use(requireAuth);

// Tasarım listesi + kullanıcının hakkının bitiş zamanı.
router.get('/', async (req, res) => {
  const skins = (await query(`SELECT * FROM mic_skins WHERE is_active = TRUE ORDER BY sort_order, key`)).rows;
  const out = [];
  for (const s of skins) out.push(skinView(s, await skinUntil(req.user.id, s.key)));
  res.json({ skins: out });
});

// Coin ile satın al (varsa süre uzar).
router.post('/:key/buy', userLimit('mic_skin_buy', 20, 3600e3), idempotent('mic_skin_buy'), async (req, res) => {
  const key = text(req.params.key, 'Tasarım', { required: true, max: 20 });
  const r = await tx((c) => buySkin(c, { userId: req.user.id, key }));
  res.json({ ok: true, ...r });
});

// Yönetim hediyesi (yalnızca yönetici): kullanıcıya tasarım hakkı verir.
export const adminRouter = Router();
adminRouter.use(requireAuth, requireSuperAdmin);
adminRouter.post('/gift', async (req, res) => {
  const userId = uuid(req.body?.userId, 'Kullanıcı');
  const key = text(req.body?.key, 'Tasarım', { required: true, max: 20 });
  const days = req.body?.days === undefined ? undefined : positiveInt(req.body.days, 'Gün', 365);
  if (userId === undefined) throw fail('Kullanıcı gerekli.');
  const r = await tx((c) => giftSkin(c, { adminId: req.user.id, userId, key, days }));
  res.json({ ok: true, ...r });
});
