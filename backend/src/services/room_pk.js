// Sesli oda içi PK (Yoho tarzı): odadaki mikrofon koltukları Kırmızı / Mavi takıma ayrılır; PK süresince takım
// koltuklarındaki kişilere gelen hediyelerin Elmas değeri takım puanı olur. Süre bitince çok puanlı takım kazanır.
// Oda sahibi (koltuk 1, index 0): tarafsız modda hakemdir (puanı sayılmaz), taraflı modda seçtiği takımdadır.
import { query, tx } from '../database.js';
import { hub } from '../realtime.js';
import { loadPublicRows } from './users.js';
import { publicUser } from '../views.js';
import { remainingSeconds } from '../pk_logic.js';
import { fail } from '../http.js';

// Sesli oda PK süreleri: 15, 30, 60 dakika.
export const ROOM_PK_DURATIONS = [900, 1800, 3600];
// PK modu yalnızca 9'lu koltuk düzeninde: oda sahibi + 4 Kırmızı + 4 Mavi.
export const ROOM_PK_SEATS = 9;
// "Başla"dan sonra 3-2-1 geri sayım ve VS animasyonu için süre (puan bu arada da sayılır, süre bundan sonra işler).
export const ROOM_PK_INTRO_SECONDS = 5;

/** Kırmızı takımın son koltuk indeksi: koltuk 1..split kırmızı, split+1..n-1 mavi (koltuk 0 = oda sahibi). */
export const redSplit = (seatCount) => Math.ceil((Number(seatCount) - 1) / 2);

/**
 * Kişinin takımı ('red' | 'blue' | null). Oda sahibi hangi koltukta olursa olsun: tarafsızda hakem (null), taraflıda
 * seçtiği takım. Diğerleri koltuğa göre: 1..redSplit kırmızı, sonrası mavi (koltuk 0 sahibin koltuğu, takımsız).
 */
export function teamOfSeat(seatIndex, pk, { isOwner = false } = {}) {
  if (isOwner) return pk.mode === 'partisan' ? pk.owner_team : null;
  if (seatIndex === null || seatIndex === undefined || seatIndex < 1 || seatIndex >= pk.seat_count) return null;
  return seatIndex <= redSplit(pk.seat_count) ? 'red' : 'blue';
}

export function decideTeam(red, blue) {
  const r = BigInt(red); const b = BigInt(blue);
  return r > b ? 'red' : b > r ? 'blue' : 'draw';
}

/** Açık tur (Hazırlanıyor ya da süren). */
export async function activeRoomPk(roomId, run = query) {
  return (await run(`SELECT * FROM room_pk WHERE room_id = $1 AND status IN ('preparing','active') LIMIT 1`, [roomId])).rows[0] ?? null;
}

/** Kalan süre (giriş animasyonu hariç) ve girişten kalan saniye: "Başla"dan sonraki ilk 5 sn'de süre işlemez. */
function clockOf(p) {
  if (p.status !== 'active') return { remainingSeconds: 0, introSeconds: 0 };
  const left = remainingSeconds(p.ends_at);
  return { remainingSeconds: Math.min(left, p.duration_seconds), introSeconds: Math.max(0, left - p.duration_seconds) };
}

export async function roomPkView(id, run = query) {
  const p = (await run(`SELECT * FROM room_pk WHERE id = $1`, [id])).rows[0];
  if (!p) return null;
  const ownerId = (await run(`SELECT owner_id FROM rooms WHERE id = $1`, [p.room_id])).rows[0]?.owner_id ?? null;
  const pts = (await run(
    `SELECT kind, team, user_id, points FROM room_pk_points WHERE pk_id = $1 ORDER BY points DESC`, [id],
  )).rows;
  const ids = new Set(pts.map((x) => x.user_id));
  if (p.mvp_user_id) ids.add(p.mvp_user_id);
  const users = new Map((await loadPublicRows([...ids], run)).map((u) => [u.id, u]));
  const list = (kind, team, n) => pts.filter((x) => x.kind === kind && x.team === team).slice(0, n)
    .map((x) => ({ user: publicUser(users.get(x.user_id)), points: String(x.points) }));
  const side = (team) => ({
    score: String(team === 'red' ? p.score_red : p.score_blue),
    supporters: list('support', team, 3),
    stars: list('receive', team, 3),
  });
  return {
    id: p.id, roomId: p.room_id, ownerId, status: p.status, mode: p.mode, ownerTeam: p.owner_team ?? null,
    seatCount: p.seat_count, redSplit: redSplit(p.seat_count), durationSeconds: p.duration_seconds,
    ...clockOf(p), startedAt: p.started_at, endsAt: p.ends_at,
    red: side('red'), blue: side('blue'), winner: p.winner ?? null,
    mvp: p.mvp_user_id && users.get(p.mvp_user_id) ? publicUser(users.get(p.mvp_user_id)) : null,
  };
}

