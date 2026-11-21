// rooms modülünün ortak parçaları: import'lar, yardımcılar ve sabitler.
//
// rooms.routes.js konularına bölündü (mic, moderation, scoreboard, media). Bölme sırasında KOD
// DEĞİŞTİRİLMEDİ; ortak bildirimler buraya alınıp dışa açıldı. API yüzeyi aynı — adres haritası
// testi (test/route_map.test.js) bunu doğrular.
import { Router } from 'express';
import { query, tx } from '../../infrastructure/database/database.js';
import { requireAuth, optionalAuth, hashPassword, checkPassword } from '../../middleware/authentication/auth.js';
import { userLimit, hitLimit, noteViolation, clientIp } from '../../middleware/security/firewall.js';
import { cleanTags } from '../../middleware/security/text_safety.js';
import { fail, uuid, text, oneOf } from '../../shared/errors/http.js';
import { publicUser, USER_PUBLIC_COLUMNS, USER_PUBLIC_JOINS, roomUser } from '../../shared/utils/views.js';
import { hub } from '../../infrastructure/websocket/realtime.js';
import { token as livekitToken, setCanPublish, removeParticipant } from '../../infrastructure/livekit/livekit.js';
import { canManage } from './permissions.js';
import { roomStaffShield } from '../agencies/staff.rules.js';
import { featuresFor, requireFeature } from '../system/wip.service.js';
import { skinUntil } from './mic_skins.service.js';
import { refreshGhost } from './ghost.service.js';
import { loadPublicRow, loadPublicRows, activeEntranceEffect } from '../users/users.service.js';
import { leaveRoom, leaveOtherRooms, leaveStaleRooms, closeRoom, noteKick, recentlyKicked, SUPPORTED_SEATS } from './rooms.service.js';
import { openMicSession, closeMicSessions } from './mic.service.js';
import { scoreboardOf, activeSession, startSession, endSession, sessionHistory, sessionView, SCOREBOARD_DURATIONS } from './scoreboard.service.js';
import { queueOf, broadcastQueue, removeFromQueue, notifyNext, grantMicInvite, hasMicInvite, consumeMicInvite, isQueued } from './micqueue.service.js';
import { cleanPublic } from '../../middleware/security/safe_text.js';
import crypto from 'node:crypto';
import { noteTask } from '../events/daily.service.js';
import express from 'express';
import { saveUpload, removeUpload, IMAGE_TYPES } from '../media/images.service.js';
import { newRoomNumber } from '../users/ids.service.js';
import { isGhost } from './presence.service.js';
import { notifyFriendsRoomOpen } from '../notifications/notify.service.js';
import { resolveRoomTheme, CUSTOM_KEY } from './room_themes.service.js';
import { KICK_BAN_HOURS, banFromRoom, activeBan, unbanFromRoom, banMessage, logModeration, moderationRows } from './room_bans.service.js';

export const SEAT_MANAGERS = ['owner', 'cohost', 'moderator'];
// Temalar artık room_themes kataloğundan doğrulanır (services/room_themes.js: resolveRoomTheme).

// Temalar artık room_themes kataloğundan doğrulanır (services/room_themes.js: resolveRoomTheme).
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 0/O/1/I yok

