// rooms — scoreboard. Ortak yardımcılar: rooms.shared.js
import { Router } from 'express';
import { SCOREBOARD_DURATIONS, activeRoom, activeSession, endSession, fail, hub, loadPublicRows, memberOf, query, requireAuth, roomUser, scoreboardManager, scoreboardOf, sessionHistory, sessionView, startSession, userLimit, uuid } from './rooms.shared.js';

export const router = Router();

// ---------- Hediye sayı tahtası (mikrofon koltuğu başına) ----------
router.get('/:roomId/scoreboard', requireAuth, async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  await activeRoom(roomId);
  if (!(await memberOf(roomId, req.user.id))) throw fail('Önce odaya girin.', 403);
  const s = await activeSession(roomId);
  let starter = null;
  if (s?.started_by) {
    const u = (await loadPublicRows([s.started_by]))[0];
    starter = u ? roomUser(u) : null;
  }
  res.json({ scoreboard: await scoreboardOf(roomId), session: s ? sessionView(s, starter) : null });
});

// Sayı tahtası oturumu (Yoho): başlat / durdur / geçmiş. Oda sahibi, yardımcı sahip ve moderatör yönetir.

router.post('/:roomId/scoreboard/start', requireAuth, userLimit('scoreboard_start', 10, 60e3), async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  await scoreboardManager(roomId, req.user.id);
  const minutes = Number(req.body?.minutes ?? 0);
  if (!SCOREBOARD_DURATIONS.includes(minutes)) throw fail('Geçersiz süre.');
  const session = await startSession(roomId, req.user.id, {
    minutes,
    resetOnSeatLeave: req.body?.resetOnSeatLeave !== false,
    resetOnRoomLeave: req.body?.resetOnRoomLeave === true,
  });
  res.json({ session });
});

router.post('/:roomId/scoreboard/stop', requireAuth, userLimit('scoreboard_stop', 10, 60e3), async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  await scoreboardManager(roomId, req.user.id);
  const session = await endSession(roomId, req.user.id);
  if (!session) throw fail('Süren bir sayım yok.', 409);
  res.json({ session });
});

router.get('/:roomId/scoreboard/history', requireAuth, async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  await activeRoom(roomId);
  if (!(await memberOf(roomId, req.user.id))) throw fail('Önce odaya girin.', 403);
  res.json({ sessions: await sessionHistory(roomId) });
});

router.post('/:roomId/scoreboard/reset', requireAuth, userLimit('scoreboard_reset', 10, 60e3), async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  await activeRoom(roomId);
  const me = await memberOf(roomId, req.user.id);
  if (!me || !['owner', 'cohost'].includes(me.role)) throw fail('Sayaçları yalnızca oda sahibi ve yardımcı sahip sıfırlayabilir.', 403);
  await query(`DELETE FROM room_gift_totals WHERE room_id = $1`, [roomId]);
  hub.broadcastRoom(roomId, { type: 'room_scoreboard', roomId, scoreboard: [], reset: true });
  res.json({ ok: true });
});

// ---------- LiveKit ----------
