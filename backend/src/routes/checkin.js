import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { userLimit } from '../firewall.js';
import { checkinState, claimCheckin } from '../services/checkin.js';

// Günlük giriş: GET durum (7 gün, kaçı yapıldı, bugün yapıldı mı), POST bugünün ödülünü al.
export const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  res.json(await checkinState(req.user.id));
});

router.post('/', userLimit('daily_checkin', 20, 3600e3), async (req, res) => {
  const r = await claimCheckin(req.user.id);
  res.json({ ok: true, ...r, state: await checkinState(req.user.id) });
});