/** started: yalnızca tur "Başla" ile yeni başladığında true (uygulama 3-2-1 ve VS animasyonunu buna göre oynatır). */
export async function broadcastRoomPk(id, { started = false } = {}) {
  const view = await roomPkView(id);
  if (view) hub.broadcastRoom(view.roomId, { type: 'room_pk_state', pk: view, started });
  return view;
}

/** PK modunu açar (oda sahibi / yardımcı sahip): tur "Hazırlanıyor" durumunda bekler. 9'lu koltuk düzeni gerekir. */
export async function openRoomPk({ roomId, userId, durationSeconds, mode, ownerTeam }) {
  const id = await tx(async (c) => {
    const room = (await c.query(`SELECT id, owner_id, room_type, seat_count FROM rooms WHERE id = $1 AND is_active = TRUE FOR UPDATE`, [roomId])).rows[0];
    if (!room) throw fail('Oda bulunamadı.', 404);
    if (room.seat_count !== ROOM_PK_SEATS) throw fail('PK modu yalnızca 9\'lu koltuk düzeninde açılır. Önce mikrofon modunu 9 yapın.', 409);
    if ((await c.query(`SELECT 1 FROM room_pk WHERE room_id = $1 AND status IN ('preparing','active')`, [roomId])).rowCount) {
      throw fail('Odada PK modu zaten açık.', 409);
    }
    if ((await c.query(`SELECT 1 FROM pk_battles WHERE (room_a = $1 OR room_b = $1) AND status IN ('pending','active')`, [roomId])).rowCount) {
      throw fail('Odada odalar arası bir PK var; önce onu bitirin.', 409);
    }
    return (await c.query(
      `INSERT INTO room_pk(room_id, started_by, mode, owner_team, seat_count, duration_seconds, status)
       VALUES($1,$2,$3,$4,$5,$6,'preparing') RETURNING id`,
      [roomId, userId, mode, mode === 'partisan' ? ownerTeam : null, room.seat_count, durationSeconds],
    )).rows[0].id;
  });
  return broadcastRoomPk(id);
}

/** "Başla": Hazırlanıyor → süren tur. Süre, 3-2-1 / VS girişinden sonra işlemeye başlar. */
export async function beginRoomPk(id) {
  const r = await query(
    `UPDATE room_pk SET status = 'active', started_at = NOW(),
       ends_at = NOW() + ((duration_seconds + $2::int) * INTERVAL '1 second')
     WHERE id = $1 AND status = 'preparing'
       AND EXISTS (SELECT 1 FROM rooms r WHERE r.id = room_pk.room_id AND r.is_active AND r.seat_count = ${ROOM_PK_SEATS})
     RETURNING id`, [id, ROOM_PK_INTRO_SECONDS],
  );
  if (!r.rowCount) throw fail('Başlatılacak PK turu bulunamadı.', 404);
  return broadcastRoomPk(id, { started: true });
}

/**
 * Bitirir: kazanan takım ve MVP (kazanan takımın en çok destekçisi; berabere ise genel en çok destekçi); ardından aynı
 * ayarlarla yeni "Hazırlanıyor" turu açılır (PK modu sürer). cancelled: PK modunu kapatır (açık tur sonuçsuz kapanır).
 * nextRound: false → yeni tur açılmaz (oda kapanırken).
 */
