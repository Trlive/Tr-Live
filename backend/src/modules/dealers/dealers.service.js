import { fail } from '../../shared/errors/http.js';
import { addFamilyContrib } from '../families/family.service.js';

// Bayi bakiyesinden kullanıcıya Coin satışı. Çağıran, bir transaction (client "c") içinde olmalıdır.
export async function dealerSell(c, { dealerId, userId, coins, actorId, description, delayMinutes = 0 }) {
  const dealer = (await c.query(`SELECT * FROM dealer_accounts WHERE id = $1 AND is_active = TRUE FOR UPDATE`, [dealerId])).rows[0];
  if (!dealer) throw fail('Bayi bulunamadı.', 404);
  const user = (await c.query(`SELECT coins FROM users WHERE id = $1 AND account_status = 'active' FOR UPDATE`, [userId])).rows[0];
  if (!user) throw fail('Kullanıcı bulunamadı.', 404);
  const balance = BigInt(dealer.coin_balance);
  if (balance < coins) throw fail('Bayinin Coin bakiyesi yetersiz.');
  if (delayMinutes > 0) {
    // Gecikmeli teslim: Coin bayiden şimdi düşer, kullanıcıya teslim zamanında (deliverScheduled) geçer.
    await c.query(`UPDATE dealer_accounts SET coin_balance = coin_balance - $1 WHERE id = $2`, [coins.toString(), dealer.id]);
    const t = (await c.query(
      `INSERT INTO dealer_transactions(dealer_id, admin_id, user_id, type, coin_amount, description, status, deliver_at)
       VALUES($1,$2,$3,'sale',$4,$5,'scheduled', NOW() + ($6::int * INTERVAL '1 minute')) RETURNING id, deliver_at`,
      [dealer.id, actorId, userId, coins.toString(), description || 'Bayi kullanıcı Coin satışı', delayMinutes],
    )).rows[0];
    return { dealerBalance: (balance - coins).toString(), userBalance: String(user.coins), scheduled: true, deliverAt: t.deliver_at, transactionId: t.id };
  }
  const before = BigInt(user.coins);
  const after = before + coins;
  await c.query(`UPDATE dealer_accounts SET coin_balance = coin_balance - $1 WHERE id = $2`, [coins.toString(), dealer.id]);
  await c.query(`UPDATE users SET coins = $1, updated_at = NOW() WHERE id = $2`, [after.toString(), userId]);
  await c.query(
    `INSERT INTO dealer_transactions(dealer_id, admin_id, user_id, type, coin_amount, description) VALUES($1,$2,$3,'sale',$4,$5)`,
    [dealer.id, actorId, userId, coins.toString(), description || 'Bayi kullanıcı Coin satışı'],
  );
  await c.query(
    `INSERT INTO wallet_transactions(user_id, transaction_type, coin_amount, reference_id, description) VALUES($1,'dealer_credit',$2,$3,$4)`,
    [userId, coins.toString(), dealer.id, `Bayi Coin yüklemesi (${dealer.name})`],
  );
  await c.query(
    `INSERT INTO financial_audit_logs(admin_id, user_id, action, reference_type, reference_id, amount_coins, balance_before, balance_after, metadata)
     VALUES($1,$2,'dealer_sale','dealer',$3,$4,$5,$6,$7)`,
    [actorId, userId, dealer.id, coins.toString(), before.toString(), after.toString(), JSON.stringify({ dealerName: dealer.name })],
  );
  // Aile katkısı: yükleme 1 Coin = 1.
  await addFamilyContrib((t, p) => c.query(t, p), userId, coins);
  return { dealerBalance: (balance - coins).toString(), userBalance: after.toString() };
}

/** Zamanı gelen gecikmeli satışları kullanıcıya teslim eder (tek işlem, satır kilitli; iki kez teslim edilmez).
 *  Teslim edilenleri döndürür: [{ userId, coins, dealerName, userBalance }]. Kullanıcı kapatıldıysa Coin bayiye iade edilir. */
export async function deliverScheduled(c, limit = 50) {
  const due = (await c.query(
    `SELECT t.*, d.name AS dealer_name FROM dealer_transactions t JOIN dealer_accounts d ON d.id = t.dealer_id
     WHERE t.status = 'scheduled' AND t.deliver_at <= NOW() ORDER BY t.deliver_at LIMIT $1 FOR UPDATE OF t SKIP LOCKED`,
    [limit],
  )).rows;
  const out = [];
  for (const t of due) {
    const coins = BigInt(t.coin_amount);
    const user = (await c.query(`SELECT coins FROM users WHERE id = $1 AND account_status = 'active' FOR UPDATE`, [t.user_id])).rows[0];
    if (!user) {
      await c.query(`UPDATE dealer_accounts SET coin_balance = coin_balance + $1 WHERE id = $2`, [coins.toString(), t.dealer_id]);
      await c.query(`UPDATE dealer_transactions SET status = 'refunded' WHERE id = $1`, [t.id]);
      continue;
    }
    const before = BigInt(user.coins);
    const after = before + coins;
    await c.query(`UPDATE users SET coins = $1, updated_at = NOW() WHERE id = $2`, [after.toString(), t.user_id]);
    await c.query(`UPDATE dealer_transactions SET status = 'done' WHERE id = $1`, [t.id]);
    await c.query(
      `INSERT INTO wallet_transactions(user_id, transaction_type, coin_amount, reference_id, description) VALUES($1,'dealer_credit',$2,$3,$4)`,
      [t.user_id, coins.toString(), t.dealer_id, `Bayi Coin yüklemesi (${t.dealer_name})`],
    );
    await c.query(
      `INSERT INTO financial_audit_logs(admin_id, user_id, action, reference_type, reference_id, amount_coins, balance_before, balance_after, metadata)
       VALUES($1,$2,'dealer_sale','dealer',$3,$4,$5,$6,$7)`,
      [t.admin_id, t.user_id, t.dealer_id, coins.toString(), before.toString(), after.toString(), JSON.stringify({ dealerName: t.dealer_name, scheduled: true })],
    );
    await addFamilyContrib((q, p) => c.query(q, p), t.user_id, coins);
    out.push({ userId: t.user_id, coins: coins.toString(), dealerName: t.dealer_name, userBalance: after.toString() });
  }
  return out;
}
