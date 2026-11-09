import { query, tx } from '../database.js';
import { hub } from '../realtime.js';
import { removeParticipant, deleteRoom } from '../livekit.js';
import { clearRoomMusic, broadcastMusic } from './music.js';
import { broadcastQueue, notifyNext } from './micqueue.js';
import { closeMicSessions, closeRoomMicSessions } from './mic.js';
import { endPkForRoom } from './pk.js';
import { cancelRoomGame, forfeitUserInRoom } from './games.js';
import { nonOverlapping } from '../ticker.js';

export const SUPPORTED_SEATS = new Set([2, 4, 5, 6, 8, 9, 12, 15, 20, 30]);

// Odayı kapatır: üyeleri temizler, yayın oturumlarını bitirir, herkese bildirir.
export async function closeRoom(roomId) {
  await endPkForRoom(roomId).catch((e) => console.error('PK kapatma hatası:', e.message));
  const closed = await tx(async (c) => {
    const r = await c.query(`UPDATE rooms SET is_active = FALSE, closed_at = NOW() WHERE id = $1 AND is_active = TRUE RETURNING id`, [roomId]);
    if (!r.rowCount) return false;
    await c.query(`UPDATE broadcast_sessions SET ended_at = NOW() WHERE room_id = $1 AND ended_at IS NULL`, [roomId]);
    await c.query(`DELETE FROM room_members WHERE room_id = $1`, [roomId]);
    await clearRoomMusic(roomId, (t, p) => c.query(t, p));
    await closeRoomMicSessions(roomId, (t, p) => c.query(t, p));
    return true;
  });
  if (closed) {
    await cancelRoomGame(roomId).catch((e) => console.error('Oyun iptal hatası:', e.message));
    hub.broadcastRoom(roomId, { type: 'room_closed', roomId });
    hub.clearRoom(roomId);
    await deleteRoom(roomId);
  }
  return closed;
}

// Kullanıcıyı odadan çıkarır. Oda sahibi çıkarsa (içeride yönetici yoksa) oda kapanır.
// moved: kişi başka bir odaya girdiği / kendi odasını açtığı için çıkarıldı; eski odadaki ekranı "room_moved" ile kapanır.
export async function leaveRoom(userId, roomId, { moved = false } = {}) {
  const r = await query(
    `DELETE FROM room_members WHERE room_id = $1 AND user_id = $2 RETURNING role, microphone, is_ghost(user_id) AS ghost`, [roomId, userId],
  );
  if (!r.rowCount) return false;
  await closeMicSessions(userId, roomId);
  const queued = await query(`DELETE FROM room_mic_queue WHERE room_id = $1 AND user_id = $2`, [roomId, userId]);
  // Sahip odadan çıktı (oda yönetici sayesinde açık kalsa da): yayın süresi sayımı durur; dönünce yeniden başlar.
  if (r.rows[0].role === 'owner') {
    await query(`UPDATE broadcast_sessions SET ended_at = NOW() WHERE room_id = $1 AND user_id = $2 AND ended_at IS NULL`, [roomId, userId]);
  }
  // Müziği çalan kişi (DJ) çıktı: odadaki müzik durur (müzik kutusu yalnızca ondaydı, kimse yönetemez). Ses düzeyi kalır.
  const dj = await query(
    `UPDATE room_music SET track_id = NULL, status = 'stopped', position_ms = 0, controlled_by = NULL, updated_at = NOW()
     WHERE room_id = $1 AND controlled_by = $2 AND track_id IS NOT NULL RETURNING room_id`,
    [roomId, userId],
  );
  if (dj.rowCount) {
    await query(`DELETE FROM room_music_queue WHERE room_id = $1`, [roomId]); // sıra DJ'in listesiydi; sahipsiz çalmasın
    await broadcastMusic(roomId).catch(() => {});
  }
  await forfeitUserInRoom(userId, roomId).catch((e) => console.error('Oyundan çıkarma hatası:', e.message));
  // Oda, sahibi ya da yardımcı sahibi içerideyken açık kalır. Sahip çıkınca içeride yardımcı sahip varsa oda kapanmaz
  // (sahip dönünce yine sahip olarak girer); moderatör odayı açık tutmaz. Sahip ve yardımcı sahip kalmayınca oda kapanır.
  if (['owner', 'cohost'].includes(r.rows[0].role)) {
    const keeper = (await query(
      `SELECT 1 FROM room_members WHERE room_id = $1 AND role IN ('owner','cohost') LIMIT 1`, [roomId],
    )).rowCount > 0;
    if (!keeper) {
      await closeRoom(roomId);
      return true;
    }
  }
  // Hayalet (SWIP) dinleyicinin çıkışı duyurulmaz (girişi de duyurulmamıştı).
  if (r.rows[0].microphone || !r.rows[0].ghost) hub.broadcastRoom(roomId, { type: 'room_member_left', roomId, userId });
  hub.detachUserFromRoom(userId, roomId, moved ? { type: 'room_moved', roomId } : null);
  await removeParticipant(roomId, userId);
  // Sıradakilere güncel liste; koltuğu boşaldıysa sıradaki kişi mikrofona davet edilir.
  if (queued.rowCount) await broadcastQueue(roomId).catch(() => {});
  if (r.rows[0].microphone) await notifyNext(roomId).catch(() => {});
  return true;
}

