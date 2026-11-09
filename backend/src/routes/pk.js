import { Router } from 'express';
import { query, tx } from '../database.js';
import { requireAuth } from '../auth.js';
import { userLimit } from '../firewall.js';
import { fail, uuid } from '../http.js';
import { hub } from '../realtime.js';
import { token as livekitToken } from '../livekit.js';
import { validDuration } from '../pk_logic.js';
import { pkView, broadcastPk, activePkOfRoom, finishPk } from '../services/pk.js';
import { ROOM_PK_DURATIONS, openRoomPk, beginRoomPk, finishRoomPk, roomPkView, activeRoomPk } from '../services/room_pk.js';

export const router = Router();
router.use(requireAuth);

async function roomRow(id, run = query) {
  const r = (await run(`SELECT id, owner_id, name FROM rooms WHERE id = $1 AND is_active = TRUE`, [id])).rows[0];
  if (!r) throw fail('Oda bulunamadı.', 404);
  return r;
}

// Meydan okuma: yalnızca kendi odanızın sahibi başka bir odaya PK daveti gönderir.
router.post('/pk/challenge', userLimit('pk', 20, 60e3), async (req, res) => {
  const roomId = uuid(req.body?.roomId, 'Oda');
  const targetRoomId = uuid(req.body?.targetRoomId, 'Hedef oda');
  const durationSeconds = Number(req.body?.durationSeconds ?? 300);
  if (!validDuration(durationSeconds)) throw fail('PK süresi 5, 10, 15 ya da 30 dakika olmalı.');
  if (roomId === targetRoomId) throw fail('Kendi odanıza meydan okuyamazsınız.');
  const id = await tx(async (c) => {
    // Kilit sırası sabit (id sıralı) → deadlock yok.
    const rooms = (await c.query(`SELECT id, owner_id, room_type FROM rooms WHERE id = ANY($1::uuid[]) AND is_active = TRUE ORDER BY id FOR UPDATE`, [[roomId, targetRoomId]])).rows;
    const mine = rooms.find((r) => r.id === roomId); const theirs = rooms.find((r) => r.id === targetRoomId);
    if (!mine || !theirs) throw fail('Oda bulunamadı.', 404);
    // Odalar arası PK görüntülü yayınlar arasındadır; sesli odada oda içi PK kullanılır.
    if (mine.room_type !== 'video' || theirs.room_type !== 'video') throw fail('PK daveti yalnızca görüntülü yayınlar arasında gönderilir.', 409);
    if (mine.owner_id !== req.user.id) throw fail('PK başlatmak için oda sahibi olmalısınız.', 403);
    if (await activePkOfRoom(roomId, (t, p) => c.query(t, p))) throw fail('Odanızda zaten bir PK var.', 409);
    if (await activePkOfRoom(targetRoomId, (t, p) => c.query(t, p))) throw fail('Hedef odada zaten bir PK var.', 409);
    if ((await c.query(`SELECT 1 FROM room_pk WHERE room_id = ANY($1::uuid[]) AND status IN ('preparing','active')`, [[roomId, targetRoomId]])).rowCount) {
      throw fail('Odalardan birinde oda içi PK sürüyor.', 409);
    }
    const b = (await c.query(
      `INSERT INTO pk_battles(room_a, room_b, host_a, host_b, duration_seconds) VALUES($1,$2,$3,$4,$5) RETURNING id`,
      [roomId, targetRoomId, mine.owner_id, theirs.owner_id, durationSeconds],
    )).rows[0];
    return b.id;
  });
  const view = await pkView(id);
  hub.sendToUser(view.b.host.id, { type: 'pk_invite', pk: view });
  await broadcastPk(id);
  res.status(201).json({ pk: view });
});

