import { fail } from '../http.js';

// Toptan bakiye paketleri (sunucuda sabit; istemci coin miktarını kendi belirleyemez — paket koduyla seçer).
// priceTry / listTry yalnızca GÖSTERİM amaçlıdır (bayinin platform DIŞINDA ödeyeceği toptan bedel ile perakende karşılığı);
// uygulama içinde HİÇBİR tahsilat yapılmaz. Yönetici, bedelin tahsil edildiğini teyit edince talebi onaylar.
export const DEALER_TOPUP_PACKAGES = [
  { code: 'D_100K', coins: 100_000n, priceTry: 850, listTry: 1000, label: '100.000 Coin' },
  { code: 'D_500K', coins: 500_000n, priceTry: 4000, listTry: 5000, label: '500.000 Coin' },
  { code: 'D_1M', coins: 1_000_000n, priceTry: 7500, listTry: 10000, label: '1.000.000 Coin' },
  { code: 'D_5M', coins: 5_000_000n, priceTry: 35000, listTry: 50000, label: '5.000.000 Coin' },
];

// İndirim yüzdesi yalnızca gösterim içindir (listeye göre avantaj).
export const packageView = (p) => ({
  code: p.code,
  coins: p.coins.toString(),
  label: p.label,
  priceTry: p.priceTry,
  listTry: p.listTry,
  discountPct: p.listTry > 0 ? Math.round((1 - p.priceTry / p.listTry) * 100) : 0,
});

export const packagesView = () => DEALER_TOPUP_PACKAGES.map(packageView);

/** Paket kodunu doğrular ve paketi döndürür. Saf mantık (test edilebilir). */
export function requirePackage(code) {
  const pkg = DEALER_TOPUP_PACKAGES.find((p) => p.code === code);
  if (!pkg) throw fail('Geçersiz paket.');
  return pkg;
}

/** Durum geçişi doğrulaması (saf mantık, test edilebilir): yalnızca 'pending' talep incelenebilir. */
export function assertReviewable(status) {
  if (status === 'approved' || status === 'rejected') throw fail('Bu talep zaten sonuçlandırılmış.', 409);
  if (status !== 'pending') throw fail('Talep durumu geçersiz.', 409);
}

const row = (r) => ({
  id: r.id,
  requestedCoins: String(r.requested_coins),
  packageCode: r.package_code,
  referenceNote: r.reference_note,
  status: r.status,
  reviewNote: r.review_note,
  reviewedAt: r.reviewed_at,
  createdAt: r.created_at,
  ...(r.dealer_name !== undefined ? { dealerName: r.dealer_name } : {}),
  ...(r.username !== undefined ? { username: r.username } : {}),
});
export const requestView = row;

/**
 * Bayi bakiye talebi oluşturur. Çağıran aktif bir dealer_accounts sahibi olmalı (route'ta doğrulanır).
 * coins paketten türetilir; istemci serbest miktar gönderemez.
 */
export async function createTopupRequest(c, { dealerUserId, dealerId, packageCode, referenceNote }) {
  const pkg = requirePackage(packageCode);
  const r = await c.query(
    `INSERT INTO dealer_topup_requests(dealer_user_id, dealer_id, requested_coins, package_code, reference_note)
     VALUES($1,$2,$3,$4,$5) RETURNING *`,
    [dealerUserId, dealerId, pkg.coins.toString(), pkg.code, referenceNote || null],
  );
  return row(r.rows[0]);
}

/**
 * Yönetici talebi onaylar: talebi FOR UPDATE ile kilitler, 'pending' olduğunu doğrular, bayi hesabının bakiyesine
 * talep edilen miktarı ekler, dealer_transactions + financial_audit_logs kaydı oluşturur ve talebi 'approved' yapar.
 * Atomiktir (çağıran tx içinde olmalı).
 */
export async function approveTopupRequest(c, { requestId, adminId, reviewNote }) {
  const req = (await c.query(`SELECT * FROM dealer_topup_requests WHERE id = $1 FOR UPDATE`, [requestId])).rows[0];
  if (!req) throw fail('Talep bulunamadı.', 404);
  assertReviewable(req.status);

  // Bakiyesi artırılacak bayi hesabı: talepteki dealer_id, yoksa bayinin güncel aktif hesabı.
  const dealer = (await c.query(
    `SELECT * FROM dealer_accounts WHERE ${req.dealer_id ? 'id = $1' : 'owner_user_id = $1 AND is_active = TRUE'} FOR UPDATE`,
    [req.dealer_id || req.dealer_user_id],
  )).rows[0];
  if (!dealer) throw fail('Bayi hesabı bulunamadı.', 404);
  if (!dealer.is_active) throw fail('Bayi hesabı aktif değil.', 409);

  const coins = BigInt(req.requested_coins);
  const before = BigInt(dealer.coin_balance);
  const after = before + coins;
  await c.query(`UPDATE dealer_accounts SET coin_balance = $1 WHERE id = $2`, [after.toString(), dealer.id]);
  await c.query(
    `INSERT INTO dealer_transactions(dealer_id, admin_id, type, coin_amount, description)
     VALUES($1,$2,'admin_topup',$3,$4)`,
    [dealer.id, adminId, coins.toString(), `Bayi bakiye yüklemesi (paket ${req.package_code})`],
  );
  await c.query(
    `INSERT INTO financial_audit_logs(admin_id, action, reference_type, reference_id, amount_coins, balance_before, balance_after, metadata)
     VALUES($1,'dealer_topup_approve','dealer_topup_request',$2,$3,$4,$5,$6)`,
    [adminId, req.id, coins.toString(), before.toString(), after.toString(),
      JSON.stringify({ dealerId: dealer.id, dealerUserId: req.dealer_user_id, packageCode: req.package_code })],
  );
  const updated = (await c.query(
    `UPDATE dealer_topup_requests SET status = 'approved', reviewed_by = $2, reviewed_at = NOW(), review_note = $3
     WHERE id = $1 RETURNING *`,
    [req.id, adminId, reviewNote || null],
  )).rows[0];
  return { request: row(updated), dealerBalance: after.toString() };
}

/** Yönetici talebi reddeder (bakiye değişmez). */
export async function rejectTopupRequest(c, { requestId, adminId, reviewNote }) {
  const req = (await c.query(`SELECT status FROM dealer_topup_requests WHERE id = $1 FOR UPDATE`, [requestId])).rows[0];
  if (!req) throw fail('Talep bulunamadı.', 404);
  assertReviewable(req.status);
  const updated = (await c.query(
    `UPDATE dealer_topup_requests SET status = 'rejected', reviewed_by = $2, reviewed_at = NOW(), review_note = $3
     WHERE id = $1 RETURNING *`,
    [requestId, adminId, reviewNote || null],
  )).rows[0];
  await c.query(
    `INSERT INTO financial_audit_logs(admin_id, action, reference_type, reference_id, metadata)
     VALUES($1,'dealer_topup_reject','dealer_topup_request',$2,$3)`,
    [adminId, requestId, JSON.stringify({ dealerUserId: updated.dealer_user_id, packageCode: updated.package_code })],
  );
  return { request: row(updated) };
}
