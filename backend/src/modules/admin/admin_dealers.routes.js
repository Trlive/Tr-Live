// Yönetici paneli — bayi işlemleri.
// Ortak yardımcılar ve import'lar: admin.shared.js
import { Router } from 'express';
import { approveTopupRequest, assertUser, auditStaff, bigAmount, dealerSell, fail, idempotent, oneOf, query, rejectTopupRequest, requireSuperAdmin, setDealerParent, text, topupRequestView, tx, uuid } from './admin.shared.js';

export const router = Router();

// ---------------- Bayi (yalnızca yönetici) ----------------
router.get('/dealers', requireSuperAdmin, async (req, res) => {
  const r = await query(
    `SELECT d.*, u.username AS owner_username, p.name AS parent_name
       FROM dealer_accounts d
       LEFT JOIN users u ON u.id = d.owner_user_id
       LEFT JOIN dealer_accounts p ON p.id = d.parent_dealer_id
      ORDER BY d.created_at DESC LIMIT 200`,
  );
  res.json({ dealers: r.rows.map((d) => ({
    id: d.id, name: d.name, ownerUserId: d.owner_user_id, ownerUsername: d.owner_username,
    coinBalance: String(d.coin_balance), commissionBps: d.commission_bps, isActive: d.is_active,
    // Ana bayi / alt bayi: parentDealerId doluysa bu bir ALT bayidir.
    parentDealerId: d.parent_dealer_id, parentName: d.parent_name,
    kind: d.parent_dealer_id ? 'sub' : 'main',
  })) });
});

/// Bir bayiyi alt bayi yapar ya da ana bayi konumuna döndürür.
///
/// `parentDealerId: null` → bağı kaldırır (bayi yeniden ana bayi olur).
/// En fazla iki kat kuralı setDealerParent içinde zorlanır.
router.post('/dealers/:dealerId/parent', requireSuperAdmin, async (req, res) => {
  const dealerId = uuid(req.params.dealerId, 'Bayi');
  const raw = req.body?.parentDealerId;
  const parentId = raw === null || raw === undefined || raw === '' ? null : uuid(raw, 'Ana bayi');
  const out = await tx((c) => setDealerParent(c, { dealerId, parentId }));
  await auditStaff({ query }, req.user.id, null, 'dealer_set_parent', { dealerId, parentId });
  res.json(out);
});

router.post('/dealers', requireSuperAdmin, async (req, res) => {
  const bps = req.body?.commissionBps === undefined ? 0 : Number(req.body.commissionBps);
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) throw fail('Komisyon 0-10000 (baz puan) arasında olmalı.');
  const ownerId = req.body?.ownerUserId ? uuid(req.body.ownerUserId, 'Sahip') : null;
  if (ownerId) await assertUser(ownerId);
  const r = await query(
    `INSERT INTO dealer_accounts(name, owner_user_id, commission_bps) VALUES($1,$2,$3) RETURNING id, name`,
    [text(req.body?.name, 'Bayi adı', { min: 2, max: 100, required: true }), ownerId, bps],
  );
  res.status(201).json({ dealer: r.rows[0] });
});

router.post('/dealers/:dealerId/coins', requireSuperAdmin, idempotent('dealer_credit'), async (req, res) => {
  const dealerId = uuid(req.params.dealerId, 'Bayi');
  const amount = bigAmount(req.body?.amount, 'Bayi Coin miktarı');
  const result = await tx(async (c) => {
    const dealer = (await c.query(`SELECT * FROM dealer_accounts WHERE id = $1 FOR UPDATE`, [dealerId])).rows[0];
    if (!dealer) throw fail('Bayi bulunamadı.', 404);
    const before = BigInt(dealer.coin_balance);
    const balance = before + amount;
    await c.query(`UPDATE dealer_accounts SET coin_balance = $1 WHERE id = $2`, [balance.toString(), dealer.id]);
    await c.query(
      `INSERT INTO dealer_transactions(dealer_id, admin_id, type, coin_amount, description) VALUES($1,$2,'credit',$3,$4)`,
      [dealer.id, req.user.id, amount.toString(), text(req.body?.description, 'Açıklama', { max: 200 }) || 'Admin bayi Coin yükleme'],
    );
    await c.query(
      `INSERT INTO financial_audit_logs(admin_id, action, reference_type, reference_id, amount_coins, balance_before, balance_after)
       VALUES($1,'dealer_credit','dealer',$2,$3,$4,$5)`,
      [req.user.id, dealer.id, amount.toString(), before.toString(), balance.toString()],
    );
    return { balance: balance.toString() };
  });
  res.json(result);
});

// Bayi adını değiştir / bayiyi durdur-aç (pasif bayi satış yapamaz, panelden giremez; bakiyesi korunur).