// Odadan atılan kişi, uygulamanın kendiliğinden yeniden bağlanmasıyla (rejoin) geri girmesin (10 dk).
const kicks = new Map();
export function noteKick(roomId, userId) {
  kicks.set(`${roomId}:${userId}`, Date.now() + 10 * 60e3);
  if (kicks.size > 5000) for (const [k, t] of kicks) if (t < Date.now()) kicks.delete(k);
}
export function recentlyKicked(roomId, userId) {
  const t = kicks.get(`${roomId}:${userId}`);
  return t !== undefined && t > Date.now();
}

/**
 * Bir kullanıcı aynı anda yalnızca bir odada bulunur (Yoho gibi): başka odaya girince / kendi odasını açınca önceki
 * odalardan çıkarılır. Sahibi olduğu oda, içeride yönetici (yardımcı sahip / moderatör) yoksa kapanır.
 */
export async function leaveOtherRooms(userId, keepRoomId = null) {
  const r = await query(
    `SELECT room_id FROM room_members WHERE user_id = $1 AND ($2::uuid IS NULL OR room_id <> $2::uuid)`,
    [userId, keepRoomId],
  );
  for (const m of r.rows) {
    await leaveRoom(userId, m.room_id, { moved: true }).catch((e) => console.error('Önceki odadan çıkarma hatası:', e.message));
  }
  return r.rowCount;
}

/** Kullanıcının, şu an hiçbir bağlantısının bağlı olmadığı oda üyelikleri (uygulama kapanıp açıldı: eski odada asılı kaldı). */
export async function leaveStaleRooms(userId) {
  // Son 1 dakikada girilen oda sayılmaz (açılışta bildirimden hemen girilen odaya abonelik henüz kurulmamış olabilir).
  // Son 90 sn'de sinyal gönderen üyelik de sayılmaz (başka cihazda oda açık, bağlantısı o an yeniden kuruluyor olabilir).
  const r = await query(
    `SELECT room_id FROM room_members WHERE user_id = $1 AND joined_at < NOW() - INTERVAL '60 seconds' AND last_seen_at < NOW() - INTERVAL '90 seconds'`,
    [userId],
  );
  let n = 0;
  for (const m of r.rows) {
    if (hub.isUserInRoom(userId, m.room_id)) continue; // başka bir cihazda gerçekten odada
    if (await leaveRoom(userId, m.room_id).catch(() => false)) n++;
  }
  return n;
}

export async function isRoomMember(userId, roomId) {
  const r = await query(`SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2`, [roomId, userId]);
  return r.rowCount > 0;
}

// Uygulaması kapanmış / bağlantısı kopmuş kullanıcıları odadan temizler.
// Üye iki yoldan canlı sayılır: (1) WebSocket'ten odaya abone, (2) uygulamadan gelen "heartbeat" (last_seen_at).
// İkisi de bekleme süresinden uzun süredir yoksa çıkarılır: üye ve oda sahibi 3 dk (sinyal dakikada bir gelir). Arka plana
// alınan telefonun bağlantısı açık kaldığı için atılmaz; uygulaması kapanan kişi ~3 dk içinde odadan düşer, sahibin odası
// (içeride yardımcı sahip yoksa) kapanır ve listede "ölü oda" kalmaz.
const GRACE_SECONDS = { user: Number(process.env.ROOM_GRACE_SECONDS || 180), owner: Number(process.env.ROOM_OWNER_GRACE_SECONDS || 180) };

export function startRoomSweeper() {
  const timer = setInterval(nonOverlapping(async () => {
    try {
      const r = await query(
        `SELECT room_id, user_id FROM room_members
         WHERE joined_at < NOW() - INTERVAL '90 seconds'
           AND last_seen_at < NOW() - (CASE WHEN role = 'owner' THEN $2::int ELSE $1::int END) * INTERVAL '1 second'`,
        [GRACE_SECONDS.user, GRACE_SECONDS.owner],
      );
      for (const m of r.rows) {
        // Biri hata verse de diğerleri temizlensin.
        try {
          if (!hub.isUserInRoom(m.user_id, m.room_id)) await leaveRoom(m.user_id, m.room_id);
        } catch (e) { console.error('Oda temizleyici (üye):', e.message); }
      }
      // Sahibi ve yardımcı sahibi kalmamış açık odalar (ör. çıkış isteği yarıda kaldı, sunucu yeniden başladı) kapanır.
      const orphans = await query(
        `SELECT r.id FROM rooms r
         WHERE r.is_active = TRUE AND r.created_at < NOW() - INTERVAL '2 minutes'
           AND NOT EXISTS (SELECT 1 FROM room_members m WHERE m.room_id = r.id AND m.role IN ('owner','cohost'))`,
      );
      for (const o of orphans.rows) {
        try { await closeRoom(o.id); } catch (e) { console.error('Oda temizleyici (oda):', e.message); }
      }
    } catch (error) {
      console.error('Oda temizleyici hatası:', error.message);
    }
  }), 30000);
  timer.unref();
  return timer;
}
