// rooms — moderation. Ortak yardımcılar: rooms.shared.js
import { Router } from 'express';
import { KICK_BAN_HOURS, SEAT_MANAGERS, activeBan, activeRoom, assertNotImmune, assertStaffShield, banFromRoom, canManage, fail, grantMicInvite, hub, isQueued, loadPublicRows, logModeration, memberOf, moderationContext, moderationRows, oneOf, publicUser, query, releaseSeat, removeFromRoom, requireAuth, roomUser, syncProfile, unbanFromRoom, userLimit, uuid } from './rooms.shared.js';

export const router = Router();

router.post('/:roomId/members/:userId/mic-off', requireAuth, userLimit('moderate', 60, 60e3), async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  const targetId = uuid(req.params.userId, 'Kullanıcı');
  const micRoom = await activeRoom(roomId);
  const { actor, target } = await moderationContext(roomId, req.user.id, targetId);
  if (!target) throw fail('Kullanıcı odada değil.', 404);
  if (!canManage(actor.role, target.role, 'moderate')) throw fail('Bu işlem için yetkiniz yok.', 403);
  await assertNotImmune(actor, targetId, req.user);
  await releaseSeat(roomId, targetId);
  await logModeration(micRoom, req.user.id, targetId, 'mic_off');
  res.json({ ok: true });
});

// Odadan atma: kişi odadan çıkarılır ve KICK_BAN_HOURS (24) saat bu odaya giremez. Yasak kalıcı odaya bağlıdır (oda
// kapatılıp açılsa da sürer); oda sahibi / yardımcı sahip "Yönetici kayıtları"ndan kaldırabilir.
router.post('/:roomId/members/:userId/kick', requireAuth, userLimit('moderate', 60, 60e3), async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  const targetId = uuid(req.params.userId, 'Kullanıcı');
  const room = await activeRoom(roomId);
  const { actor, target } = await moderationContext(roomId, req.user.id, targetId);
  if (!target) throw fail('Kullanıcı odada değil.', 404);
  if (!canManage(actor.role, target.role, 'moderate')) throw fail('Bu işlem için yetkiniz yok.', 403);
  await assertNotImmune(actor, targetId, req.user);
  await banFromRoom(room, targetId, 'kick', req.user.id);
  await removeFromRoom(roomId, targetId, 'room_kicked', { hours: KICK_BAN_HOURS });
  await logModeration(room, req.user.id, targetId, 'kick', { hours: KICK_BAN_HOURS });
  res.json({ ok: true, hours: KICK_BAN_HOURS });
});

router.post('/:roomId/members/:userId/block', requireAuth, userLimit('moderate', 60, 60e3), async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  const targetId = uuid(req.params.userId, 'Kullanıcı');
  const room = await activeRoom(roomId);
  const { actor, target } = await moderationContext(roomId, req.user.id, targetId);
  // Odada olmayan kişinin rolü: oda sahibi veya kalıcı oda yöneticisi olabilir (çevrimdışı yardımcı sahibi moderatör engelleyemesin).
  let targetRole = target?.role;
  if (!targetRole) {
    if (room.owner_id === targetId) targetRole = 'owner';
    else targetRole = (await query(`SELECT role FROM room_staff WHERE owner_id = $1 AND room_type = $2 AND user_id = $3`, [room.owner_id, room.room_type, targetId])).rows[0]?.role ?? 'user';
  }
  if (!canManage(actor.role, targetRole, 'moderate')) throw fail('Bu işlem için yetkiniz yok.', 403);
  await assertNotImmune(actor, targetId, req.user);
  await query(
    `INSERT INTO room_blocks(room_id, blocked_user_id, blocked_by_user_id) VALUES($1,$2,$3) ON CONFLICT (room_id, blocked_user_id) DO NOTHING`,
    [roomId, targetId, req.user.id],
  );
  // Kalıcı kayıt: engel eskiden oda kimliğine bağlıydı, oda kapatılıp açılınca kayboluyordu.
  await banFromRoom(room, targetId, 'block', req.user.id);
  if (target) await removeFromRoom(roomId, targetId, 'room_blocked');
  await logModeration(room, req.user.id, targetId, 'block');
  res.json({ ok: true });
});