// Bayi adını değiştir / bayiyi durdur-aç (pasif bayi satış yapamaz, panelden giremez; bakiyesi korunur).
router.post('/dealers/:dealerId/update', requireSuperAdmin, async (req, res) => {
  const dealerId = uuid(req.params.dealerId, 'Bayi');
  const name = req.body?.name === undefined ? null : text(req.body.name, 'Bayi adı', { min: 2, max: 100, required: true });
  const active = typeof req.body?.isActive === 'boolean' ? req.body.isActive : null;
  const r = await query(
    `UPDATE dealer_accounts SET name = COALESCE($2, name), is_active = COALESCE($3, is_active) WHERE id = $1 RETURNING id, name, is_active`,
    [dealerId, name, active],
  );
  if (!r.rowCount) throw fail('Bayi bulunamadı.', 404);
  await auditStaff({ query }, req.user.id, null, 'dealer_update', { dealerId, name, isActive: active });
  res.json({ dealer: { id: r.rows[0].id, name: r.rows[0].name, isActive: r.rows[0].is_active } });
});

// Bayinin hareketleri (sayfalı).

// Bayinin hareketleri (sayfalı).
router.get('/dealers/:dealerId/transactions', requireSuperAdmin, async (req, res) => {
  const dealerId = uuid(req.params.dealerId, 'Bayi');
  const before = req.query.before ? new Date(String(req.query.before)) : null;
  if (before && Number.isNaN(before.getTime())) throw fail('Tarih geçersiz.');
  const r = await query(
    `SELECT t.id, t.type, t.coin_amount, t.description, t.created_at, u.username, a.username AS admin_username
       FROM dealer_transactions t LEFT JOIN users u ON u.id = t.user_id LEFT JOIN users a ON a.id = t.admin_id
      WHERE t.dealer_id = $1 AND ($2::timestamptz IS NULL OR t.created_at < $2) ORDER BY t.created_at DESC LIMIT 100`,
    [dealerId, before ? before.toISOString() : null],
  );
  res.json({ transactions: r.rows.map((t) => ({
    id: t.id, type: t.type, coinAmount: String(t.coin_amount), description: t.description, username: t.username,
    adminUsername: t.admin_username, createdAt: t.created_at,
  })) });
});

router.post('/dealers/:dealerId/sell', requireSuperAdmin, async (req, res) => {
  const result = await tx((c) => dealerSell(c, {
    dealerId: uuid(req.params.dealerId, 'Bayi'), userId: uuid(req.body?.userId, 'Kullanıcı'),
    coins: bigAmount(req.body?.amount, 'Satış Coin miktarı'), actorId: req.user.id, description: text(req.body?.description, 'Açıklama', { max: 200 }),
  }));
  res.json(result);
});

// ---------------- Bayi bakiye talepleri (yalnızca yönetici) ----------------
// Bekleyen (varsayılan) veya belirli durumdaki talepler. Onayda bayi bakiyesi artar; red bakiyeyi değiştirmez.

// ---------------- Bayi bakiye talepleri (yalnızca yönetici) ----------------
// Bekleyen (varsayılan) veya belirli durumdaki talepler. Onayda bayi bakiyesi artar; red bakiyeyi değiştirmez.
router.get('/topup-requests', requireSuperAdmin, async (req, res) => {
  const status = req.query.status ? oneOf(String(req.query.status), ['pending', 'approved', 'rejected'], 'Durum') : 'pending';
  const r = await query(
    `SELECT t.*, u.username, d.name AS dealer_name
       FROM dealer_topup_requests t
       LEFT JOIN users u ON u.id = t.dealer_user_id
       LEFT JOIN dealer_accounts d ON d.id = t.dealer_id
      WHERE t.status = $1 ORDER BY t.created_at ${status === 'pending' ? 'ASC' : 'DESC'} LIMIT 200`,
    [status],
  );
  res.json({ requests: r.rows.map(topupRequestView) });
});

// Talebi onayla (approve) veya reddet (reject).

// Talebi onayla (approve) veya reddet (reject).
router.post('/topup-requests/:id/review', requireSuperAdmin, idempotent('dealer_topup_review'), async (req, res) => {
  const id = uuid(req.params.id, 'Talep');
  const decision = oneOf(req.body?.decision, ['approve', 'reject'], 'Karar');
  const reviewNote = text(req.body?.reviewNote, 'İnceleme notu', { max: 500 });
  const result = await tx((c) => decision === 'approve'
    ? approveTopupRequest(c, { requestId: id, adminId: req.user.id, reviewNote })
    : rejectTopupRequest(c, { requestId: id, adminId: req.user.id, reviewNote }));
  res.json({ ok: true, decision, ...result });
});

// ---------------- Ajans ve yayıncı ----------------
