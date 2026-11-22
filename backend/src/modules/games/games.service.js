import { query, tx } from '../../infrastructure/database/database.js';
import { hub } from '../../infrastructure/websocket/realtime.js';
import * as ludo from './ludo.rules.js';
import * as tek from './tek.rules.js';
import { loadPublicRows } from '../users/users.service.js';
import { roomUser } from '../../shared/utils/views.js';
import { fail } from '../../shared/errors/http.js';
import { nonOverlapping } from '../../infrastructure/queue/ticker.js';
import { getConfig } from '../system/app_config.service.js';

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
  const v = await gameViewBase(gameId, run, viewerId);
  if (v) v.entrySilver = String(await entryFee(v.type ?? 'ludo'));
  return v;
}

async function gameViewBase(gameId, run, viewerId) {
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
    // Biriken zar değerleri: 6 atınca taş oynatılmıyor, değer kuyruğa yazılıp tekrar
    // atılıyor. İstemci bu kuyruğu gösteriyor ("bir 6 ve bir 3 oynayacaksın").
    // Kuyruğun BAŞI oynanacak değer, yani dice === pending[0].
    pending: st && Array.isArray(st.pending) ? st.pending.slice() : [],
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

// ---- Gümüş girişi ----
// Ludo ve TEK'e katılmak Gümüş ister (ayardan: ludoEntrySilver / tekEntrySilver; 0 = ücretsiz). Ücret oyuncu listeye
// girerken tek işlemde düşer ve oyuncu satırına yazılır; oyun BAŞLAMADAN çıkan ya da iptal edilen oyunda iade edilir.
export async function entryFee(gameType) {
  const cfg = await getConfig();
  const v = Number(gameType === 'tek' ? cfg.tekEntrySilver : cfg.ludoEntrySilver);
  return Number.isFinite(v) && v > 0 ? BigInt(Math.floor(v)) : 0n;
}

/** Oyuncu satırı eklendikten sonra çağrılır (aynı işlem içinde). Gümüş yetmezse hata verir → satır da geri alınır. */
export async function chargeEntry(c, { gameId, userId, gameType, fee }) {
  if (fee <= 0n) return null;
  const w = (await c.query(`SELECT silver FROM users WHERE id = $1 FOR UPDATE`, [userId])).rows[0];
  if (!w || BigInt(w.silver) < fee) throw fail(`Katılmak için ${fee.toLocaleString('tr-TR')} Gümüş gerekir; Gümüşün yetersiz.`, 402);
  const after = BigInt(w.silver) - fee;
  await c.query(`UPDATE users SET silver = $2, updated_at = NOW() WHERE id = $1`, [userId, after.toString()]);
  await c.query(`UPDATE room_game_players SET silver_paid = $3 WHERE game_id = $1 AND user_id = $2`, [gameId, userId, fee.toString()]);
  await c.query(
    `INSERT INTO silver_transactions(user_id, amount, balance_after, type, reference, description) VALUES($1,$2,$3,'game_entry',$4,$5)`,
    [userId, (-fee).toString(), after.toString(), gameId, `${gameType === 'tek' ? 'TEK' : 'Ludo'} girişi`],
  );
  return after;
}

/** Bekleyen oyundan çıkan / iptal edilen oyuncuların Gümüşünü iade eder ve satırlarını siler (userIds yoksa hepsi). */
export async function refundAndRemove(c, gameId, userIds = null) {
  const rows = (await c.query(
    `DELETE FROM room_game_players WHERE game_id = $1 ${userIds ? 'AND user_id = ANY($2::uuid[])' : ''} RETURNING user_id, silver_paid`,
    userIds ? [gameId, userIds] : [gameId],
  )).rows;
  const out = [];
  for (const r of rows) {
    const paid = BigInt(r.silver_paid);
    if (paid <= 0n) continue;
    const w = (await c.query(`UPDATE users SET silver = silver + $2, updated_at = NOW() WHERE id = $1 RETURNING silver`, [r.user_id, paid.toString()])).rows[0];
    if (!w) continue;
    await c.query(
      `INSERT INTO silver_transactions(user_id, amount, balance_after, type, reference, description) VALUES($1,$2,$3,'game_refund',$4,'Oyun girişi iadesi')`,
      [r.user_id, paid.toString(), w.silver, gameId],
    );
    out.push({ userId: r.user_id, silver: String(w.silver) });
  }
  return out;
}

export function pushSilver(list) {
  for (const x of list) if (x?.silver != null) hub.sendToUser(x.userId, { type: 'wallet', silver: String(x.silver) });
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
    pushSilver(await tx((c) => refundAndRemove(c, g.id, [userId])));
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
  const refunds = [];
  const ids = await tx(async (c) => {
    // Henüz başlamamış oyunların girişleri iade edilir; oynanmakta olan oyunda giriş yanar.
    const waiting = (await c.query(`SELECT id FROM room_games WHERE room_id = $1 AND status = 'waiting' FOR UPDATE`, [roomId])).rows;
    for (const w of waiting) refunds.push(...(await refundAndRemove(c, w.id)));
    const r = await c.query(
      `UPDATE room_games SET status = 'cancelled', finished_at = NOW() WHERE room_id = $1 AND status IN ('waiting','playing') RETURNING id`, [roomId],
    );
    return r.rows.map((x) => x.id);
  });
  pushSilver(refunds);
  for (const id of ids) await broadcastGame(id);
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