// Yasağı kaldır: engelleme (süresiz) ve atılma (24 saat) yasağının ikisi de kalkar.

// Yasağı kaldır: engelleme (süresiz) ve atılma (24 saat) yasağının ikisi de kalkar.
router.delete('/:roomId/blocks/:userId', requireAuth, userLimit('moderate', 60, 60e3), async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  const targetId = uuid(req.params.userId, 'Kullanıcı');
  const room = await activeRoom(roomId);
  const me = await memberOf(roomId, req.user.id);
  if (!me || !['owner', 'cohost', 'moderator'].includes(me.role)) throw fail('Bu işlem için yetkiniz yok.', 403);
  // Moderatör yalnızca kendi koyduğu yasağı kaldırır; sahibin/yardımcı sahibin yasağını kaldıramaz.
  if (me.role === 'moderator') {
    const b = (await query(`SELECT blocked_by_user_id FROM room_blocks WHERE room_id = $1 AND blocked_user_id = $2`, [roomId, targetId])).rows[0];
    const ban = await activeBan(room, targetId);
    if ((b && b.blocked_by_user_id !== req.user.id) || (ban && ban.banned_by !== req.user.id)) {
      throw fail('Bu yasağı yalnızca oda sahibi veya yardımcı sahip kaldırabilir.', 403);
    }
  }
  const old = await query(`DELETE FROM room_blocks WHERE room_id = $1 AND blocked_user_id = $2`, [roomId, targetId]);
  const ban = await unbanFromRoom(room, targetId);
  if (old.rowCount || ban) await logModeration(room, req.user.id, targetId, 'unban', { kind: ban?.kind ?? 'block' });
  res.json({ ok: true, removed: Boolean(old.rowCount || ban) });
});

// Yönetici kayıtları (oda sahibi ve yardımcı sahip): süren yasaklar + son işlemler (atma, engelleme, yasak kaldırma,
// susturma, mikrofondan indirme, rol). Kayıtlar kalıcı odaya aittir; oda kapatılıp açılsa da görünür.

// Yönetici kayıtları (oda sahibi ve yardımcı sahip): süren yasaklar + son işlemler (atma, engelleme, yasak kaldırma,
// susturma, mikrofondan indirme, rol). Kayıtlar kalıcı odaya aittir; oda kapatılıp açılsa da görünür.
router.get('/:roomId/moderation', requireAuth, async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  const room = await activeRoom(roomId);
  const me = await memberOf(roomId, req.user.id);
  if (!me || !['owner', 'cohost'].includes(me.role)) throw fail('Yönetici kayıtlarını yalnızca oda sahibi ve yardımcı sahip görebilir.', 403);
  const { bans, logs } = await moderationRows(room);
  const ids = new Set();
  for (const b of bans) { ids.add(b.user_id); if (b.banned_by) ids.add(b.banned_by); }
  for (const l of logs) { if (l.actor_id) ids.add(l.actor_id); if (l.target_id) ids.add(l.target_id); }
  const users = new Map((await loadPublicRows([...ids])).map((u) => [u.id, publicUser(u, req.user.id, { alias: true })]));
  const banned = new Set(bans.map((b) => b.user_id));
  res.json({
    kickHours: KICK_BAN_HOURS,
    bans: bans.map((b) => ({
      user: users.get(b.user_id) ?? null, userId: b.user_id, kind: b.kind, until: b.until, createdAt: b.created_at,
      by: b.banned_by ? (users.get(b.banned_by) ?? null) : null,
    })),
    logs: logs.map((l) => ({
      id: String(l.id), action: l.action, detail: l.detail ?? {}, createdAt: l.created_at,
      actor: l.actor_id ? (users.get(l.actor_id) ?? null) : null,
      target: l.target_id ? (users.get(l.target_id) ?? null) : null,
      targetId: l.target_id ?? null,
      // Bu kişinin yasağı hâlâ sürüyor mu (kayıt satırında "Yasağı kaldır" düğmesi için).
      banned: l.target_id ? banned.has(l.target_id) : false,
    })),
  });
});

// Koltuk kilitle / aç (oda sahibi ve moderatörler). Dolu koltuk kilitlenirse oturan kişi koltuktan indirilir (yetki yeterliyse).

