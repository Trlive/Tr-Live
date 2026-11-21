import { Router } from 'express';
import { requireAuth, requireSuperAdmin } from '../../middleware/authentication/auth.js';
import { fail, uuid, text } from '../../shared/errors/http.js';
import { userLimit } from '../../middleware/security/firewall.js';
import { idempotent } from '../../middleware/validation/idempotency.js';
import { notifyUser } from '../notifications/notify.service.js';
import {
  walletOf, requestWithdrawal, cancelWithdrawal, transferDealers, transferToDealer, centsOf, exchangeToCoins, beansText,
  payWithdrawal, rejectWithdrawal, adminAdjust, adminOverview,
} from './usd_wallet.service.js';

// Dolar cüzdanı (yayıncı / ajans sahibi): bakiye, admin'e gönderim (çekim talebi) ve Coin bayisine gönderim.
export const router = Router();
router.use(requireAuth);

router.get('/me', async (req, res) => { res.json(await walletOf(req.user.id)); });
router.get('/dealers', async (req, res) => { res.json({ dealers: await transferDealers(req.user.id) }); });

// Admin'e gönderim: { amountCents, method, account }. Ödeme bilgisi (IBAN / cüzdan adresi vb.) yalnızca admin'e görünür.
router.post('/withdrawals', userLimit('usd_withdraw', 20, 3600e3), idempotent('usd_withdraw'), async (req, res) => {
  const cents = centsOf(req.body?.amountCents);
  const method = text(req.body?.method, 'Ödeme yöntemi', { min: 2, max: 60, required: true });
  const account = text(req.body?.account, 'Ödeme bilgisi', { min: 4, max: 300, required: true });
  res.status(201).json({ withdrawal: await requestWithdrawal(req.user.id, { cents, method, account }), wallet: await walletOf(req.user.id) });
});
router.post('/withdrawals/:id/cancel', userLimit('usd_cancel', 20, 3600e3), async (req, res) => {
  res.json({ withdrawal: await cancelWithdrawal(req.user.id, uuid(req.params.id, 'Talep')), wallet: await walletOf(req.user.id) });
});

// Bayiye gönderim: { dealerId, amountCents }. Anında işlenir ve geri alınamaz.
router.post('/dealer-transfers', userLimit('usd_dealer', 20, 3600e3), idempotent('usd_dealer'), async (req, res) => {
  const out = await transferToDealer(req.user.id, { dealerId: uuid(req.body?.dealerId, 'Bayi'), cents: centsOf(req.body?.amountCents) });
  res.status(201).json({ transfer: out, wallet: await walletOf(req.user.id) });
});

// Fasulyeyi Coin'e çevirme: { amountCents, targetUserId? }. targetUserId yoksa Coin kendine, varsa o kullanıcıya yüklenir.
// Anında işlenir ve geri alınamaz.
router.post('/coin-exchanges', userLimit('usd_exchange', 30, 3600e3), idempotent('usd_exchange'), async (req, res) => {
  const target = req.body?.targetUserId;
  const targetUserId = target === undefined || target === null || target === '' ? null : uuid(target, 'Kullanıcı');
  const out = await exchangeToCoins(req.user.id, { cents: centsOf(req.body?.amountCents), targetUserId });
  if (!out.self) {
    notifyUser(out.target.id, 'coin_received', 'Coin geldi', `${out.sender.displayName || `@${out.sender.username}`} sana ${out.coins} Coin gönderdi.`, { coins: out.coins });
  }
  const { sender: _s, ...exchange } = out;
  res.status(201).json({ exchange, beans: beansText(out.amountCents), wallet: await walletOf(req.user.id) });
});

// ---------------- Yönetim (yalnızca tam yetkili admin) ----------------
export const adminRouter = Router();
adminRouter.use(requireAuth, requireSuperAdmin);

adminRouter.get('/', async (req, res) => { res.json(await adminOverview(String(req.query.status ?? 'pending'))); });
adminRouter.post('/withdrawals/:id/pay', idempotent('usd_admin_pay'), async (req, res) => {
  res.json({ withdrawal: await payWithdrawal(req.user.id, uuid(req.params.id, 'Talep'), text(req.body?.note, 'Not', { max: 300 }) || null) });
});
adminRouter.post('/withdrawals/:id/reject', idempotent('usd_admin_reject'), async (req, res) => {
  const note = text(req.body?.note, 'Ret nedeni', { min: 2, max: 300, required: true });
  res.json({ withdrawal: await rejectWithdrawal(req.user.id, uuid(req.params.id, 'Talep'), note) });
});
adminRouter.get('/users/:userId', async (req, res) => { res.json(await walletOf(uuid(req.params.userId, 'Kullanıcı'))); });
// Elle düzeltme: amountCents işaretli tam sayı (ör. -500 = 5 dolar düş). Not zorunludur.
adminRouter.post('/adjust', idempotent('usd_admin_adjust'), async (req, res) => {
  const raw = String(req.body?.amountCents ?? '').trim();
  if (!/^-?\d{1,12}$/.test(raw) || BigInt(raw) === 0n) throw fail('Tutar geçersiz.');
  const note = text(req.body?.note, 'Not', { min: 2, max: 300, required: true });
  res.json(await adminAdjust(req.user.id, { userId: uuid(req.body?.userId, 'Kullanıcı'), cents: BigInt(raw), note }));
});