router.post('/pk/:id/respond', userLimit('pk', 20, 60e3), async (req, res) => {
  const id = uuid(req.params.id, 'PK');
  const accept = req.body?.accept === true;
  await tx(async (c) => {
    const b = (await c.query(`SELECT * FROM pk_battles WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!b || b.status !== 'pending') throw fail('Davet bulunamadı veya süresi doldu.', 404);
    if (b.host_b !== req.user.id) throw fail('Bu daveti yanıtlama yetkiniz yok.', 403);
    if (accept && (await c.query(`SELECT 1 FROM room_pk WHERE room_id = ANY($1::uuid[]) AND status IN ('preparing','active')`, [[b.room_a, b.room_b]])).rowCount) {
      throw fail('Odalardan birinde oda içi PK sürüyor; önce onu bitirin.', 409);
    }
    if (accept) {
      await c.query(
        `UPDATE pk_battles SET status = 'active', started_at = NOW(), ends_at = NOW() + ($2::int * INTERVAL '1 second') WHERE id = $1`,
        [id, b.duration_seconds],
      );
    } else {
      await c.query(`UPDATE pk_battles SET status = 'declined', finished_at = NOW() WHERE id = $1`, [id]);
    }
  });
  await broadcastPk(id);
  res.json({ ok: true, accepted: accept });
});

// Bekleyen daveti geri çek (davet eden) veya süren PK'yı erken bitir (iki oda sahibinden biri).
router.post('/pk/:id/cancel', async (req, res) => {
  const id = uuid(req.params.id, 'PK');
  const b = (await query(`SELECT * FROM pk_battles WHERE id = $1`, [id])).rows[0];
  if (!b || !['pending', 'active'].includes(b.status)) throw fail('PK bulunamadı.', 404);
  if (![b.host_a, b.host_b].includes(req.user.id)) throw fail('Bu işlem için yetkiniz yok.', 403);
  if (b.status === 'pending') {
    await query(`UPDATE pk_battles SET status = 'cancelled', finished_at = NOW() WHERE id = $1 AND status = 'pending'`, [id]);
    await broadcastPk(id);
  } else {
    await finishPk(id);
  }
  res.json({ ok: true });
});

router.get('/rooms/:roomId/pk', async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  const room = (await query(`SELECT owner_id, is_hidden FROM rooms WHERE id = $1`, [roomId])).rows[0];
  if (room?.is_hidden && room.owner_id !== req.user.id
    && !(await query(`SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2`, [roomId, req.user.id])).rowCount) {
    throw fail('Oda bulunamadı.', 404);
  }
  const id = await activePkOfRoom(roomId);
  res.json({ pk: id ? await pkView(id) : null });
});

// PK için aday odalar: açık, PK'sı olmayan, gizli olmayan odalar.
router.get('/pk/rooms', async (req, res) => {
  const r = await query(
    `SELECT r.id, r.name, r.owner_id, u.username, u.display_name, u.is_hidden,
            (SELECT COUNT(*)::int FROM room_members m WHERE m.room_id = r.id AND (m.microphone OR m.user_id NOT IN (SELECT id FROM active_ghosts))) AS members
     FROM rooms r JOIN users u ON u.id = r.owner_id
     WHERE r.is_active = TRUE AND r.is_hidden = FALSE AND r.owner_id <> $1 AND r.room_type = 'video'
       AND NOT EXISTS (SELECT 1 FROM pk_battles b WHERE (b.room_a = r.id OR b.room_b = r.id) AND b.status IN ('pending','active'))
       AND NOT EXISTS (SELECT 1 FROM room_pk q WHERE q.room_id = r.id AND q.status IN ('preparing','active'))
     ORDER BY members DESC, r.created_at DESC LIMIT 50`,
    [req.user.id],
  );
  res.json({ rooms: r.rows.map((x) => ({ id: x.id, name: x.name, ownerId: x.owner_id, ownerName: x.is_hidden ? 'Gizli Kullanıcı' : (x.display_name || x.username), memberCount: x.members })) });
});

// ---------------- Görüntülü PK: rakip yayının görüntüsü ----------------
// Süren PK'daki iki odadan birinin üyesine, KARŞI odanın yayınını izlemek için yalnızca izleme (yayın yok, görünmez) anahtarı.
// Uygulama bununla rakip yayına ikinci bir bağlantı açar; bölünmüş ekranın sağında rakip yayıncı görünür ve sesi duyulur.
router.post('/pk/:id/peer-token', userLimit('pk_peer', 30, 60e3), async (req, res) => {
  const id = uuid(req.params.id, 'PK');
  const b = (await query(`SELECT room_a, room_b, host_a, host_b, status FROM pk_battles WHERE id = $1`, [id])).rows[0];
  if (!b || b.status !== 'active') throw fail('Süren PK bulunamadı.', 404);
  // Uygulama kendi odasını bildirir (iki PK odasının da üyesi görünebilir: odalar arası geçişte üyelik birkaç dakika kalır).
  const mine = req.body?.roomId ? uuid(req.body.roomId, 'Oda') : null;
  if (!mine || ![b.room_a, b.room_b].includes(mine)) throw fail('Bu PK sizin odanızda değil.', 403);
  if (!(await query(`SELECT 1 FROM room_members WHERE user_id = $1 AND room_id = $2`, [req.user.id, mine])).rowCount) {
    throw fail('Önce odaya girin.', 403);
  }
  const other = mine === b.room_a ? b.room_b : b.room_a;
  if ((await query(`SELECT 1 FROM room_blocks WHERE room_id = $1 AND blocked_user_id = $2`, [other, req.user.id])).rowCount) {
    throw fail('Rakip odadan engellendiğiniz için rakip yayını izleyemezsiniz.', 403);
  }
  const jwt = await livekitToken({ identity: `pk-${req.user.id}`, name: 'PK izleyici', room: other, canPublish: false, hidden: true });
  res.json({ token: jwt, url: process.env.LIVEKIT_URL, roomId: other, hostId: mine === b.room_a ? b.host_b : b.host_a });
});

// ---------------- Sesli oda içi PK ----------------
// Oda sahibi veya yardımcı sahip başlatır / bitirir. Süre 15, 30 ya da 60 dk. mode: neutral (oda sahibi hakem) | partisan.
async function roomStaffRole(roomId, userId) {
  const r = (await query(
    `SELECT r.owner_id, r.room_type, (SELECT role FROM room_members m WHERE m.room_id = r.id AND m.user_id = $2) AS role
     FROM rooms r WHERE r.id = $1 AND r.is_active = TRUE`, [roomId, userId],
  )).rows[0];
  if (!r) throw fail('Oda bulunamadı.', 404);
  const ok = r.owner_id === userId || r.role === 'cohost';
  return { ok, room: r };
}

router.post('/rooms/:roomId/room-pk', userLimit('pk', 20, 60e3), async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  const { ok, room } = await roomStaffRole(roomId, req.user.id);
  if (!ok) throw fail('PK\'yı oda sahibi veya yardımcı sahip başlatabilir.', 403);
  if (room.room_type !== 'audio') throw fail('Oda içi PK sesli odalarda açılır; görüntülü yayında rakip yayına PK daveti gönderin.', 409);
  const durationSeconds = Number(req.body?.durationSeconds);
  if (!ROOM_PK_DURATIONS.includes(durationSeconds)) throw fail('PK süresi 15, 30 ya da 60 dakika olmalı.');
  const mode = req.body?.mode === 'partisan' ? 'partisan' : 'neutral';
  const ownerTeam = req.body?.ownerTeam === 'blue' ? 'blue' : 'red';
  const pk = await openRoomPk({ roomId, userId: req.user.id, durationSeconds, mode, ownerTeam });
  res.status(201).json({ pk });
});

// "Başla": Hazırlanıyor durumundaki turu başlatır (3-2-1 ve VS animasyonu herkeste oynar).
router.post('/room-pk/:id/start', userLimit('pk', 20, 60e3), async (req, res) => {
  const id = uuid(req.params.id, 'PK');
  const p = (await query(`SELECT room_id, status FROM room_pk WHERE id = $1`, [id])).rows[0];
  if (!p || p.status !== 'preparing') throw fail('Başlatılacak PK turu bulunamadı.', 404);
  const { ok } = await roomStaffRole(p.room_id, req.user.id);
  if (!ok) throw fail('PK\'yı oda sahibi veya yardımcı sahip başlatabilir.', 403);
  res.json({ pk: await beginRoomPk(id) });
});

router.post('/room-pk/:id/end', userLimit('pk', 20, 60e3), async (req, res) => {
  const id = uuid(req.params.id, 'PK');
  const p = (await query(`SELECT room_id, status FROM room_pk WHERE id = $1`, [id])).rows[0];
  if (!p || !['preparing', 'active'].includes(p.status)) throw fail('Açık PK bulunamadı.', 404);
  const { ok } = await roomStaffRole(p.room_id, req.user.id);
  if (!ok) throw fail('PK\'yı oda sahibi veya yardımcı sahip bitirebilir.', 403);
  // cancel: true → PK modu kapanır (açık tur sonuçsuz); yoksa tur o anki skorla biter, yeni tur "Hazırlanıyor" açılır.
  const cancel = req.body?.cancel === true;
  const done = await finishRoomPk(id, { cancelled: cancel });
  // Tur tam bu anda süresi dolup bittiyse yeni tur açılmış olabilir: "PK modunu kapat" onu da kapatsın.
  if (cancel && !done) {
    const open = await activeRoomPk(p.room_id);
    if (open) await finishRoomPk(open.id, { cancelled: true });
  }
  res.json({ ok: true });
});

router.get('/rooms/:roomId/room-pk', async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  const room = (await query(`SELECT owner_id, is_hidden FROM rooms WHERE id = $1`, [roomId])).rows[0];
  if (room?.is_hidden && room.owner_id !== req.user.id
    && !(await query(`SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2`, [roomId, req.user.id])).rowCount) {
    throw fail('Oda bulunamadı.', 404);
  }
  const p = await activeRoomPk(roomId);
  res.json({ pk: p ? await roomPkView(p.id) : null, durations: ROOM_PK_DURATIONS });
});