// Koltuk kilitle / aç (oda sahibi ve moderatörler). Dolu koltuk kilitlenirse oturan kişi koltuktan indirilir (yetki yeterliyse).
router.post('/:roomId/seats/:index/lock', requireAuth, userLimit('moderate', 60, 60e3), async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  const room = await activeRoom(roomId);
  const idx = Number(req.params.index);
  if (!Number.isInteger(idx) || idx < 1 || idx >= room.seat_count) throw fail('Bu koltuk kilitlenemez.');
  const me = await memberOf(roomId, req.user.id);
  if (!me || !SEAT_MANAGERS.includes(me.role)) throw fail('Koltukları yalnızca oda sahibi ve moderatörler kilitleyebilir.', 403);
  const locked = req.body?.locked !== false;
  const occupant = (await query(`SELECT user_id, role FROM room_members WHERE room_id = $1 AND seat_index = $2`, [roomId, idx])).rows[0];
  if (locked && occupant && occupant.user_id !== req.user.id && !canManage(me.role, occupant.role, 'moderate')) throw fail('Koltuktaki kişiyi indirme yetkiniz yok.', 403);
  if (locked && occupant && occupant.user_id !== req.user.id) await assertStaffShield(req.user, occupant.user_id);
  const r = await query(
    locked
      ? `UPDATE rooms SET locked_seats = (SELECT ARRAY(SELECT DISTINCT x FROM unnest(locked_seats || $2::int) x ORDER BY x)) WHERE id = $1 RETURNING locked_seats`
      : `UPDATE rooms SET locked_seats = array_remove(locked_seats, $2::int) WHERE id = $1 RETURNING locked_seats`,
    [roomId, idx],
  );
  if (locked && occupant && occupant.user_id !== req.user.id) await releaseSeat(roomId, occupant.user_id);
  await syncProfile(await activeRoom(roomId));
  hub.broadcastRoom(roomId, { type: 'room_seats_locked', roomId, lockedSeats: r.rows[0].locked_seats });
  res.json({ ok: true, lockedSeats: r.rows[0].locked_seats });
});

// Koltuk sustur / aç (oda sahibi, yardımcı sahip, moderatör). Oturan kişi koltukta kalır; susturulmuş koltukta
// mikrofon açılmaz (uygulama kapatır) ve koltukta "susturuldu" işareti görünür. Boş koltuk da susturulabilir.

// Koltuk sustur / aç (oda sahibi, yardımcı sahip, moderatör). Oturan kişi koltukta kalır; susturulmuş koltukta
// mikrofon açılmaz (uygulama kapatır) ve koltukta "susturuldu" işareti görünür. Boş koltuk da susturulabilir.
router.post('/:roomId/seats/:index/mute', requireAuth, userLimit('moderate', 60, 60e3), async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  const room = await activeRoom(roomId);
  const idx = Number(req.params.index);
  if (!Number.isInteger(idx) || idx < 0 || idx >= room.seat_count) throw fail('Geçersiz koltuk.');
  const me = await memberOf(roomId, req.user.id);
  if (!me || !SEAT_MANAGERS.includes(me.role)) throw fail('Koltukları yalnızca oda sahibi ve yöneticiler susturabilir.', 403);
  const muted = req.body?.muted !== false;
  const occupant = (await query(`SELECT user_id, role FROM room_members WHERE room_id = $1 AND seat_index = $2`, [roomId, idx])).rows[0];
  if (occupant && occupant.user_id === req.user.id && !muted && me.role !== 'owner') throw fail('Susturulan koltuğunu kendin açamazsın.', 403);
  if (occupant && occupant.user_id !== req.user.id) {
    if (!canManage(me.role, occupant.role, 'moderate')) throw fail('Bu kişiyi susturma yetkiniz yok.', 403);
    if (muted) await assertNotImmune(me, occupant.user_id, req.user);
  }
  if (idx === 0 && me.role !== 'owner') throw fail('Oda sahibinin koltuğunu yalnızca oda sahibi susturabilir.', 403);
  const r = await query(
    muted
      ? `UPDATE rooms SET muted_seats = (SELECT ARRAY(SELECT DISTINCT x FROM unnest(muted_seats || $2::int) x ORDER BY x)) WHERE id = $1 RETURNING muted_seats`
      : `UPDATE rooms SET muted_seats = array_remove(muted_seats, $2::int) WHERE id = $1 RETURNING muted_seats`,
    [roomId, idx],
  );
  hub.broadcastRoom(roomId, { type: 'room_seats_muted', roomId, mutedSeats: r.rows[0].muted_seats, seatIndex: idx, muted });
  res.json({ ok: true, mutedSeats: r.rows[0].muted_seats });
});

