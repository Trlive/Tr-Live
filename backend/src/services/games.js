import { query, tx } from '../database.js';
import { hub } from '../realtime.js';
import * as ludo from '../ludo.js';
import * as tek from '../tek.js';
import { loadPublicRows } from './users.js';
import { roomUser } from '../views.js';
import { fail } from '../http.js';
import { nonOverlapping } from '../ticker.js';

// Oyun türleri: saf motor + oyuncu sınırı. Yeni oyun eklerken buraya ve 074 geçişindeki CHECK listesine yazılır.
export const GAME_TYPES = {
  ludo: { engine: ludo, min: 2, max: 4, event: 'room_game_state' },
  // TEK durumu ayrı olay adıyla yayınlanır: eski sürümlerdeki Ludo ekranı tanımadığı bir oyunu çizmeye çalışmasın.
  tek: { engine: tek, min: tek.MIN_PLAYERS, max: tek.MAX_PLAYERS, event: 'room_tek_state' },
};
export const engineOf = (g) => (GAME_TYPES[g.game_type] ?? GAME_TYPES.ludo).engine;

// TEK görünümü. Herkese giden kısımda eller YOKTUR (yalnızca kart sayıları); [viewerId] verilirse o kişinin kendi eli ve
// yapabilecekleri "me" altında eklenir. Yayınlarda (broadcastGame) viewerId verilmez.
async function tekView(g, waiting, run, viewerId) {
  const st = g.state && g.state.players ? g.state : null;
  const ids = st ? st.players.map((p) => p.userId) : waiting.map((p) => p.user_id);
  const users = new Map((await loadPublicRows(ids, run)).map((u) => [u.id, u]));
  const userOf = (id) => roomUser(users.get(id));
  const pub = st ? tek.publicView(st) : null;
  const players = st
    ? pub.players.map((p) => ({ user: userOf(p.userId), seat: p.seat, cards: p.cards, out: p.out, auto: p.auto }))
    : waiting.map((p, i) => ({ user: userOf(p.user_id), seat: i, cards: 0, out: false, auto: 0 }));
  const playing = st && g.status === 'playing';
  const view = {
    id: g.id, roomId: g.room_id, type: 'tek', status: g.status, createdBy: g.created_by, winnerId: g.winner_id,
    minPlayers: tek.MIN_PLAYERS, maxPlayers: tek.MAX_PLAYERS,
    players,
    turnSeat: playing ? pub.turnSeat : null,
    turnUserId: playing && pub.turnSeat !== null ? st.players[pub.turnSeat]?.userId ?? null : null,
    top: pub?.top ?? null, color: pub?.color ?? null, dir: pub?.dir ?? 1, dealerSeat: pub?.dealerSeat ?? null,
    phase: playing ? pub.phase : null, drawCount: pub?.drawCount ?? 0, challengeBy: playing ? pub.challengeBy : null,
    turnMsLeft: playing ? pub.turnMsLeft : null, turnMs: tek.TURN_MS,
    roundMsLeft: playing ? pub.roundMsLeft : null, lastRound: playing ? pub.lastRound : false,
    seq: pub?.seq ?? 0, last: pub?.last ?? [],
    result: g.status === 'finished' && pub?.result ? pub.result.map((r) => ({ ...r, user: userOf(r.userId) })) : null,
  };
  if (viewerId) {
    const mine = st ? tek.privateView(st, viewerId) : null;
    const idx = st ? -1 : waiting.findIndex((p) => p.user_id === viewerId);
    view.me = mine ?? { seat: idx >= 0 ? idx : null, out: false, hand: [], playable: [], canDraw: false, canPass: false, drawn: null, mustAnswer: false };
    view.me.joined = st ? mine !== null : idx >= 0;
    view.me.isCreator = g.created_by === viewerId;
  }
  return view;
}

