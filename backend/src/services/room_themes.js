import fs from 'node:fs';
import { query } from '../database.js';
import { fail } from '../http.js';
import { hub } from '../realtime.js';
import { notifyUser } from './notify.js';
import { storeSeedImage } from './theme_images.js';

// Oda temaları:
//  * Katalog (room_themes): Coin'siz (price 0, herkes kullanır) ve Coin'li (süreli; hak inventory_items'ta 'room_theme').
//    Hak odanın SAHİBİNE aittir: sahip ya da yardımcı sahip, sahibin temalarını odada kullanabilir.
//  * Özel tema (custom_room_themes): yönetim ödül olarak hak verir → kullanıcı görselini yükler (pending) → yönetim onaylar
//    (süre onay anında başlar) ya da reddeder (hak korunur, yeniden yüklenebilir). Odada theme = 'custom', görsel
//    rooms.theme_image_url'e yazılır.
//  * Süre bitince oda kendiliğinden "Varsayılan" temaya döner (dakikada bir).
export const EFFECTS = ['none', 'aurora', 'stars', 'bubbles', 'embers', 'snow', 'fireflies', 'petals', 'meteors'];
export const CUSTOM_KEY = 'custom';
export const DEFAULT_KEY = 'default';
const KEY_RE = /^[a-z][a-z0-9_]{1,19}$/;

export const isThemeKey = (k) => typeof k === 'string' && KEY_RE.test(k) && k !== CUSTOM_KEY;

export const themeView = (t, until = null, { admin = false } = {}) => ({
  key: t.key,
  label: t.label,
  colors: Array.isArray(t.colors) ? t.colors : [],
  imageUrl: t.image_url ?? null,
  thumbUrl: t.thumb_url ?? t.image_url ?? null,
  effect: t.effect ?? 'none',
  animated: (t.effect ?? 'none') !== 'none' || /\.gif$/i.test(t.image_url ?? ''),
  priceCoins: String(t.price_coins ?? 0),
  free: BigInt(t.price_coins ?? 0) === 0n,
  durationDays: t.duration_days,
  ownedUntil: until,
  ...(admin ? { sortOrder: t.sort_order, active: t.is_active } : {}),
});

export const customView = (c) => ({
  id: c.id,
  days: c.days,
  status: c.status,
  imageUrl: c.image_url ?? null,
  reviewNote: c.review_note ?? null,
  expiresAt: c.expires_at ?? null,
  createdAt: c.created_at,
  ...(c.username !== undefined ? { username: c.username, userId: c.user_id } : {}),
});

const q2 = (c) => (c ? (t, p) => c.query(t, p) : query);

/** Kullanıcının bu tema için süresi dolmamış hakkının bitişi, yoksa null. */
export async function themeUntil(userId, key, q = query) {
  const r = await q(
    `SELECT MAX(expires_at) AS until FROM inventory_items
      WHERE user_id = $1 AND item_type = 'room_theme' AND item_key = $2 AND is_active = TRUE AND expires_at > NOW()`,
    [userId, key],
  );
  return r.rows[0]?.until ?? null;
}

/** Kullanıcının tüm tema haklarının bitişleri: { key: Date }. */
export async function ownedThemes(userId, q = query) {
  const r = await q(
    `SELECT item_key, MAX(expires_at) AS until FROM inventory_items
      WHERE user_id = $1 AND item_type = 'room_theme' AND is_active = TRUE AND expires_at > NOW() GROUP BY item_key`,
    [userId],
  );
  return Object.fromEntries(r.rows.map((x) => [x.item_key, x.until]));
}

/** Kullanıcının şu an geçerli (onaylı, süresi dolmamış) en son özel teması. */
export async function activeCustom(userId, q = query) {
  const r = await q(
    `SELECT * FROM custom_room_themes WHERE user_id = $1 AND status = 'approved' AND expires_at > NOW()
      ORDER BY reviewed_at DESC NULLS LAST LIMIT 1`,
    [userId],
  );
  return r.rows[0] ?? null;
}