export const newCode = () => Array.from(crypto.randomBytes(6), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');

// showCode: davet kodunu yalnızca oda sahibi / yardımcı sahip görür.

// showCode: davet kodunu yalnızca oda sahibi / yardımcı sahip görür.
export const roomJson = (r, { showCode = false } = {}) => ({
  id: r.id, roomNumber: r.room_number ?? null, announcement: r.announcement ?? '', coverUrl: r.cover_url ?? null, name: r.name, roomType: r.room_type, seatCount: r.seat_count, ownerId: r.owner_id, createdAt: r.created_at,
  layout: r.layout === 'live' ? 'live' : 'grid', tags: r.tags ?? [], locked: Boolean(r.password_hash), chatEnabled: r.chat_enabled !== false,
  hidden: Boolean(r.is_hidden), theme: r.theme ?? 'default', themeImageUrl: r.theme_image_url ?? null, scoreboardEnabled: r.scoreboard_enabled !== false, lockedSeats: r.locked_seats ?? [], mutedSeats: r.muted_seats ?? [], micRequest: r.mic_request === true,
  micSkin: r.mic_skin ?? null, micSkinText: r.mic_skin_text ?? null,
  ...(showCode && r.join_code ? { joinCode: r.join_code } : {}),
});

export async function uniqueCode(run) {
  for (let i = 0; i < 8; i += 1) {
    const code = newCode();
    if (!(await run(`SELECT 1 FROM rooms WHERE join_code = $1 AND is_active = TRUE`, [code])).rowCount) return code;
  }
  throw fail('Davet kodu üretilemedi, tekrar deneyin.', 503);
}

// Gizli odanın üye/yönetici/katkı listesi yalnızca odadakilere ve sahibine açıktır.

// Gizli odanın üye/yönetici/katkı listesi yalnızca odadakilere ve sahibine açıktır.
export async function assertRoomVisible(room, userId) {
  if (!room.is_hidden || room.owner_id === userId) return;
  if (!(await memberOf(room.id, userId))) throw fail('Oda bulunamadı.', 404);
}

/** Odanın güncel ayarlarını kalıcı oda kaydına yazar (oda kapatılıp açılınca aynı kalsın). */

export async function syncProfile(r, run = query) {
  await run(
    `UPDATE room_profiles SET name = $3, tags = $4, theme = $5, seat_count = $6, announcement = $7, chat_enabled = $8, theme_image_url = $9,
       scoreboard_enabled = $10, mic_request = $11, locked_seats = $12, password_hash = $13, is_hidden = $14, updated_at = NOW()
     WHERE owner_id = $1 AND room_type = $2`,
    [r.owner_id, r.room_type, r.name, r.tags ?? [], r.theme, r.seat_count, r.announcement, r.chat_enabled !== false, r.theme_image_url ?? null,
      r.scoreboard_enabled !== false, r.mic_request === true, r.locked_seats ?? [], r.password_hash ?? null, r.is_hidden === true],
  );
}

/** Oda elması: bu sahibin bu türdeki odasına gelen tüm hediyeler (oda kapanınca sıfırlanmaz). */
// Oda sahibinin ailesi (odanın üstündeki aile çipi). Ailesi yoksa null: çip görünmez.
// Sahip "Gizli Kullanıcı" ise aile de gösterilmez (aile adı kimliğini ele vermesin).

// Oda sahibinin ailesi (odanın üstündeki aile çipi). Ailesi yoksa null: çip görünmez.
// Sahip "Gizli Kullanıcı" ise aile de gösterilmez (aile adı kimliğini ele vermesin).
export async function ownerFamily(ownerId) {
  const f = (await query(
    `SELECT f.id, f.name, f.logo_url, f.level FROM family_members fm JOIN families f ON f.id = fm.family_id AND f.is_active
     JOIN users u ON u.id = fm.user_id AND NOT COALESCE(u.is_hidden, FALSE)
     WHERE fm.user_id = $1 LIMIT 1`, [ownerId],
  )).rows[0];
  return f ? { id: f.id, name: f.name, logoUrl: f.logo_url ?? null, level: f.level } : null;
}

export async function roomDiamonds(room) {
  const r = await query(`SELECT total_diamonds FROM room_profiles WHERE owner_id = $1 AND room_type = $2`, [room.owner_id, room.room_type]);
  return String(r.rows[0]?.total_diamonds ?? 0);
}

/** Oda sahibinin herkese açık bilgisi (kimlik, ad, fotoğraf); bulunamazsa null. */

export async function ownerPublic(ownerId, viewerId) {
  const row = await loadPublicRow(ownerId);
  return row ? roomUser(row, viewerId) : null;
}

export async function activeRoom(roomId) {
  const room = (await query(`SELECT * FROM rooms WHERE id = $1 AND is_active = TRUE`, [roomId])).rows[0];
  if (!room) throw fail('Oda bulunamadı.', 404);
  return room;
}

export async function memberOf(roomId, userId) {
  return (await query(`SELECT * FROM room_members WHERE room_id = $1 AND user_id = $2`, [roomId, userId])).rows[0] || null;
}

// ---------- Liste ve ayrıntı ----------
/** Son 5 dakikada bu kadar Coin'lik hediye atılan oda "yükseliyor" olur ve listede anında en üste çıkar. */

export const ROOM_HOT_COINS = 10000;

// ---------- Kalıcı oda ----------
// Kullanıcı sesli ve görüntülü için birer kez oda kurar (ad, etiketler, koltuk düzeni, tema). Sonraki "oda aç"lar bu bilgilerle
// tek adımda açar; ad ve etiketler yalnızca oda içinden (oda adına dokunarak) değiştirilir.
export const profileJson = (p) => ({
  roomNumber: p.room_number ?? null, announcement: p.announcement ?? '', coverUrl: p.cover_url ?? null, roomType: p.room_type, name: p.name, tags: p.tags ?? [],
  seatCount: p.seat_count, theme: p.theme, themeImageUrl: p.theme_image_url ?? null, layout: p.layout === 'live' ? 'live' : 'grid',
});

/** Canlı yayında koltuk sayısı sabittir: yayıncı + 3 konuk penceresi. */

export const LIVE_SEATS = 4;

export async function profileOf(userId, roomType, run = query) {
  return (await run(`SELECT * FROM room_profiles WHERE owner_id = $1 AND room_type = $2`, [userId, roomType])).rows[0] || null;
}

/** Profilden oda açar. Aynı türde zaten açık odası varsa onu döndürür (yeni oda açılmaz). */

export async function openFromProfile(userId, profile, hidden) {
  return tx(async (c) => {
    await c.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]); // eşzamanlı açmayı sıraya sokar
    const existing = (await c.query(`SELECT * FROM rooms WHERE owner_id = $1 AND room_type = $2 AND is_active = TRUE ORDER BY created_at DESC LIMIT 1`, [userId, profile.room_type])).rows[0];
    if (existing) return { room: existing, created: false };
    // Oda içinde yapılan son ayarlar (sohbet, tema görseli, sayı tahtası, mikrofon isteği, kilitli koltuklar, şifre, gizlilik)
    // kayıtlı odadan gelir: oda kapatılıp açılınca aynen kalır.
    // Gizlilik: bu açılışta istenirse ya da oda içinde gizli yapılmışsa (sahibi gizliliği kaldırana dek gizli kalır).
    const isHidden = hidden || profile.is_hidden === true;
    const lockedSeats = (profile.locked_seats ?? []).filter((i) => i > 0 && i < profile.seat_count);
    const r = (await c.query(
      `INSERT INTO rooms(name, room_type, seat_count, owner_id, tags, is_hidden, join_code, theme, room_number, announcement, cover_url, layout,
                         chat_enabled, theme_image_url, scoreboard_enabled, mic_request, locked_seats, password_hash)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [profile.name, profile.room_type, profile.seat_count, userId, profile.tags, isHidden, isHidden ? await uniqueCode((t, p) => c.query(t, p)) : null, profile.theme, profile.room_number ?? await newRoomNumber((t, p) => c.query(t, p)), profile.announcement ?? null, profile.cover_url ?? null,
        profile.room_type === 'video' && profile.layout === 'live' ? 'live' : 'grid',
        profile.chat_enabled !== false, profile.theme_image_url ?? null, profile.scoreboard_enabled !== false, profile.mic_request === true, lockedSeats, profile.password_hash ?? null],
    )).rows[0];
    await c.query(`INSERT INTO room_members(room_id, user_id, role, microphone, seat_index) VALUES($1,$2,'owner',TRUE,0)`, [r.id, userId]);
    // Onaylı yayıncı ise yayın oturumu başlar (süre istatistikleri için).
    const b = (await c.query(`SELECT agency_id FROM broadcasters WHERE user_id = $1 AND status = 'approved'`, [userId])).rows[0];
    if (b) await c.query(`INSERT INTO broadcast_sessions(user_id, room_id, agency_id) VALUES($1,$2,$3)`, [userId, r.id, b.agency_id]);
    await openMicSession(userId, r.id, (t, p) => c.query(t, p));
    return { room: r, created: true };
  });
}

// Kayıtlı odalarım ve şu an açık olanlar.

// ---------- Favori yayıncılar ve son girilen odalar ----------
// Oda kapanınca silindiği için favori "oda" değil "yayıncı"dır; yayıncı yeni oda açınca listede açık görünür.
export const ACTIVE_ROOM_BY_HOST = `
  (SELECT json_build_object('id', r.id, 'name', r.name, 'roomType', r.room_type, 'seatCount', r.seat_count, 'locked', (r.password_hash IS NOT NULL),
      'memberCount', (SELECT COUNT(*)::int FROM room_members rm WHERE rm.room_id = r.id AND (rm.microphone OR rm.user_id NOT IN (SELECT id FROM active_ghosts))))
   FROM rooms r WHERE r.owner_id = h.host_id AND r.is_active = TRUE AND r.is_hidden = FALSE ORDER BY r.created_at DESC LIMIT 1)`;

export const MIC_EMOJI_COUNT = 24;

export async function releaseSeat(roomId, userId) {
  await query(`UPDATE room_members SET seat_index = NULL, microphone = FALSE WHERE room_id = $1 AND user_id = $2`, [roomId, userId]);
  await closeMicSessions(userId, roomId);
  await setCanPublish(roomId, userId, false);
  hub.broadcastRoom(roomId, { type: 'room_seat_changed', roomId, userId, seatIndex: null, microphone: false });
  // Hayalet (SWIP) kullanıcı mikrofondan inince yeniden görünmez olur: diğerlerinin dinleyici listesinden düşer.
  if (await isGhost(userId)) hub.broadcastRoom(roomId, { type: 'room_member_left', roomId, userId, ghost: true });
  await notifyNext(roomId).catch((e) => console.error('Mikrofon sırası hatası:', e.message));
}

// ---------- Mikrofon sırası ----------

// ---------- Moderasyon ----------
export async function moderationContext(roomId, actorId, targetId) {
  if (actorId === targetId) throw fail('Bu işlemi kendiniz üzerinde yapamazsınız.');
  const rows = (await query(
    `SELECT user_id, role FROM room_members WHERE room_id = $1 AND user_id = ANY($2::uuid[])`, [roomId, [actorId, targetId]],
  )).rows;
  const actor = rows.find((x) => x.user_id === actorId);
  if (!actor) throw fail('Önce odaya girin.', 403);
  const target = rows.find((x) => x.user_id === targetId) || null;
  return { actor, target };
}

export async function assertStaffShield(actorUser, targetId) {
  const t = (await query(`SELECT system_role FROM users WHERE id = $1`, [targetId])).rows[0];
  const msg = roomStaffShield(actorUser.system_role, t?.system_role);
  if (msg) throw fail(msg, 403);
}

export async function assertNotImmune(actor, targetId, actorUser) {
  // Yönetim / yardımcı admin dokunulmazlığı: oda sahibi de aşamaz.
  if (actorUser) await assertStaffShield(actorUser, targetId);
  if (actor.role === 'owner') return; // oda sahibi her zaman işlem yapabilir
  const f = await featuresFor(targetId);
  if (f.kickImmunity) throw fail('Bu kullanıcı yetkililer tarafından uzaklaştırılamaz (WIP ayrıcalığı).', 403);
}

export async function removeFromRoom(roomId, targetId, type, extra = {}) {
  noteKick(roomId, targetId);
  await leaveRoom(targetId, roomId);
  hub.sendToUser(targetId, { type, roomId, ...extra });
  await removeParticipant(roomId, targetId);
}

// Odadan atma: kişi odadan çıkarılır ve KICK_BAN_HOURS (24) saat bu odaya giremez. Yasak kalıcı odaya bağlıdır (oda
// kapatılıp açılsa da sürer); oda sahibi / yardımcı sahip "Yönetici kayıtları"ndan kaldırabilir.

// Sayı tahtası oturumu (Yoho): başlat / durdur / geçmiş. Oda sahibi, yardımcı sahip ve moderatör yönetir.
export async function scoreboardManager(roomId, userId) {
  await activeRoom(roomId);
  const me = await memberOf(roomId, userId);
  if (!me || !SEAT_MANAGERS.includes(me.role)) throw fail('Sayı tahtasını yalnızca oda yöneticileri yönetebilir.', 403);
}

// Alt rota dosyaları tek elden import eder: aynı paketi her dosyada ayrı ayrı import etmek yerine
// ortak kapı. Adlar bölmeden önceki ile birebir aynı.
export { CUSTOM_KEY, IMAGE_TYPES, KICK_BAN_HOURS, Router, SCOREBOARD_DURATIONS, SUPPORTED_SEATS, USER_PUBLIC_COLUMNS, USER_PUBLIC_JOINS, activeBan, activeEntranceEffect, activeSession, banFromRoom, banMessage, broadcastQueue, canManage, checkPassword, cleanPublic, cleanTags, clientIp, closeMicSessions, closeRoom, consumeMicInvite, crypto, endSession, express, fail, featuresFor, grantMicInvite, hasMicInvite, hashPassword, hitLimit, hub, isGhost, isQueued, leaveOtherRooms, leaveRoom, leaveStaleRooms, livekitToken, loadPublicRow, loadPublicRows, logModeration, moderationRows, newRoomNumber, noteKick, noteTask, noteViolation, notifyFriendsRoomOpen, notifyNext, oneOf, openMicSession, optionalAuth, publicUser, query, queueOf, recentlyKicked, refreshGhost, removeFromQueue, removeParticipant, removeUpload, requireAuth, requireFeature, resolveRoomTheme, roomStaffShield, roomUser, saveUpload, scoreboardOf, sessionHistory, sessionView, setCanPublish, skinUntil, startSession, text, tx, unbanFromRoom, userLimit, uuid };
