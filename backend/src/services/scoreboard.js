import { query, tx } from '../database.js';
import { hub } from '../realtime.js';
import { loadPublicRows } from './users.js';
import { roomUser } from '../views.js';

export async function scoreboardOf(roomId, run = query) {
  const r = await run(
    `SELECT t.user_id, t.total_coins, t.total_count, rm.seat_index
     FROM room_gift_totals t LEFT JOIN room_members rm ON rm.room_id = t.room_id AND rm.user_id = t.user_id
     WHERE t.room_id = $1 ORDER BY t.total_coins DESC LIMIT 50`, [roomId],
  );
  return r.rows.map((x) => ({ userId: x.user_id, coins: String(x.total_coins), count: String(x.total_count), seatIndex: x.seat_index }));
}

// ---------------- Sayı tahtası oturumları (v2.123, Yoho gibi) ----------------
// Başlat: süre (elle ya da 5–60 dk) + sıfırlama kuralları (koltuktan inince / odadan çıkınca; veritabanı tetikleyicisi
// uygular). Başlarken sayaçlar sıfırlanır. Durdurunca (ya da süre dolunca) sıralama kaydedilir ve herkese duyurulur.

export const SCOREBOARD_DURATIONS = [0, 5, 10, 15, 30, 60]; // dakika; 0 = elle kontrollü

export const sessionView = (s, starter = null) => s && {
  id: s.id, startedAt: s.started_at, endsAt: s.ends_at, status: s.status,
  resetOnSeatLeave: s.reset_on_seat_leave, resetOnRoomLeave: s.reset_on_room_leave,
  endedAt: s.ended_at ?? null, results: s.results ?? [],
  startedBy: starter,
};

export async function activeSession(roomId, run = query) {
  return (await run(`SELECT * FROM room_scoreboard_sessions WHERE room_id = $1 AND status = 'active'`, [roomId])).rows[0] ?? null;
}

/** Sıralama: oturumun puanları (en fazla 20), kullanıcı bilgileriyle. */
async function rankingOf(roomId, run) {
  const rows = (await run(
    `SELECT user_id, total_coins FROM room_gift_totals WHERE room_id = $1 AND total_coins > 0 ORDER BY total_coins DESC, updated_at ASC LIMIT 20`,
    [roomId],
  )).rows;
  const users = new Map((await loadPublicRows(rows.map((r) => r.user_id), run)).map((u) => [u.id, u]));
  return rows.map((r, i) => {
    const u = users.get(r.user_id);
    return { rank: i + 1, userId: r.user_id, score: String(r.total_coins), user: u ? roomUser(u) : null };
  });
}

export async function startSession(roomId, userId, { minutes, resetOnSeatLeave, resetOnRoomLeave }) {
  const s = await tx(async (c) => {
    const run = (t, p) => c.query(t, p);
    // Süren oturum varsa önce sonuçlanır (aynı anda tek oturum).
    const cur = (await c.query(`SELECT * FROM room_scoreboard_sessions WHERE room_id = $1 AND status = 'active' FOR UPDATE`, [roomId])).rows[0];
    if (cur) {
      const results = await rankingOf(roomId, run);
      await c.query(`UPDATE room_scoreboard_sessions SET status = 'ended', ended_at = NOW(), ended_by = $2, results = $3 WHERE id = $1`,
        [cur.id, userId, JSON.stringify(results)]);
    }
    await c.query(`DELETE FROM room_gift_totals WHERE room_id = $1`, [roomId]);
    await c.query(`UPDATE rooms SET scoreboard_enabled = TRUE WHERE id = $1`, [roomId]);
    return (await c.query(
      `INSERT INTO room_scoreboard_sessions(room_id, started_by, ends_at, reset_on_seat_leave, reset_on_room_leave)
       VALUES($1, $2, CASE WHEN $3::int > 0 THEN NOW() + ($3::int * INTERVAL '1 minute') END, $4, $5) RETURNING *`,
      [roomId, userId, minutes, resetOnSeatLeave, resetOnRoomLeave],
    )).rows[0];
  });
  const starter = (await loadPublicRows([userId]))[0];
  const view = sessionView(s, starter ? roomUser(starter) : null);
  hub.broadcastRoom(roomId, { type: 'room_scoreboard', roomId, scoreboard: [], reset: true });
  hub.broadcastRoom(roomId, { type: 'scoreboard_session', roomId, action: 'start', session: view, minutes });
  return view;
}

/** Oturumu bitirir; sıralamayı kaydeder ve duyurur. by: durduran (süre dolduysa null). */
export async function endSession(roomId, by = null, { expiredOnly = false } = {}) {
  const ended = await tx(async (c) => {
    const cur = (await c.query(
      `SELECT * FROM room_scoreboard_sessions WHERE room_id = $1 AND status = 'active' ${expiredOnly ? 'AND ends_at IS NOT NULL AND ends_at <= NOW()' : ''} FOR UPDATE`,
      [roomId],
    )).rows[0];
    if (!cur) return null;
    const results = await rankingOf(roomId, (t, p) => c.query(t, p));
    return (await c.query(
      `UPDATE room_scoreboard_sessions SET status = 'ended', ended_at = NOW(), ended_by = $2, results = $3 WHERE id = $1 RETURNING *`,
      [cur.id, by, JSON.stringify(results)],
    )).rows[0];
  });
  if (!ended) return null;
  let byUser = null;
  if (by) {
    const u = (await loadPublicRows([by]))[0];
    byUser = u ? roomUser(u) : null;
  }
  const view = sessionView(ended);
  hub.broadcastRoom(roomId, { type: 'scoreboard_session', roomId, action: 'end', session: view, by: byUser, expired: !by });
  return view;
}

export async function sessionHistory(roomId, limit = 20) {
  const rows = (await query(
    `SELECT * FROM room_scoreboard_sessions WHERE room_id = $1 AND status = 'ended' ORDER BY started_at DESC LIMIT $2`, [roomId, limit],
  )).rows;
  return rows.map((s) => sessionView(s));
}

/** Süresi dolan oturumları kapatır (30 sn'de bir). */
export function startScoreboardTicker() {
  let busy = false;
  const t = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const due = (await query(`SELECT room_id FROM room_scoreboard_sessions WHERE status = 'active' AND ends_at IS NOT NULL AND ends_at <= NOW() LIMIT 100`)).rows;
      for (const d of due) await endSession(d.room_id, null, { expiredOnly: true }).catch((e) => console.error('Sayı tahtası kapatma:', e.message));
    } catch (e) {
      console.error('Sayı tahtası zamanlayıcısı:', e.message);
    } finally {
      busy = false;
    }
  }, 15e3);
  t.unref();
  return t;
}