/** Hakkı verir ya da süreyi uzatır (transaction içinde). */
export async function addThemeTime(c, userId, theme, days, meta) {
  const cur = (await c.query(
    `SELECT id FROM inventory_items WHERE user_id = $1 AND item_type = 'room_theme' AND item_key = $2 AND is_active = TRUE AND expires_at > NOW() LIMIT 1`,
    [userId, theme.key],
  )).rows[0];
  if (cur) {
    await c.query(`UPDATE inventory_items SET expires_at = expires_at + ($2::int * INTERVAL '1 day') WHERE id = $1`, [cur.id, days]);
  } else {
    await c.query(
      `INSERT INTO inventory_items(user_id, item_type, item_key, item_name, expires_at, metadata)
       VALUES($1,'room_theme',$2,$3, NOW() + ($4::int * INTERVAL '1 day'), $5)`,
      [userId, theme.key, theme.label, days, JSON.stringify(meta ?? {})],
    );
  }
}

async function liveTheme(c, key) {
  const t = (await c.query(`SELECT * FROM room_themes WHERE key = $1 AND is_active = TRUE AND is_deleted = FALSE`, [key])).rows[0];
  if (!t) throw fail('Tema bulunamadı.', 404);
  return t;
}

/** Coin ile satın alma (bakiye FOR UPDATE ile kilitlenir; cüzdan ve denetim kaydı yazılır). */
export async function buyTheme(c, { userId, key }) {
  const t = await liveTheme(c, key);
  const price = BigInt(t.price_coins);
  if (price === 0n) throw fail('Bu tema ücretsiz; satın almadan kullanabilirsiniz.');
  const user = (await c.query(`SELECT coins FROM users WHERE id = $1 FOR UPDATE`, [userId])).rows[0];
  if (!user) throw fail('Kullanıcı bulunamadı.', 404);
  const before = BigInt(user.coins);
  if (before < price) throw fail('Yetersiz Coin.');
  const after = before - price;
  await c.query(`UPDATE users SET coins = $1, updated_at = NOW() WHERE id = $2`, [after.toString(), userId]);
  await addThemeTime(c, userId, t, t.duration_days, { source: 'purchase' });
  await c.query(
    `INSERT INTO wallet_transactions(user_id, transaction_type, coin_amount, reference_id, description) VALUES($1,'room_theme_purchase',$2,$3,$4)`,
    [userId, (-price).toString(), t.key, `Oda teması: ${t.label}`],
  );
  await c.query(
    `INSERT INTO financial_audit_logs(user_id, action, reference_type, reference_id, amount_coins, balance_before, balance_after, metadata)
     VALUES($1,'room_theme_purchase','room_theme',$2,$3,$4,$5,$6)`,
    [userId, t.key, (-price).toString(), before.toString(), after.toString(), JSON.stringify({ days: t.duration_days })],
  );
  return { balance: after.toString(), theme: themeView(t, await themeUntil(userId, key, q2(c))) };
}

async function activeUser(c, userId) {
  const u = (await c.query(`SELECT id, account_status FROM users WHERE id = $1`, [userId])).rows[0];
  if (!u || u.account_status !== 'active') throw fail('Kullanıcı bulunamadı.', 404);
}

/** Yönetim ödülü: katalogdaki bir temayı süreli hediye eder (Coin'li olmayan tema da hediye edilebilir ama gerekmez). */
export async function giftTheme(c, { adminId, userId, key, days }) {
  const t = (await c.query(`SELECT * FROM room_themes WHERE key = $1 AND is_deleted = FALSE`, [key])).rows[0];
  if (!t) throw fail('Tema bulunamadı.', 404);
  await activeUser(c, userId);
  const d = days ?? t.duration_days;
  await addThemeTime(c, userId, t, d, { source: 'admin_gift', by: adminId });
  await c.query(
    `INSERT INTO financial_audit_logs(admin_id, user_id, action, reference_type, reference_id, metadata) VALUES($1,$2,'room_theme_gift','room_theme',$3,$4)`,
    [adminId, userId, t.key, JSON.stringify({ days: d })],
  );
  return { theme: themeView(t, await themeUntil(userId, key, q2(c))), days: d };
}

