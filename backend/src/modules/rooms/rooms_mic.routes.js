// rooms — mic. Ortak yardımcılar: rooms.shared.js
import { Router } from 'express';
import { setPublishPermission } from '../../infrastructure/livekit/livekit.js';
import { publishPolicy } from './publish_policy.rules.js';
import { MIC_EMOJI_COUNT, SEAT_MANAGERS, activeRoom, broadcastQueue, consumeMicInvite, fail, hasMicInvite, hub, isGhost, loadPublicRow, memberOf, noteTask, notifyNext, openMicSession, query, queueOf, releaseSeat, removeFromQueue, requireAuth, roomUser, tx, userLimit, uuid } from './rooms.shared.js';

export const router = Router();

// ---------- Mikrofon / koltuk ----------
router.post('/:roomId/mic/take', requireAuth, userLimit('mic', 60, 60e3), async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  const userId = req.user.id;
  const room = await activeRoom(roomId);
  const member = await memberOf(roomId, userId);
  if (!member) throw fail('Önce odaya girin.', 403);
  // İstek modu ve canlı (tekli) görüntülü yayın: yetkili olmayanlar koltuğa yalnızca davetle (yetkili onayı) çıkar.
  const live = room.layout === 'live';
  if ((room.mic_request || live) && member.seat_index === null && !SEAT_MANAGERS.includes(member.role) && !hasMicInvite(roomId, userId)) {
    throw fail(live ? 'Konuk olmak için alttaki ∞ düğmesinden yayıncıya istek gönderin.' : 'Bu odada mikrofona çıkmak için istek göndermelisiniz.', 409);
  }

  const wasSeated = member.seat_index !== null;
  const seatIndex = await tx(async (c) => {
    await c.query(`SELECT id FROM rooms WHERE id = $1 FOR UPDATE`, [roomId]); // koltuk atamalarını sıraya sokar
    const others = (await c.query(
      `SELECT seat_index FROM room_members WHERE room_id = $1 AND seat_index IS NOT NULL AND user_id <> $2`, [roomId, userId],
    )).rows;
    const taken = new Set(others.map((x) => x.seat_index));
    let target = req.body?.seatIndex;
    if (target === undefined || target === null) {
      if (member.seat_index !== null) return member.seat_index;
      const first = member.role === 'owner' ? 0 : 1;
      target = undefined;
      const lockedNow = SEAT_MANAGERS.includes(member.role) ? [] : (room.locked_seats ?? []);
      for (let i = first; i < room.seat_count; i += 1) if (!taken.has(i) && !lockedNow.includes(i)) { target = i; break; }
      if (target === undefined) throw fail('Boş mikrofon yok.', 409);
    } else {
      target = Number(target);
      if (!Number.isInteger(target) || target < 0 || target >= room.seat_count) throw fail('Geçersiz koltuk.');
      if (target === 0 && member.role !== 'owner') throw fail('Bu koltuk oda sahibine ayrılmıştır.', 403);
      if (taken.has(target)) throw fail('Koltuk dolu.', 409);
      // Susturulan kişi başka koltuğa geçerek susturmadan kurtulamaz (yetkililer hariç).
      const mutedNow = room.muted_seats ?? [];
      if (member.seat_index !== null && mutedNow.includes(member.seat_index) && !mutedNow.includes(target) && !SEAT_MANAGERS.includes(member.role)) {
        throw fail('Koltuğun susturuldu; başka koltuğa geçemezsin.', 403);
      }
      if ((room.locked_seats ?? []).includes(target) && !SEAT_MANAGERS.includes(member.role)) throw fail('Bu koltuk kilitli.', 403);
    }
    await c.query(`UPDATE room_members SET seat_index = $3, microphone = TRUE WHERE room_id = $1 AND user_id = $2`, [roomId, userId, target]);
    if (!wasSeated) await openMicSession(userId, roomId, (t, p) => c.query(t, p));
    return target;
  });
  // Mikten mike geçiş hızlı: kişi zaten mikrofondaysa yayın izni ve mikrofon süresi zaten açık; yalnızca koltuk değişir
  // ve herkese hemen duyurulur.
  // Yayın izni yeni koltuğa göre (susturulmuş koltuğa geçen ya da oradan çıkan yönetici dahil). Duyurudan ÖNCE: uygulama
  // koltuk olayını alınca mikrofonu açar; izin o anda hazır olsun.
  const policy = publishPolicy(room, { seat_index: seatIndex });
  if (wasSeated) {
    await setPublishPermission(roomId, userId, policy);
    hub.broadcastRoom(roomId, { type: 'room_seat_changed', roomId, userId, seatIndex, microphone: true });
    return res.json({ ok: true, seatIndex });
  }
  // Hayalet kullanıcı mikrofona çıkınca görünür olur: önce odaya "girmiş" gibi duyurulur (giriş efekti olmadan).
  if (await isGhost(userId)) {
    const row = await loadPublicRow(userId);
    hub.broadcastRoom(roomId, { type: 'room_member_joined', roomId, user: roomUser(row, null), entranceEffect: null, silent: true });
  }
  await setPublishPermission(roomId, userId, policy);
  hub.broadcastRoom(roomId, { type: 'room_seat_changed', roomId, userId, seatIndex, microphone: true });
  consumeMicInvite(roomId, userId);
  await removeFromQueue(roomId, userId);
  noteTask(userId, 'mic');
  res.json({ ok: true, seatIndex });
});

