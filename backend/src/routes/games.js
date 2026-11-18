import { Router } from 'express';
import { query, tx } from '../database.js';
import { requireAuth } from '../auth.js';
import { userLimit } from '../firewall.js';
import { fail, uuid } from '../http.js';
import * as ludo from '../ludo.js';
import * as tek from '../tek.js';
import { getConfig } from '../services/app_config.js';
import { gameView, broadcastGame, openGameOfRoom, mutateGame, startGame, GAME_TYPES, engineOf, assertGameType, entryFee, chargeEntry, refundAndRemove, pushSilver } from '../services/games.js';

export const router = Router();
router.use(requireAuth);

async function assertMember(roomId, userId) {
  const m = (await query(`SELECT role FROM room_members WHERE room_id = $1 AND user_id = $2`, [roomId, userId])).rows[0];
  if (!m) throw fail('Önce odaya girin.', 403);
  return m;
}

const MANAGERS = ['owner', 'cohost', 'moderator'];
const GAME_NAMES = { ludo: 'Ludo', tek: 'TEK' };

// Odadaki açık oyun. `type` verilmezse yalnızca Ludo döner (eski sürümlerdeki Ludo ekranı tanımadığı oyunu görmesin);
// `?type=tek` TEK oyununu, isteyenin kendi eliyle birlikte verir; `?type=any` hangisi açıksa onu (odadaki oyun balonu
// için). canManage: bu kişi oyun kurabilir mi.
router.get('/rooms/:roomId/game', userLimit('game_view', 240, 60e3), async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  const m = await assertMember(roomId, req.user.id);
  const any = req.query.type === 'any';
  const type = Object.hasOwn(GAME_TYPES, String(req.query.type)) ? String(req.query.type) : 'ludo';
  const g = await openGameOfRoom(roomId);
  const mine = g && (any || g.game_type === type);
  res.json({
    game: mine ? await gameView(g.id, query, req.user.id) : null,
    canManage: MANAGERS.includes(m.role),
    otherGame: g && !mine ? g.game_type : null,
  });
});

// Tek bir oyun (bitmiş olsa da): sonuç ekranı ve sayfanın kendini yenilemesi için. Eller yalnızca sahibine gider.
router.get('/games/:id', userLimit('game_view', 240, 60e3), async (req, res) => {
  const id = uuid(req.params.id, 'Oyun');
  const g = (await query(`SELECT room_id FROM room_games WHERE id = $1`, [id])).rows[0];
  if (!g) throw fail('Oyun bulunamadı.', 404);
  const m = await assertMember(g.room_id, req.user.id);
  res.json({ game: await gameView(id, query, req.user.id), canManage: MANAGERS.includes(m.role) });
});

// Oyun kurma: oda sahibi / yardımcı sahip / moderatör. Ücretsizdir, Coin bahsi yoktur.
router.post('/rooms/:roomId/games', userLimit('game_create', 10, 60e3), async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  const m = await assertMember(roomId, req.user.id);
  if (!MANAGERS.includes(m.role)) throw fail('Oyunu yalnızca oda yetkilileri kurabilir.', 403);
  const type = req.body?.type ?? 'ludo';
  if (!Object.hasOwn(GAME_TYPES, type)) throw fail('Bu oyun henüz desteklenmiyor.');
  if (type === 'tek' && (await getConfig()).cardGameEnabled === false) throw fail('Bu oyun şu an kapalı.', 403);
  const fee = await entryFee(type);
  let paidSilver = null;
  const id = await tx(async (c) => {
    await c.query(`SELECT id FROM rooms WHERE id = $1 AND is_active = TRUE FOR UPDATE`, [roomId]);
    const open = await openGameOfRoom(roomId, (t, p) => c.query(t, p));
    if (open) throw fail(`Odada zaten açık bir oyun var (${GAME_NAMES[open.game_type] ?? open.game_type}).`, 409);
    // Ludo modu (klasik / seri / eşyalı) kurulurken seçilir; oyun başlayınca motor bu seçimi kullanır.
    const options = type === 'ludo' && ludo.MODES.includes(req.body?.mode) ? { mode: req.body.mode } : {};
    const g = (await c.query(`INSERT INTO room_games(room_id, created_by, game_type, state) VALUES($1,$2,$3,$4) RETURNING id`, [roomId, req.user.id, type, JSON.stringify({ options })])).rows[0];
    await c.query(`INSERT INTO room_game_players(game_id, user_id, seat) VALUES($1,$2,0)`, [g.id, req.user.id]);
    paidSilver = await chargeEntry(c, { gameId: g.id, userId: req.user.id, gameType: type, fee });
    return g.id;
  });
  if (paidSilver != null) pushSilver([{ userId: req.user.id, silver: paidSilver }]);
  await broadcastGame(id);
  res.status(201).json({ game: await gameView(id, query, req.user.id) });
});