// Mikrofona davet: davet edilen kişi kabul ederse mic/take ile oturur.

// Mikrofona davet: davet edilen kişi kabul ederse mic/take ile oturur.
router.post('/:roomId/members/:userId/mic-invite', requireAuth, userLimit('mic_invite', 30, 60e3), async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  const targetId = uuid(req.params.userId, 'Kullanıcı');
  const room = await activeRoom(roomId);
  const { actor, target } = await moderationContext(roomId, req.user.id, targetId);
  if (!SEAT_MANAGERS.includes(actor.role)) throw fail('Mikrofona yalnızca oda sahibi ve moderatörler davet edebilir.', 403);
  if (!target) throw fail('Kullanıcı odada değil.', 404);
  const t = (await query(`SELECT seat_index FROM room_members WHERE room_id = $1 AND user_id = $2`, [roomId, targetId])).rows[0];
  if (t.seat_index !== null) throw fail('Kullanıcı zaten mikrofonda.', 409);
  let seatIndex = req.body?.seatIndex ?? null;
  if (seatIndex !== null) {
    seatIndex = Number(seatIndex);
    if (!Number.isInteger(seatIndex) || seatIndex < 1 || seatIndex >= room.seat_count) throw fail('Geçersiz koltuk.');
  }
  grantMicInvite(roomId, targetId);
  // requested: kişi kendisi istek göndermişti (konuk isteği kabul edildi) → uygulama sormadan oturtur.
  const requested = await isQueued(roomId, targetId);
  // Gizli kullanıcı olan yetkilinin gerçek adı açığa çıkmasın.
  const inviter = roomUser(req.user, targetId);
  hub.sendToUser(targetId, { type: 'mic_invite', roomId, seatIndex, requested, fromUserId: inviter?.id ?? null, fromName: inviter?.displayName ?? 'Oda yetkilisi' });
  res.json({ ok: true });
});

router.post('/:roomId/members/:userId/role', requireAuth, userLimit('moderate', 60, 60e3), async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  const targetId = uuid(req.params.userId, 'Kullanıcı');
  const role = oneOf(req.body?.role, ['user', 'moderator', 'cohost'], 'Rol');
  await activeRoom(roomId);
  const { actor, target } = await moderationContext(roomId, req.user.id, targetId);
  if (!target) throw fail('Kullanıcı odada değil.', 404);
  if (!canManage(actor.role, target.role, 'role', role)) throw fail('Bu işlem için yetkiniz yok.', 403);
  // Rol vermek/almak bir yaptırım değil: yönetim hesabı ve yardımcı adminler de oda yöneticisi yapılabilir.
  // (Atma, susturma, mikrofondan indirme gibi komutlarda dokunulmazlık aynen sürer.)
  await query(`UPDATE room_members SET role = $3 WHERE room_id = $1 AND user_id = $2`, [roomId, targetId, role]);
  // Yöneticiler oda kapanıp yeniden açılsa da korunur.
  const roomRow = await activeRoom(roomId);
  if (role === 'user') await query(`DELETE FROM room_staff WHERE owner_id = $1 AND room_type = $2 AND user_id = $3`, [roomRow.owner_id, roomRow.room_type, targetId]);
  else await query(
    `INSERT INTO room_staff(owner_id, room_type, user_id, role) VALUES($1,$2,$3,$4) ON CONFLICT (owner_id, room_type, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [roomRow.owner_id, roomRow.room_type, targetId, role],
  );
  hub.broadcastRoom(roomId, { type: 'room_role_changed', roomId, userId: targetId, role });
  await logModeration(roomRow, req.user.id, targetId, 'role', { role, from: target.role });
  res.json({ ok: true, role });
});

// ---------- Hediye sayı tahtası (mikrofon koltuğu başına) ----------
