import { query } from '../database.js';
import { fail } from '../http.js';

export const skinView = (s, until = null) => ({
  key: s.key,
  label: s.label,
  seatCount: s.seat_count,
  priceCoins: String(s.price_coins),
  durationDays: s.duration_days,
  ownedUntil: until,
});

/** Kullanıcının bu tasarım için süresi dolmamış hakkı varsa bitiş zamanı, yoksa null. */
export async function skinUntil(userId, key, q = query) {
  const r = await q(
    `SELECT MAX(expires_at) AS until FROM inventory_items
      WHERE user_id = $1 AND item_type = 'mic_skin' AND item_key = $2 AND is_active = TRUE AND expires_at > NOW()`,
    [userId, key],
  );
  return r.rows[0]?.until ?? null;
}

/** Hakkı verir ya da süreyi uzatır. Çağıran bir transaction (client "c") içinde olmalıdır. */
export async function addSkinTime(c, userId, skin, days, meta) {
  const cur = (await c.query(
    `SELECT id FROM inventory_items WHERE user_id = $1 AND item_type = 'mic_skin' AND item_key = $2 AND is_active = TRUE AND expires_at > NOW() LIMIT 1`,
    [userId, skin.key],
  )).rows[0];
  if (cur) {
    await c.query(`UPDATE inventory_items SET expires_at = expires_at + ($2::int * INTERVAL '1 day') WHERE id = $1`, [cur.id, days]);
  } else {
    await c.query(
      `INSERT INTO inventory_items(user_id, item_type, item_key, item_name, expires_at, metadata)
       VALUES($1,'mic_skin',$2,$3, NOW() + ($4::int * INTERVAL '1 day'), $5)`,
      [userId, skin.key, skin.label, days, JSON.stringify(meta ?? {})],
    );
  }
}

/** Coin ile satın alma (atomik: bakiye FOR UPDATE ile kilitlenir; cüzdan ve denetim kaydı yazılır). */
export async function buySkin(c, { userId, key }) {
  const skin = (await c.query(`SELECT * FROM mic_skins WHERE key = $1 AND is_active = TRUE`, [key])).rows[0];
  if (!skin) throw fail('Tasarım bulunamadı.', 404);
  const user = (await c.query(`SELECT coins FROM users WHERE id = $1 FOR UPDATE`, [userId])).rows[0];
  if (!user) throw fail('Kullanıcı bulunamadı.', 404);
  const price = BigInt(skin.price_coins);
  const before = BigInt(user.coins);
  if (before < price) throw fail('Yetersiz Coin.');
  const after = before - price;
  await c.query(`UPDATE users SET coins = $1, updated_at = NOW() WHERE id = $2`, [after.toString(), userId]);
  await addSkinTime(c, userId, skin, skin.duration_days, { source: 'purchase' });
  await c.query(
    `INSERT INTO wallet_transactions(user_id, transaction_type, coin_amount, reference_id, description) VALUES($1,'mic_skin_purchase',$2,$3,$4)`,
    [userId, (-price).toString(), skin.key, `Mikrofon modu: ${skin.label}`],
  );
  await c.query(
    `INSERT INTO financial_audit_logs(user_id, action, reference_type, reference_id, amount_coins, balance_before, balance_after, metadata)
     VALUES($1,'mic_skin_purchase','mic_skin',$2,$3,$4,$5,$6)`,
    [userId, skin.key, (-price).toString(), before.toString(), after.toString(), JSON.stringify({ days: skin.duration_days })],
  );
  return { balance: after.toString(), skin: skinView(skin, await skinUntil(userId, key, (t, p) => c.query(t, p))) };
}

/** Yönetim hediyesi (ücretsiz). */
export async function giftSkin(c, { adminId, userId, key, days }) {
  const skin = (await c.query(`SELECT * FROM mic_skins WHERE key = $1`, [key])).rows[0];
  if (!skin) throw fail('Tasarım bulunamadı.', 404);
  const u = (await c.query(`SELECT account_status FROM users WHERE id = $1`, [userId])).rows[0];
  if (!u || u.account_status !== 'active') throw fail('Kullanıcı bulunamadı.', 404);
  const d = days ?? skin.duration_days;
  await addSkinTime(c, userId, skin, d, { source: 'admin_gift', by: adminId });
  await c.query(
    `INSERT INTO financial_audit_logs(admin_id, user_id, action, reference_type, reference_id, metadata) VALUES($1,$2,'mic_skin_gift','mic_skin',$3,$4)`,
    [adminId, userId, skin.key, JSON.stringify({ days: d })],
  );
  return { skin: skinView(skin, await skinUntil(userId, key, (t, p) => c.query(t, p))) };
}

/** Süresi biten tasarımı olan odalar normal moda döner (koltuk sayısı korunur). */
export async function expireSkins() {
  const r = await query(
    `UPDATE rooms r SET mic_skin = NULL, mic_skin_text = NULL
      WHERE r.mic_skin IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM inventory_items i WHERE i.user_id = r.owner_id AND i.item_type = 'mic_skin'
                          AND i.item_key = r.mic_skin AND i.is_active = TRUE AND i.expires_at > NOW())`,
  );
  return r.rowCount;
}

export function startSkinSweeper() {
  const run = () => expireSkins().catch((e) => console.error('Mikrofon tasarımı süre temizliği başarısız:', e.message));
  run();
  const t = setInterval(run, 60e3);
  t.unref?.();
  return t;
}
