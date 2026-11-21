import { query } from '../../infrastructure/database/database.js';
import { levelFromExp, levelExp } from './levels.rules.js';
import { USER_PUBLIC_COLUMNS, USER_PUBLIC_JOINS, publicUser, roomUser } from '../../shared/utils/views.js';
import { hub } from '../../infrastructure/websocket/realtime.js';
import { isGhost } from '../rooms/presence.service.js';
import { wipVehicleGift } from '../system/wip.service.js';

export async function loadPublicRow(id, run = query) {
  const r = await run(`SELECT ${USER_PUBLIC_COLUMNS} FROM users u ${USER_PUBLIC_JOINS} WHERE u.id = $1`, [id]);
  return r.rows[0] || null;
}

export async function loadPublicRows(ids, run = query) {
  if (!ids.length) return [];
  const r = await run(`SELECT ${USER_PUBLIC_COLUMNS} FROM users u ${USER_PUBLIC_JOINS} WHERE u.id = ANY($1::uuid[])`, [ids]);
  return r.rows;
}

/**
 * Odaya girişte oynayan efekt: mağazadan alınan **giriş aracı** (vehicle) ya da **özel giriş** (entrance_effect),
 * ayrıca verilmiş ya da WIP üyeliğinin verdiği **WIP aracı** (kodla çizilir: kind 'wip_vehicle').
 * Sıra: takılı öğe → WIP üyelik aracı (kullanıcı kapatmadıysa) → takılı olmayan mağaza öğesi. Hiçbiri yoksa null.
 */
export async function activeEntranceEffect(userId, run = query) {
  const r = await run(
    `SELECT i.item_type, i.item_key, i.item_name, COALESCE(e.animation_url, i.metadata->>'assetUrl') AS animation_url, e.duration_ms,
            (i.metadata->>'wipLevel')::int AS wip_level, COALESCE(i.metadata->>'equipped' = 'true', FALSE) AS equipped
     FROM inventory_items i
     LEFT JOIN entrance_effects e ON i.item_type = 'entrance_effect' AND e.id::text = i.item_key AND e.is_active = TRUE
     WHERE i.user_id = $1 AND i.item_type IN ('entrance_effect', 'vehicle') AND i.is_active = TRUE
       AND (i.item_key NOT LIKE 'wip:%' OR i.item_type = 'vehicle')
       AND (i.expires_at IS NULL OR i.expires_at > NOW())
     ORDER BY COALESCE(i.metadata->>'equipped' = 'true', FALSE) DESC, (i.item_type = 'vehicle') DESC, i.created_at DESC LIMIT 1`,
    [userId],
  );
  const row = r.rows[0];
  // WIP 8+ aracı: seçilmiş araçlı hediyenin animasyonu (eski uygulamalar kodla çizilen aracı göstermeye devam eder).
  const wipVehicle = async (level, itemKey, itemName) => {
    const g = level >= 8 ? await wipVehicleGift(level, run).catch(() => null) : null;
    return {
      // durationMs eski uygulamalarda kodla çizilen aracın süresidir (4600); video süresi ayrı alanda.
      kind: 'wip_vehicle', level, itemKey, itemName: g?.name ?? itemName, animationUrl: g?.url ?? null, durationMs: 4600, videoMs: g?.durationMs ?? null,
    };
  };
  const fromRow = (x) => {
    if (x.item_key.startsWith('wip:')) {
      const level = x.wip_level ?? Number(x.item_key.slice(4));
      return wipVehicle(level, x.item_key, x.item_name);
    }
    const vehicle = x.item_type === 'vehicle';
    return {
      kind: vehicle ? 'vehicle' : 'effect', itemKey: x.item_key, itemName: x.item_name, animationUrl: x.animation_url ?? null,
      durationMs: x.duration_ms ?? (vehicle ? 5000 : 4000),
    };
  };
  // Takılı araç her şeyden önce gelir; takılı özel giriş efekti ise üyelik aracından sonra.
  if (row?.equipped && row.item_type === 'vehicle') return fromRow(row);
  // WIP üyeliğinin aracı (Görünüm'den kapatılmadıysa).
  const w = (await run(
    `SELECT uw.level, u.wip_hidden FROM users u
     JOIN user_wip uw ON uw.user_id = u.id AND uw.is_active = TRUE AND uw.expires_at > NOW() WHERE u.id = $1`,
    [userId],
  )).rows[0];
  if (w?.level && w.wip_hidden?.vehicle !== true) {
    return wipVehicle(w.level, `wip:${w.level}`, null);
  }
  return row ? fromRow(row) : null;
}

/**
 * Kullanıcının görünümü değişince (çerçeve, balon, mikrofon dalgası, fotoğraf, kimlik…) bulunduğu ve sahibi olduğu odalara
 * anında bildirir; odadakiler çıkıp girmeden yeni görünümü (ve oda kimliğini) görür. Hata olursa sessizce geçer (asıl işlemi bozmaz).
 */