export async function finishRoomPk(id, { cancelled = false, nextRound = true } = {}) {
  let next = null;
  const done = await tx(async (c) => {
    const p = (await c.query(`SELECT * FROM room_pk WHERE id = $1 AND status IN ('preparing','active') FOR UPDATE`, [id])).rows[0];
    if (!p) return false;
    if (cancelled || p.status === 'preparing') {
      await c.query(`UPDATE room_pk SET status = 'cancelled', finished_at = NOW() WHERE id = $1`, [id]);
      return true;
    }
    const winner = decideTeam(p.score_red, p.score_blue);
    const mvp = (await c.query(
      `SELECT user_id FROM room_pk_points WHERE pk_id = $1 AND kind = 'support' AND ($2 = 'draw' OR team = $2)
       ORDER BY points DESC LIMIT 1`, [id, winner],
    )).rows[0]?.user_id ?? null;
    await c.query(`UPDATE room_pk SET status = 'finished', finished_at = NOW(), winner = $2, mvp_user_id = $3 WHERE id = $1`, [id, winner, mvp]);
    if (nextRound) {
      next = (await c.query(
        `INSERT INTO room_pk(room_id, started_by, mode, owner_team, seat_count, duration_seconds, status)
         SELECT room_id, started_by, mode, owner_team, seat_count, duration_seconds, 'preparing' FROM room_pk WHERE id = $1
           AND EXISTS (SELECT 1 FROM rooms r WHERE r.id = room_pk.room_id AND r.is_active AND r.seat_count = $2)
         RETURNING id`, [id, ROOM_PK_SEATS],
      )).rows[0]?.id ?? null;
    }
    return true;
  });
  if (done) await broadcastRoomPk(id);
  if (next) await broadcastRoomPk(next);
  return done;
}

/**
 * Hediye işlemi içinde (aynı transaction): alıcı PK takımındaki bir koltuktaysa puan yazılır.
 * points: alıcıya geçen Elmas · supportCoins: gönderenin harcadığı Coin. Kendine hediye sayılmaz.
 */
export async function scoreRoomPk(c, roomId, receiverId, senderId, points, supportCoins = points) {
  if (receiverId === senderId || BigInt(points) <= 0n) return null;
  // Kilitsiz okuma: takımsız alıcıda (dinleyici, hakem) PK satırı kilitlenmez, odadaki diğer hediyeler beklemez.
  const p = (await c.query(
    `SELECT p.*, r.owner_id FROM room_pk p JOIN rooms r ON r.id = p.room_id
     WHERE p.room_id = $1 AND p.status = 'active' AND p.ends_at > NOW()`, [roomId],
  )).rows[0];
  if (!p) return null;
  const isOwner = p.owner_id === receiverId;
  const seat = isOwner ? null : (await c.query(
    `SELECT seat_index FROM room_members WHERE room_id = $1 AND user_id = $2 AND microphone = TRUE`, [roomId, receiverId],
  )).rows[0]?.seat_index;
  const team = teamOfSeat(seat, p, { isOwner });
  if (!team) return null;
  // Puan yalnızca PK hâlâ sürüyorsa yazılır (bu arada biten PK'ya sayılmaz).
  const upd = await c.query(
    `UPDATE room_pk SET score_${team} = score_${team} + $2 WHERE id = $1 AND status = 'active' AND ends_at > NOW() RETURNING id`,
    [p.id, points.toString()],
  );
  if (!upd.rowCount) return null;
  const add = (kind, uid, v) => c.query(
    `INSERT INTO room_pk_points(pk_id, kind, team, user_id, points) VALUES($1,$2,$3,$4,$5)
     ON CONFLICT (pk_id, kind, team, user_id) DO UPDATE SET points = room_pk_points.points + EXCLUDED.points`,
    [p.id, kind, team, uid, v.toString()],
  );
  await add('support', senderId, supportCoins);
  await add('receive', receiverId, points);
  return p.id;
}

/** Zamanlayıcıdan (2 sn): süresi dolanları bitirir, sürenlere hafif skor / süre yayını yapar. */
export async function tickRoomPk() {
  const due = await query(`SELECT id FROM room_pk WHERE status = 'active' AND ends_at <= NOW()`);
  for (const p of due.rows) await finishRoomPk(p.id);
  const live = await query(`SELECT id, room_id, status, score_red, score_blue, ends_at, duration_seconds FROM room_pk WHERE status = 'active'`);
  for (const p of live.rows) {
    hub.broadcastRoom(p.room_id, {
      type: 'room_pk_tick', pkId: p.id, ...clockOf(p), red: String(p.score_red), blue: String(p.score_blue),
    });
  }
}

/** Oda kapanırken o anki skorla biter. */
export async function endRoomPkForRoom(roomId) {
  const p = await activeRoomPk(roomId);
  if (p) await finishRoomPk(p.id, { nextRound: false });
}