async function gameInRoom(gameId, userId) {
  const g = (await query(`SELECT * FROM room_games WHERE id = $1`, [gameId])).rows[0];
  if (!g) throw fail('Oyun bulunamadı.', 404);
  await assertMember(g.room_id, userId);
  return g;
}

router.post('/games/:id/join', userLimit('game', 60, 60e3), async (req, res) => {
  const id = uuid(req.params.id, 'Oyun');
  const g = await gameInRoom(id, req.user.id);
  const fee = await entryFee(g.game_type);
  let paidSilver = null;
  await tx(async (c) => {
    const row = (await c.query(`SELECT status FROM room_games WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (row.status !== 'waiting') throw fail('Oyuna artık katılınamaz.', 409);
    const taken = (await c.query(`SELECT user_id, seat FROM room_game_players WHERE game_id = $1`, [id])).rows;
    if (taken.some((p) => p.user_id === req.user.id)) return;
    const max = (GAME_TYPES[g.game_type] ?? GAME_TYPES.ludo).max;
    if (taken.length >= max) throw fail('Oyun dolu.', 409);
    const free = Array.from({ length: max }, (_, s) => s).find((s) => !taken.some((p) => p.seat === s));
    await c.query(`INSERT INTO room_game_players(game_id, user_id, seat) VALUES($1,$2,$3)`, [id, req.user.id, free]);
    paidSilver = await chargeEntry(c, { gameId: id, userId: req.user.id, gameType: g.game_type, fee });
  });
  if (paidSilver != null) pushSilver([{ userId: req.user.id, silver: paidSilver }]);
  await broadcastGame(g.id);
  res.json({ game: await gameView(g.id, query, req.user.id) });
});

router.post('/games/:id/leave', async (req, res) => {
  const id = uuid(req.params.id, 'Oyun');
  const g = await gameInRoom(id, req.user.id);
  if (g.status === 'waiting') {
    // Ludo'da kurucu oyuncu listesinden çıkamaz. TEK'te çıkabilir: oyunu açıp kendisi oynamadan başlatabilir.
    if (g.created_by === req.user.id && g.game_type !== 'tek') throw fail('Kurucu ayrılamaz; oyunu iptal edin.', 409);
    pushSilver(await tx((c) => refundAndRemove(c, id, [req.user.id])));
  } else if (g.status === 'playing') {
    await mutateGame(id, (state, row) => ({ state: engineOf(row).forfeit(state, req.user.id) }));
  } else throw fail('Oyun zaten bitti.', 409);
  await broadcastGame(id);
  res.json({ game: await gameView(id, query, req.user.id) });
});

router.post('/games/:id/start', async (req, res) => {
  const id = uuid(req.params.id, 'Oyun');
  await gameInRoom(id, req.user.id);
  await startGame(id, req.user.id);
  res.json({ game: await gameView(id, query, req.user.id) });
});

router.post('/games/:id/cancel', async (req, res) => {
  const id = uuid(req.params.id, 'Oyun');
  const g = await gameInRoom(id, req.user.id);
  const m = await assertMember(g.room_id, req.user.id);
  if (g.created_by !== req.user.id && !['owner', 'cohost'].includes(m.role)) throw fail('Bu işlem için yetkiniz yok.', 403);
  if (!['waiting', 'playing'].includes(g.status)) throw fail('Oyun zaten bitti.', 409);
  const refunds = await tx(async (c) => {
    const cur = (await c.query(`SELECT status FROM room_games WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    // Başlamamış oyunda girişler iade edilir; oynanmakta olan oyunda giriş yanar.
    const back = cur?.status === 'waiting' ? await refundAndRemove(c, id) : [];
    await c.query(`UPDATE room_games SET status = 'cancelled', finished_at = NOW() WHERE id = $1 AND status IN ('waiting','playing')`, [id]);
    return back;
  });
  pushSilver(refunds);
  res.json({ game: await broadcastGame(id) });
});

router.post('/games/:id/roll', userLimit('game_move', 120, 60e3), async (req, res) => {
  const id = uuid(req.params.id, 'Oyun');
  await gameInRoom(id, req.user.id);
  const out = await mutateGame(id, (state, row) => {
    assertGameType(row, 'ludo');
    const seat = ludo.seatOfUser(state, req.user.id);
    if (seat === null) throw fail('Bu oyunda değilsiniz.', 403);
    try { return ludo.roll(ludo.markActive(state, seat), seat); } catch (e) { throw fail(e.message, 409); }
  });
  res.json({ dice: out.dice, skipped: out.skipped, legal: out.legal, game: await gameView(id, query, req.user.id) });
});

router.post('/games/:id/move', userLimit('game_move', 120, 60e3), async (req, res) => {
  const id = uuid(req.params.id, 'Oyun');
  await gameInRoom(id, req.user.id);
  const token = Number(req.body?.token);
  const out = await mutateGame(id, (state, row) => {
    assertGameType(row, 'ludo');
    const seat = ludo.seatOfUser(state, req.user.id);
    if (seat === null) throw fail('Bu oyunda değilsiniz.', 403);
    try { return ludo.move(ludo.markActive(state, seat), seat, token); } catch (e) { throw fail(e.message, 409); }
  });
  res.json({ captured: out.captured, extraTurn: out.extraTurn, won: out.won, game: await gameView(id, query, req.user.id) });
});

// ---------- TEK (kart oyunu) hamleleri ----------
// Hepsi kilitli satırda saf motoru çalıştırır; yanıt, isteyenin kendi eliyle birlikte güncel görünümdür.
// Odadaki herkese giden yayında eller bulunmaz (services/games.js → tekView).
async function tekMove(req, res, apply) {
  const id = uuid(req.params.id, 'Oyun');
  await gameInRoom(id, req.user.id);
  await mutateGame(id, (state, row) => {
    assertGameType(row, 'tek');
    const seat = tek.seatOfUser(state, req.user.id);
    if (seat === null) throw fail('Bu oyunda değilsiniz.', 403);
    try { return apply(tek.markActive(state, seat), seat); } catch (e) { throw fail(e.message, 409); }
  });
  res.json({ game: await gameView(id, query, req.user.id) });
}

router.post('/games/:id/tek/play', userLimit('game_move', 120, 60e3), (req, res) => {
  const card = Number(req.body?.card);
  const color = typeof req.body?.color === 'string' ? req.body.color : null;
  return tekMove(req, res, (st, seat) => tek.play(st, seat, Number.isInteger(card) ? card : -1, color));
});
router.post('/games/:id/tek/draw', userLimit('game_move', 120, 60e3), (req, res) => tekMove(req, res, (st, seat) => tek.draw(st, seat)));
router.post('/games/:id/tek/pass', userLimit('game_move', 120, 60e3), (req, res) => tekMove(req, res, (st, seat) => tek.pass(st, seat)));
router.post('/games/:id/tek/challenge', userLimit('game_move', 120, 60e3), (req, res) =>
  tekMove(req, res, (st, seat) => tek.challenge(st, seat, req.body?.challenge === true)));