// Mikrofon emojisi: koltuktaki kişi 3 hareketli emojiden birini gönderir, koltuğunda birkaç saniye oynar.
/** Mikrofon emojisi sayısı (uygulamadaki assets/images/mic_emoji_1..N.webp). */

router.post('/:roomId/mic-emoji', requireAuth, userLimit('mic_emoji', 20, 60e3), async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  const emoji = Number(req.body?.emoji);
  if (!Number.isInteger(emoji) || emoji < 1 || emoji > MIC_EMOJI_COUNT) throw fail('Geçersiz emoji.');
  const me = await memberOf(roomId, req.user.id);
  if (!me || me.seat_index === null) throw fail('Emoji göndermek için mikrofonda olmalısınız.', 403);
  hub.broadcastRoom(roomId, { type: 'room_mic_emoji', roomId, userId: req.user.id, emoji });
  res.json({ ok: true });
});

// ---------- Mikrofon sırası ----------
router.get('/:roomId/mic/queue', requireAuth, async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  await activeRoom(roomId);
  if (!(await memberOf(roomId, req.user.id))) throw fail('Önce odaya girin.', 403);
  res.json({ queue: await queueOf(roomId) });
});

router.post('/:roomId/mic/queue', requireAuth, userLimit('mic_queue', 30, 60e3), async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  await activeRoom(roomId);
  const me = await memberOf(roomId, req.user.id);
  if (!me) throw fail('Önce odaya girin.', 403);
  if (me.seat_index !== null) throw fail('Zaten mikrofondasınız.', 409);
  const n = (await query(`SELECT COUNT(*)::int AS n FROM room_mic_queue WHERE room_id = $1`, [roomId])).rows[0].n;
  if (n >= 50) throw fail('Sıra dolu.', 409);
  await query(`INSERT INTO room_mic_queue(room_id, user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, [roomId, req.user.id]);
  await broadcastQueue(roomId);
  await notifyNext(roomId).catch(() => {}); // boş koltuk zaten varsa hemen davet edilir
  res.json({ ok: true, queue: await queueOf(roomId) });
});

router.delete('/:roomId/mic/queue', requireAuth, async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  await removeFromQueue(roomId, req.user.id);
  res.json({ ok: true, queue: await queueOf(roomId) });
});

// Yetkili: mikrofon isteğini reddeder (kullanıcıyı sıradan çıkarır).

// Yetkili: mikrofon isteğini reddeder (kullanıcıyı sıradan çıkarır).
router.delete('/:roomId/mic/queue/:userId', requireAuth, async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  const targetId = uuid(req.params.userId, 'Kullanıcı');
  await activeRoom(roomId);
  const me = await memberOf(roomId, req.user.id);
  if (!me || !SEAT_MANAGERS.includes(me.role)) throw fail('Mikrofon isteklerini yalnızca oda yetkilileri yönetir.', 403);
  consumeMicInvite(roomId, targetId); // kabul edip vazgeçtiyse verilen davet de geçersiz olur
  if (await removeFromQueue(roomId, targetId)) hub.sendToUser(targetId, { type: 'mic_request_declined', roomId });
  res.json({ ok: true, queue: await queueOf(roomId) });
});

router.post('/:roomId/mic/leave', requireAuth, async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  if (!(await memberOf(roomId, req.user.id))) throw fail('Önce odaya girin.', 403);
  await releaseSeat(roomId, req.user.id);
  res.json({ ok: true });
});

// ---------- Moderasyon ----------