export async function gameView(gameId, run = query, viewerId = null) {
  const g = (await run(`SELECT * FROM room_games WHERE id = $1`, [gameId])).rows[0];
  if (!g) return null;
  const waiting = (await run(`SELECT user_id, seat FROM room_game_players WHERE game_id = $1 ORDER BY seat`, [gameId])).rows;
  if (g.game_type === 'tek') return tekView(g, waiting, run, viewerId);
  const st = g.state && g.state.players ? g.state : null;
  const ids = st ? st.players.map((p) => p.userId) : waiting.map((p) => p.user_id);
  const users = new Map((await loadPublicRows(ids, run)).map((u) => [u.id, u]));
  const players = st
    ? st.players.map((p) => ({ user: roomUser(users.get(p.userId)), seat: p.seat, color: ludo.COLORS[p.seat], auto: p.auto }))
    : waiting.map((p) => ({ user: roomUser(users.get(p.user_id)), seat: p.seat, color: ludo.COLORS[p.seat], auto: 0 }));
  const turnSeat = st && g.status === 'playing' ? st.turn : null;
  // Mod: oyun başlamadan önce kurulurken seçilen değer (state.options), başladıktan sonra oyun durumundaki değer.
  const mode = st ? ludo.modeOf(st) : (ludo.MODES.includes(g.state?.options?.mode) ? g.state.options.mode : 'classic');
  const me = viewerId ? {
    seat: players.find((p) => p.user?.id === viewerId)?.seat ?? null,
    joined: players.some((p) => p.user?.id === viewerId),
    isCreator: g.created_by === viewerId,
  } : undefined;
  return {
    id: g.id, roomId: g.room_id, type: g.game_type, status: g.status, createdBy: g.created_by, winnerId: g.winner_id,
    mode, minPlayers: 2, maxPlayers: 4,
    items: mode === 'items' ? ludo.ITEM_CELLS : null,
    frozen: st?.frozen ?? [], kills: st?.kills ?? {},
    seq: st ? (st.seq ?? st.moves ?? 0) : 0,
    turnMsLeft: st?.deadline && g.status === 'playing' ? Math.max(0, st.deadline - Date.now()) : null, turnMs: ludo.TURN_MS,
    ...(me ? { me } : {}),
    players,
    turnSeat,
    turnUserId: st && turnSeat !== null ? st.players.find((p) => p.seat === turnSeat)?.userId ?? null : null,
    dice: st ? st.dice : null,
    legal: st && g.status === 'playing' && st.dice !== null ? ludo.legalMoves(st, st.turn, st.dice) : [],
    tokens: st ? st.tokens : null,
    deadlineMs: st?.deadline ?? null,
    secondsLeft: st?.deadline ? Math.max(0, Math.ceil((st.deadline - Date.now()) / 1000)) : null,
    log: st ? st.log.slice(-5) : [],
  };
}

export async function broadcastGame(gameId) {
  const view = await gameView(gameId);
  if (view) hub.broadcastRoom(view.roomId, { type: (GAME_TYPES[view.type] ?? GAME_TYPES.ludo).event, game: view });
  return view;
}

export async function openGameOfRoom(roomId, run = query) {
  return (await run(`SELECT * FROM room_games WHERE room_id = $1 AND status IN ('waiting','playing')`, [roomId])).rows[0] || null;
}

/** Oyun satırı beklenen türde değilse hata verir (bir oyunun hamle ucu başka oyunun durumunu bozmasın). */
export function assertGameType(g, type) {
  if (g.game_type !== type) throw fail('Bu işlem bu oyun için geçerli değil.', 409);
}

