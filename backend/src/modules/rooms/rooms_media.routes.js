// rooms — media. Ortak yardımcılar: rooms.shared.js
import { Router } from 'express';
import { activeRoom, fail, livekitToken, query, requireAuth, userLimit, uuid } from './rooms.shared.js';

export const router = Router();

// ---------- LiveKit ----------
router.post('/:roomId/livekit-token', requireAuth, userLimit('livekit_token', 40, 60e3), async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  await activeRoom(roomId);
  const m = (await query(
    `SELECT rm.user_id, rm.microphone, u.username, u.display_name, u.is_hidden
     FROM room_members rm JOIN users u ON u.id = rm.user_id WHERE rm.room_id = $1 AND rm.user_id = $2`,
    [roomId, req.user.id],
  )).rows[0];
  if (!m) throw fail('Önce odaya girin.', 403);
  const jwt = await livekitToken({
    identity: m.user_id,
    name: m.is_hidden ? 'Gizli Kullanıcı' : (m.display_name || m.username),
    room: roomId,
    canPublish: m.microphone === true,
  });
  res.json({ token: jwt, url: process.env.LIVEKIT_URL });
});
