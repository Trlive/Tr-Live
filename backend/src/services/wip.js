import { query } from '../database.js';

export const BASE_FEATURES = Object.freeze({
  nameColor: null, badge: null, maxRooms: 1, viewVisitors: false, vipGifts: false, muteImmunity: false, kickImmunity: false,
  profileEffect: false, customRoomTheme: false, invisibleVisit: false, animatedAvatar: false, ghostMode: false,
});

/** Bir ayrıcalığın açıldığı en düşük kademe (hata mesajlarında "WIP 6 ve üzeri" demek için; panelden değişebilir). */
export async function minLevelFor(feature, run = query) {
  const r = await run(`SELECT MIN(level) AS level FROM wip_tiers WHERE COALESCE((features->>$1)::boolean, FALSE)`, [feature]);
  return r.rows[0]?.level ?? null;
}

export const wipLabel = (level) => (level >= 11 ? 'SWIP' : `WIP ${level}`);

/** WIP 8 ve üstünün giriş aracı: kodla çizilen araç yerine sırasıyla seçilmiş araçlı hediyenin animasyonu
 * (hazır paketteki hediye; süre = videonun uzunluğu). Hediye kurulu değilse kodla çizilen araç kalır. */
export const WIP_VEHICLE_GIFTS = Object.freeze({
  8: ['g_bluecar', 6500], // Buz (mavi): Mavi Spor Araba
  9: ['g_orangecar', 3600], // Gökkuşağı: Turuncu Spor Araba
  10: ['g_bullcar', 7900], // Ateş: Altın Boğa Araba (ateş çemberi)
  11: ['g_blackcar', 6400], // SWIP · Hayalet: Siyah Spor Araba
});
const vehicleCache = new Map(); // level -> { at, value }

export async function wipVehicleGift(level, run = query) {
  const def = WIP_VEHICLE_GIFTS[Math.min(11, Number(level))];
  if (!def) return null;
  const hit = vehicleCache.get(def[0]);
  if (hit && Date.now() - hit.at < 60e3) return hit.value;
  const r = await run(
    `SELECT g.name, g.animation_url, g.icon_url FROM asset_items a JOIN gifts g ON g.id = a.ref_id
     WHERE a.key = $1 AND a.kind = 'gift' AND g.animation_url IS NOT NULL`,
    [def[0]],
  );
  const g = r.rows[0];
  const value = g ? { name: g.name, url: g.animation_url, iconUrl: g.icon_url ?? null, durationMs: def[1] } : null;
  vehicleCache.set(def[0], { at: Date.now(), value });
  return value;
}

/** WIP 8+ araçlarının adı, resmi ve videosu (Görünüm / WIP sayfasındaki küçük resimler için). */
export async function wipVehicleGifts(run = query) {
  const out = {};
  for (const level of Object.keys(WIP_VEHICLE_GIFTS)) {
    const g = await wipVehicleGift(Number(level), run).catch(() => null);
    if (g) out[level] = { name: g.name, iconUrl: g.iconUrl, animationUrl: g.url };
  }
  return out;
}

/** Ayrıcalık yoksa açıklayıcı hata (hangi kademede açıldığını söyler). */
export async function requireFeature(userId, feature, what) {
  if ((await featuresFor(userId))[feature]) return;
  const lvl = await minLevelFor(feature);
  const err = new Error(lvl ? `${what} ${wipLabel(lvl)} ve üzeri üyeliğe özeldir.` : `${what} şu an hiçbir WIP kademesinde açık değil.`);
  err.status = 403;
  throw err;
}

// run: (text, params) => Promise<{rows}>  (transaction içinde client.query kullanılabilir)
export async function activeWip(userId, run = query) {
  const r = await run(
    `SELECT uw.level, uw.starts_at, uw.expires_at, wt.name, wt.features
     FROM user_wip uw JOIN wip_tiers wt ON wt.level = uw.level
     WHERE uw.user_id = $1 AND uw.is_active = TRUE AND uw.expires_at > NOW()`,
    [userId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    level: row.level, name: row.name, startsAt: row.starts_at, expiresAt: row.expires_at,
    features: { ...BASE_FEATURES, ...row.features },
  };
}

export async function featuresFor(userId, run = query) {
  return (await activeWip(userId, run))?.features ?? { ...BASE_FEATURES };
}