/** Yönetim ödülü: özel tema hakkı (kullanıcı görselini yükler, onaydan sonra [days] gün kullanır). */
export async function grantCustom(c, { adminId, userId, days }) {
  await activeUser(c, userId);
  const r = (await c.query(
    `INSERT INTO custom_room_themes(user_id, days, granted_by) VALUES($1,$2,$3) RETURNING *`, [userId, days, adminId],
  )).rows[0];
  await c.query(
    `INSERT INTO financial_audit_logs(admin_id, user_id, action, reference_type, reference_id, metadata) VALUES($1,$2,'custom_theme_grant','custom_room_theme',$3,$4)`,
    [adminId, userId, r.id, JSON.stringify({ days })],
  );
  return customView(r);
}

/** Kullanıcı görselini yükledi: inceleme sırasına girer. Yalnızca hak (granted) ya da reddedilmiş kayıt için. */
export async function submitCustom({ userId, id, imageUrl }) {
  const r = (await query(
    `UPDATE custom_room_themes SET image_url = $3, status = 'pending', review_note = NULL, reviewed_at = NULL, reviewed_by = NULL
      WHERE id = $1 AND user_id = $2 AND status IN ('granted', 'rejected') RETURNING *`,
    [id, userId, imageUrl],
  )).rows[0];
  if (!r) throw fail('Bu özel tema şu an görsel kabul etmiyor (incelemede ya da süresi bitmiş olabilir).', 409);
  return customView(r);
}

/** Yönetim onayı: süre şimdi başlar. */
export async function approveCustom(c, { adminId, id }) {
  const r = (await c.query(
    `UPDATE custom_room_themes SET status = 'approved', reviewed_by = $2, reviewed_at = NOW(), review_note = NULL,
        expires_at = NOW() + (days * INTERVAL '1 day')
      WHERE id = $1 AND status = 'pending' AND image_url IS NOT NULL RETURNING *`,
    [id, adminId],
  )).rows[0];
  if (!r) throw fail('Talep bulunamadı ya da zaten sonuçlanmış.', 409);
  return customView(r);
}

export async function rejectCustom(c, { adminId, id, note }) {
  const r = (await c.query(
    `UPDATE custom_room_themes SET status = 'rejected', reviewed_by = $2, reviewed_at = NOW(), review_note = $3
      WHERE id = $1 AND status = 'pending' RETURNING *`,
    [id, adminId, note ?? null],
  )).rows[0];
  if (!r) throw fail('Talep bulunamadı ya da zaten sonuçlanmış.', 409);
  return customView(r);
}

export const notifyCustom = (row, approved) => notifyUser(
  row.user_id ?? row.userId,
  'room_theme',
  approved ? 'Özel temanız onaylandı' : 'Özel temanız onaylanmadı',
  approved
    ? `Temanız ${row.days} gün boyunca odanızda kullanılabilir. Oda > Tema > Müsait bölümünden seçin.`
    : `Görsel uygun bulunmadı${row.reviewNote ? `: ${row.reviewNote}` : '.'} Yeni bir görsel yükleyebilirsiniz.`,
  { screen: 'room_themes' },
);

/**
 * Odaya uygulanacak temayı doğrular. Sahip ([ownerId]) bu temayı kullanabiliyorsa { theme, imageUrl } döner:
 * imageUrl yalnızca özel temada doludur; katalog temasında undefined (dokunulmaz).
 */
export async function resolveRoomTheme(ownerId, key, q = query) {
  if (key === CUSTOM_KEY) {
    const c = await activeCustom(ownerId, q);
    if (!c) throw fail('Onaylanmış, süresi devam eden bir özel temanız yok.', 403);
    return { theme: CUSTOM_KEY, imageUrl: c.image_url };
  }
  if (!isThemeKey(key)) throw fail('Tema geçersiz.');
  const t = (await q(`SELECT key, price_coins FROM room_themes WHERE key = $1 AND is_active = TRUE AND is_deleted = FALSE`, [key])).rows[0];
  if (!t) throw fail('Tema bulunamadı.', 404);
  if (BigInt(t.price_coins) > 0n && !(await themeUntil(ownerId, key, q))) throw fail('Bu temanın süresi yok. Önce Mağaza\'dan satın alın.', 403);
  return { theme: t.key };
}

