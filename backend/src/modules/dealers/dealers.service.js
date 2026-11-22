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

// ---------------------------------------------------------------------------
// Ana bayi / Alt bayi
// ---------------------------------------------------------------------------

/**
 * Ana bayiden alt bayiye Coin aktarır. Çağıran bir transaction ("c") içinde olmalıdır.
 *
 * Coin YARATILMAZ: ana bayiden düşer, alt bayiye eklenir. Toplam değişmez. İki tarafın
 * defterine de yazılır (`sub_transfer_out` / `sub_transfer_in`) — mutabakat iki yönden de
 * tutsun diye. Tek yöne yazsaydık alt bayinin bakiyesi "nereden geldi" sorusuna yanıtsız
 * kalırdı.
 *
 * Satırlar KİLİTLENİR ve her zaman AYNI SIRADA (önce ana, sonra alt) kilitlenir: iki aktarım
 * aynı anda ters yönde gelse bile kilit sırası aynı olduğu için karşılıklı kilitlenme
 * (deadlock) oluşmaz.
 */
export async function transferToSub(c, { parentId, subId, coins, actorId, description }) {
  if (parentId === subId) throw fail('Bayi kendine aktarım yapamaz.');
  if (!(coins > 0n)) throw fail('Aktarılacak Coin 0 olamaz.');

  const parent = (await c.query(
    `SELECT id, name, coin_balance, parent_dealer_id FROM dealer_accounts WHERE id = $1 AND is_active = TRUE FOR UPDATE`,
    [parentId],
  )).rows[0];
  if (!parent) throw fail('Ana bayi bulunamadı.', 404);
  if (parent.parent_dealer_id) throw fail('Alt bayi, kendi altına aktarım yapamaz.', 403);

  const sub = (await c.query(
    `SELECT id, name, coin_balance, parent_dealer_id, owner_user_id FROM dealer_accounts WHERE id = $1 AND is_active = TRUE FOR UPDATE`,
    [subId],
  )).rows[0];
  if (!sub) throw fail('Alt bayi bulunamadı.', 404);
  // Yetki burada: yalnızca KENDİ alt bayisine aktarabilir. Aksi halde bir ana bayi
  // başkasının alt bayisine Coin gönderip muhasebeyi karıştırabilirdi.
  if (sub.parent_dealer_id !== parent.id) throw fail('Bu bayi sizin alt bayiniz değil.', 403);

  const before = BigInt(parent.coin_balance);
  if (before < coins) throw fail('Bakiyeniz yetersiz.');

  await c.query(`UPDATE dealer_accounts SET coin_balance = coin_balance - $1 WHERE id = $2`, [coins.toString(), parent.id]);
  await c.query(`UPDATE dealer_accounts SET coin_balance = coin_balance + $1 WHERE id = $2`, [coins.toString(), sub.id]);
  const note = description || `Alt bayi aktarımı`;
  await c.query(
    `INSERT INTO dealer_transactions(dealer_id, admin_id, type, coin_amount, description)
     VALUES($1,$2,'sub_transfer_out',$3,$4)`,
    [parent.id, actorId, coins.toString(), `${note} → ${sub.name}`],
  );
  await c.query(
    `INSERT INTO dealer_transactions(dealer_id, admin_id, type, coin_amount, description)
     VALUES($1,$2,'sub_transfer_in',$3,$4)`,
    [sub.id, actorId, coins.toString(), `${note} ← ${parent.name}`],
  );
  await c.query(
    `INSERT INTO financial_audit_logs(admin_id, action, reference_type, reference_id, amount_coins, balance_before, balance_after, metadata)
     VALUES($1,'dealer_sub_transfer','dealer',$2,$3,$4,$5,$6)`,
    [actorId, parent.id, coins.toString(), before.toString(), (before - coins).toString(),
      JSON.stringify({ subId: sub.id, subName: sub.name })],
  );
  return {
    parentBalance: (before - coins).toString(),
    subBalance: (BigInt(sub.coin_balance) + coins).toString(),
    subOwnerId: sub.owner_user_id ?? null,
  };
}

/**
 * Bir bayiye ebeveyn atar ya da kaldırır (yalnızca yönetim).
 *
 * İki kat kuralı BURADA zorlanır:
 *  · Aday ebeveynin kendisinin ebeveyni olmamalı (aksi halde üç kat olurdu).
 *  · Ebeveyn atanacak bayinin kendi alt bayileri olmamalı (aynı sebep).
 * Bu iki koşul birlikte hem derinliği ikiyle sınırlar hem de döngüyü imkânsız kılar.
 */
export async function setDealerParent(c, { dealerId, parentId }) {
  const dealer = (await c.query(`SELECT id FROM dealer_accounts WHERE id = $1 FOR UPDATE`, [dealerId])).rows[0];
  if (!dealer) throw fail('Bayi bulunamadı.', 404);

  if (parentId === null) {
    await c.query(`UPDATE dealer_accounts SET parent_dealer_id = NULL WHERE id = $1`, [dealerId]);
    return { dealerId, parentId: null };
  }
  if (parentId === dealerId) throw fail('Bayi kendi ana bayisi olamaz.');

  const parent = (await c.query(`SELECT id, parent_dealer_id FROM dealer_accounts WHERE id = $1`, [parentId])).rows[0];
  if (!parent) throw fail('Ana bayi bulunamadı.', 404);
  if (parent.parent_dealer_id) throw fail('Alt bayi, başka bir bayiye ana bayi olamaz (en fazla iki kat).');

  const childCount = Number((await c.query(
    `SELECT COUNT(*)::int AS n FROM dealer_accounts WHERE parent_dealer_id = $1`, [dealerId],
  )).rows[0].n);
  if (childCount > 0) throw fail('Bu bayinin alt bayileri var; alt bayi yapılamaz (en fazla iki kat).');

  await c.query(`UPDATE dealer_accounts SET parent_dealer_id = $2 WHERE id = $1`, [dealerId, parentId]);
  return { dealerId, parentId };
}