export async function announceUserChange(userId) {
  try {
    const ghost = await isGhost(userId);
    const rooms = (await query(`SELECT room_id, microphone FROM room_members WHERE user_id = $1`, [userId])).rows;
    // Sahibi olduğu açık odalar da duyulur: oda kimliği sahibin kimliğidir (Yoho), sahip odada olmasa da başlık yenilenir.
    const owned = (await query(
      `SELECT id FROM rooms WHERE owner_id = $1 AND is_active = TRUE AND id NOT IN (SELECT room_id FROM room_members WHERE user_id = $1)`,
      [userId],
    )).rows;
    if (!rooms.length && !owned.length) return;
    const row = await loadPublicRow(userId);
    if (!row) return;
    const user = roomUser(row, null);
    for (const r of rooms) {
      const payload = { type: 'room_member_updated', roomId: r.room_id, user };
      // Hayalet (SWIP) üye yalnızca mikrofondayken görünür: o zaman odaya duyurulur; değilse yalnızca kendisi yeniler.
      if (!ghost || r.microphone) hub.broadcastRoom(r.room_id, payload);
      else hub.sendToUser(userId, payload);
    }
    // Sahip odada değil: yalnızca sahip bilgisi (kimlik, ad, fotoğraf) güncellenir; hayalet de olsa sahip zaten odada görünür.
    for (const r of owned) hub.broadcastRoom(r.id, { type: 'room_member_updated', roomId: r.id, user, owner: true });
  } catch (error) {
    console.error('[görünüm] odalara bildirilemedi:', error.message);
  }
}

/** Yeni verilen/alınan öğe: o türden takılı bir öğe yoksa kendiliğinden takılır (kullanıcı ayrıca uğraşmasın). */
export async function equipIfNone(run, userId, itemType, itemId) {
  await run(
    `UPDATE inventory_items SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"equipped": true}'::jsonb
     WHERE id = $1 AND NOT EXISTS (
       SELECT 1 FROM inventory_items o WHERE o.user_id = $2 AND o.item_type = $3 AND o.id <> $1 AND o.is_active = TRUE
         AND (o.expires_at IS NULL OR o.expires_at > NOW()) AND COALESCE(o.metadata->>'equipped' = 'true', FALSE))`,
    [itemId, userId, itemType],
  );
}

/**
 * v2.72: Seviye sınırı 160 → 300. Kayıtlı seviyesi 160 olan kullanıcıların gerçek seviyesi (exp + verilen fark) yeniden
 * hesaplanır; böylece sınırda takılı kalanlar bir sonraki hediyeyi beklemeden doğru görünür. Açılışta bir kez, zararsız.
 */
export async function refreshCappedLevels() {
  const r = await query(
    `SELECT id, total_sent_coins, total_received_diamonds, level_exp_bonus, host_level_exp_bonus, coin_level, gift_level
     FROM users WHERE coin_level >= 160 OR gift_level >= 160`,
  );
  let n = 0;
  for (const u of r.rows) {
    const c = levelFromExp(levelExp(u.total_sent_coins, u.level_exp_bonus));
    const g = levelFromExp(levelExp(u.total_received_diamonds, u.host_level_exp_bonus));
    if (c !== u.coin_level || g !== u.gift_level) {
      await query(`UPDATE users SET coin_level = $2, gift_level = $3 WHERE id = $1`, [u.id, c, g]);
      n += 1;
    }
  }
  return n;
}

/**
 * Listelerdeki (takip, fan, ziyaretçi, arkadaş) kullanıcıların şu an bulunduğu oda: kendi odasındaysa oda türü
 * ('audio' → mikrofon, 'video' → kamera simgesi), başka bir odadaysa 'live' (yayında simgesi). Dokununca o odaya girilir.
 * Gizli kullanıcı, hayalet mod, çevrimiçi durumunu gizleyen ve gizli odalar gösterilmez.
 */
export async function attachCurrentRooms(users, run = query) {
  const ids = [...new Set(users.map((u) => u?.id).filter(Boolean))];
  if (!ids.length) return users;
  const r = await run(
    `SELECT DISTINCT ON (rm.user_id) rm.user_id, r.id AS room_id, r.room_type, r.owner_id, (r.password_hash IS NOT NULL) AS locked
     FROM room_members rm
     JOIN rooms r ON r.id = rm.room_id AND r.is_active = TRUE AND r.is_hidden = FALSE
     JOIN users u ON u.id = rm.user_id AND u.is_hidden = FALSE AND u.show_presence IS DISTINCT FROM FALSE AND NOT is_ghost(u.id)
     WHERE rm.user_id = ANY($1::uuid[])
     ORDER BY rm.user_id, (r.owner_id = rm.user_id) DESC, rm.joined_at DESC`,
    [ids],
  );
  const map = new Map(r.rows.map((x) => [x.user_id, {
    id: x.room_id,
    locked: x.locked === true,
    kind: x.owner_id === x.user_id ? (x.room_type === 'video' ? 'video' : 'audio') : 'live',
  }]));
  return users.map((u) => (u && map.has(u.id) ? { ...u, currentRoom: map.get(u.id) } : u));
}