// Oda ayarı yayını (rooms.js'teki room_settings ile aynı alanlar).
const settingsEvent = (r) => ({
  type: 'room_settings', roomId: r.id, name: r.name, tags: r.tags, locked: Boolean(r.password_hash), chatEnabled: r.chat_enabled,
  theme: r.theme, themeImageUrl: r.theme_image_url, scoreboardEnabled: r.scoreboard_enabled, hidden: r.is_hidden,
  seatCount: r.seat_count, lockedSeats: r.locked_seats ?? [], announcement: r.announcement ?? '', coverUrl: r.cover_url ?? null,
  micRequest: r.mic_request === true, micSkin: r.mic_skin ?? null, micSkinText: r.mic_skin_text ?? null,
});

// Bir odanın teması hâlâ geçerli mi (SQL koşulu; t = rooms ya da room_profiles satırı, sahip sütunu verilir).
const INVALID_THEME = (alias, owner) => `(
  (${alias}.theme = '${CUSTOM_KEY}' AND NOT EXISTS (SELECT 1 FROM custom_room_themes c WHERE c.user_id = ${owner}
     AND c.status = 'approved' AND c.expires_at > NOW()))
  OR (${alias}.theme <> '${CUSTOM_KEY}' AND NOT EXISTS (SELECT 1 FROM room_themes t WHERE t.key = ${alias}.theme
     AND t.is_active = TRUE AND t.is_deleted = FALSE AND (t.price_coins = 0 OR EXISTS (
       SELECT 1 FROM inventory_items i WHERE i.user_id = ${owner} AND i.item_type = 'room_theme' AND i.item_key = t.key
         AND i.is_active = TRUE AND i.expires_at > NOW()))))
)`;

/** Süresi biten / silinen temaları kullanan odalar ve oda profilleri "Varsayılan"a döner. Açık odalara yayın yapılır. */
export async function expireThemes() {
  await query(`UPDATE custom_room_themes SET status = 'expired' WHERE status = 'approved' AND expires_at <= NOW()`);
  const rooms = (await query(
    `UPDATE rooms r SET theme = '${DEFAULT_KEY}',
        theme_image_url = CASE WHEN r.theme = '${CUSTOM_KEY}' THEN NULL ELSE r.theme_image_url END
      WHERE r.theme IS NOT NULL AND r.theme <> '${DEFAULT_KEY}' AND ${INVALID_THEME('r', 'r.owner_id')}
      RETURNING r.*`,
  )).rows;
  await query(
    `UPDATE room_profiles p SET theme = '${DEFAULT_KEY}',
        theme_image_url = CASE WHEN p.theme = '${CUSTOM_KEY}' THEN NULL ELSE p.theme_image_url END
      WHERE p.theme IS NOT NULL AND p.theme <> '${DEFAULT_KEY}' AND ${INVALID_THEME('p', 'p.owner_id')}`,
  );
  for (const r of rooms) if (r.is_active) hub.broadcastRoom(r.id, settingsEvent(r));
  return rooms.length;
}

export function startThemeSweeper() {
  const run = () => expireThemes().catch((e) => console.error('Oda teması süre temizliği başarısız:', e.message));
  run();
  const t = setInterval(run, 60e3);
  t.unref?.();
  return t;
}

/**
 * Depodaki hazır tema görsellerini (backend/src/samples/themes/<anahtar>.webp + <anahtar>_t.webp) görseli olmayan
 * katalog temalarına yükler. Yöneticinin sildiği (is_deleted) ya da kendi görselini koyduğu tema değişmez.
 */
export async function seedThemeImages() {
  const dir = new URL('../samples/themes/', import.meta.url);
  let files;
  try { files = fs.readdirSync(dir); } catch { return 0; }
  const rows = (await query(`SELECT key FROM room_themes WHERE image_url IS NULL AND is_deleted = FALSE`)).rows;
  let n = 0;
  for (const { key } of rows) {
    if (!files.includes(`${key}.webp`)) continue;
    const imageUrl = await storeSeedImage(fs.readFileSync(new URL(`${key}.webp`, dir)), 'webp', 'theme_seed');
    const thumbUrl = files.includes(`${key}_t.webp`) ? await storeSeedImage(fs.readFileSync(new URL(`${key}_t.webp`, dir)), 'webp', 'theme_seed_thumb') : null;
    const r = await query(`UPDATE room_themes SET image_url = $2, thumb_url = $3, updated_at = NOW() WHERE key = $1 AND image_url IS NULL`, [key, imageUrl, thumbUrl]);
    n += r.rowCount;
  }
  return n;
}