// Kilitli satır üzerinde saf motoru çalıştırıp durumu yazar. fn(state, game) → { state, extra }.
export async function mutateGame(gameId, fn) {
  const out = await tx(async (c) => {
    const g = (await c.query(`SELECT * FROM room_games WHERE id = $1 FOR UPDATE`, [gameId])).rows[0];
    if (!g) throw fail('Oyun bulunamadı.', 404);
    if (g.status !== 'playing') throw fail('Oyun şu an oynanmıyor.', 409);
    const res = fn(g.state, g);
    const st = res.state;
    if (st.winnerSeat !== null) {
      const winner = st.players.find((p) => p.seat === st.winnerSeat);
      await c.query(`UPDATE room_games SET state = $2, status = 'finished', finished_at = NOW(), winner_id = $3 WHERE id = $1`, [gameId, JSON.stringify(st), winner?.userId ?? null]);
    } else {
      await c.query(`UPDATE room_games SET state = $2 WHERE id = $1`, [gameId, JSON.stringify(st)]);
    }
    return res;
  });
  await broadcastGame(gameId);
  return out;
}

export async function startGame(gameId, requesterId) {
  const out = await tx(async (c) => {
    const g = (await c.query(`SELECT * FROM room_games WHERE id = $1 FOR UPDATE`, [gameId])).rows[0];
    if (!g || g.status !== 'waiting') throw fail('Oyun başlatılamaz.', 409);
    if (g.created_by !== requesterId) throw fail('Oyunu yalnızca kuran başlatabilir.', 403);
    const ps = (await c.query(`SELECT user_id FROM room_game_players WHERE game_id = $1 ORDER BY seat`, [gameId])).rows;
    if (ps.length < 2) throw fail('En az 2 oyuncu gerekir.', 409);
    const ids = ps.map((p) => p.user_id);
    // Ludo modu oyun kurulurken seçilir ve bekleyen oyunun state.options alanında durur.
    const st = g.game_type === 'tek' ? tek.newGame(ids) : ludo.newGame(ids, Date.now(), g.state?.options ?? {});
    await c.query(`UPDATE room_games SET status = 'playing', state = $2, started_at = NOW() WHERE id = $1`, [gameId, JSON.stringify(st)]);
    return st;
  });
  await broadcastGame(gameId);
  return out;
}

// Oyuncu odadan çıkınca: bekleyen oyunda listeden silinir, oynanan oyunda oyundan elenir.
export async function forfeitUserInRoom(userId, roomId) {
  const g = await openGameOfRoom(roomId);
  if (!g) return;
  if (g.status === 'waiting') {
    if (g.created_by === userId) { await cancelRoomGame(roomId); return; }
    await query(`DELETE FROM room_game_players WHERE game_id = $1 AND user_id = $2`, [g.id, userId]);
    await broadcastGame(g.id);
    return;
  }
  if (!g.state?.players?.some((p) => p.userId === userId)) return;
  try {
    await mutateGame(g.id, (state, row) => ({ state: engineOf(row).forfeit(state, userId) }));
  } catch (error) {
    if (error.status !== 409) throw error;
  }
}

export async function cancelRoomGame(roomId) {
  const r = await query(
    `UPDATE room_games SET status = 'cancelled', finished_at = NOW() WHERE room_id = $1 AND status IN ('waiting','playing') RETURNING id`, [roomId],
  );
  for (const g of r.rows) await broadcastGame(g.id);
}

// Süresi dolan sıralar için otomatik oyun (AFK koruması).
export function startGameTicker() {
  const timer = setInterval(nonOverlapping(async () => {
    try {
      const due = await query(
        `SELECT id FROM room_games WHERE status = 'playing' AND (state->>'deadline')::bigint <= $1`, [Date.now()],
      );
      for (const g of due.rows) {
        // Süre, satır kilitlendikten sonra yeniden denetlenir: oyuncu tam o anda oynadıysa otomatik hamle yapılmaz.
        try {
          await mutateGame(g.id, (state, row) => (state.deadline != null && Number(state.deadline) <= Date.now() ? engineOf(row).autoPlay(state) : { state }));
        } catch (e) { if (e.status !== 409) console.error('Oyun otomatik hamle hatası:', e.message); }
      }
    } catch (error) {
      console.error('Oyun zamanlayıcı hatası:', error.message);
    }
  }), 2000);
  timer.unref();
  return timer;
}
