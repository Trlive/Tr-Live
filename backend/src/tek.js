// TEK: oda içi renk-sayı eşleştirme kart oyunu (2–9 oyuncu). Saf motor: veritabanı / ağ bilmez, durum (state) alır ve yeni
// durum döndürür (ludo.js ile aynı düzen). Ücretsizdir, Coin bahsi yoktur.
//
// Kurallar:
//  * 108 kart: 76 sayı (her renkte bir 0, ikişer 1–9), 24 aksiyon (her renkte ikişer Atla / Yön değiştir / +2),
//    8 joker (4 Renk seç, 4 Renk seç +4).
//  * Sıradaki oyuncu ortadaki kartla aynı renkte, aynı sayıda ya da aynı aksiyonda bir kart atar; joker her zaman atılır.
//  * Atacak kartı yoksa (ya da atmak istemezse) desteden bir kart çeker; çektiği kart uyuyorsa atabilir ya da elinde tutar.
//  * Atla: sıradaki oyuncu sırasını kaybeder. Yön değiştir: oyun yönü döner (iki kişide Atla gibi çalışır).
//    +2: sıradaki oyuncu 2 kart çeker ve sırasını kaybeder.
//  * +4: sıradaki oyuncu ya kabul eder (4 kart çeker, sırasını kaybeder) ya da itiraz eder. Atanın elinde o anki renkten
//    kart varsa itiraz haklıdır: 4 kartı atan çeker, itiraz eden normal oynar. Yoksa itiraz eden 6 kart çeker ve sırasını kaybeder.
//  * Bir oyuncunun elinde en fazla 20 kart olur (fazlası çekilmez).
//  * Elini ilk bitiren kazanır. Sıralama puana göredir (az puan iyidir): sayı kartı üzerindeki sayı, aksiyon 20, joker 50.
//  * Bir el en fazla 15 dakika sürer; süre dolunca herkes birer kez daha oynar ve el puana göre biter.
//  * Sırası gelen 20 sn içinde oynamazsa otomatik oynanır; üst üste 3 kez oynamayan oyundan düşer.

export const COLORS = ['r', 'y', 'g', 'b'];
export const TURN_MS = 20000;
export const ROUND_MS = 15 * 60e3;
export const MAX_AUTO = 3;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 9;
export const HAND_START = 7;
export const HAND_MAX = 20;

// Kart kimliği (0–107) → iki harfli kod: renk (r/y/g/b, joker: w) + tür (0–9, S: atla, R: yön, D: +2, W: renk seç, F: +4).
export const DECK = (() => {
  const d = [];
  for (const c of COLORS) {
    d.push(`${c}0`);
    for (let n = 1; n <= 9; n++) d.push(`${c}${n}`, `${c}${n}`);
    for (const k of ['S', 'R', 'D']) d.push(`${c}${k}`, `${c}${k}`);
  }
  for (let i = 0; i < 4; i++) d.push('wW');
  for (let i = 0; i < 4; i++) d.push('wF');
  return Object.freeze(d);
})();

export const codeOf = (id) => DECK[id];
export const colorOf = (id) => DECK[id][0];
export const kindOf = (id) => DECK[id][1];
export const isWild = (id) => DECK[id][0] === 'w';
export const isNumber = (id) => DECK[id][1] >= '0' && DECK[id][1] <= '9';
export const pointsOf = (id) => (isWild(id) ? 50 : isNumber(id) ? Number(DECK[id][1]) : 20);
export const handPoints = (hand) => hand.reduce((s, id) => s + pointsOf(id), 0);

const clone = (st) => JSON.parse(JSON.stringify(st));
const err = (m) => new Error(m);

export function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function newGame(userIds, rng = Math.random, now = Date.now()) {
  if (userIds.length < MIN_PLAYERS || userIds.length > MAX_PLAYERS) throw err(`Oyun ${MIN_PLAYERS}–${MAX_PLAYERS} kişiyle oynanır.`);
  const draw = shuffle(DECK.map((_, i) => i), rng);
  const players = userIds.map((userId, seat) => ({ userId, seat, hand: [], auto: 0, out: false }));
  for (let k = 0; k < HAND_START; k++) for (const p of players) p.hand.push(draw.pop());
  // Açılış kartı her zaman bir sayı kartıdır (destenin üstünden ilk sayı kartı).
  let at = draw.length - 1;
  while (!isNumber(draw[at])) at -= 1;
  const [first] = draw.splice(at, 1);
  const dealer = Math.floor(rng() * players.length);
  const st = {
    kind: 'tek', players, draw, discard: [first], color: colorOf(first), dir: 1,
    dealer, turn: 0, phase: 'play', drawn: null, pending: null,
    deadline: now + TURN_MS, startedAt: now, endsAt: now + ROUND_MS, lastTurns: null,
    winnerSeat: null, result: null, seq: 1, moves: 0, last: [{ t: 'start' }],
  };
  st.turn = nextSeat(st, dealer);
  return st;
}

export const seatOfUser = (st, userId) => st.players.find((p) => p.userId === userId && !p.out)?.seat ?? null;
export const activePlayers = (st) => st.players.filter((p) => !p.out);

/** [from] koltuğundan oyun yönünde sıradaki (oyundan düşmemiş) koltuk. */
export function nextSeat(st, from, dir = st.dir) {
  const n = st.players.length;
  for (let i = 1; i <= n; i++) {
    const s = (((from + dir * i) % n) + n) % n;
    if (!st.players[s].out) return s;
  }
  return from;
}

export const topCard = (st) => st.discard[st.discard.length - 1];

/** Kart şu an ortaya atılabilir mi (renk, sayı ya da aksiyon eşleşmesi; joker her zaman). */
export function canPlay(st, id) {
  if (isWild(id)) return true;
  if (colorOf(id) === st.color) return true;
  const top = topCard(st);
  return !isWild(top) && kindOf(id) === kindOf(top);
}

/** Oyuncunun şu an atabileceği kartlar (sıra onda değilse boş). */
export function playableCards(st, seat) {
  if (st.winnerSeat !== null || st.turn !== seat) return [];
  const p = st.players[seat];
  if (st.phase === 'drawn') return st.drawn !== null && canPlay(st, st.drawn) ? [st.drawn] : [];
  if (st.phase !== 'play') return [];
  return p.hand.filter((id) => canPlay(st, id));
}

// Desteden en fazla n kart çeker (el sınırı ve biten deste gözetilir). Çekilen kart sayısını döndürür.
function drawInto(st, p, n, rng) {
  let got = 0;
  while (got < n && p.hand.length < HAND_MAX) {
    if (st.draw.length === 0) {
      if (st.discard.length <= 1) break; // çekilecek kart kalmadı (hepsi ellerde)
      const top = st.discard.pop();
      st.draw = shuffle(st.discard, rng);
      st.discard = [top];
    }
    p.hand.push(st.draw.pop());
    got += 1;
  }
  return got;
}

function finish(st, winnerSeat = null) {
  const rows = st.players.map((p) => ({ userId: p.userId, seat: p.seat, cards: p.hand.length, score: handPoints(p.hand), left: p.out }));
  const order = (a, b) => (a.left - b.left) || ((b.seat === winnerSeat) - (a.seat === winnerSeat)) || (a.score - b.score) || (a.cards - b.cards) || (a.seat - b.seat);
  rows.sort(order);
  rows.forEach((r, i) => { r.rank = i + 1; });
  st.result = rows;
  st.winnerSeat = rows[0].seat;
  st.phase = 'over';
  st.deadline = null;
  st.drawn = null;
  st.pending = null;
  st.last.push({ t: 'over', seat: st.winnerSeat });
}

// Sıra [seat] koltuğuna geçer. Süre sınırı dolduysa herkes birer kez daha oynar, sonra el puana göre biter.
function passTurn(st, seat, now) {
  st.phase = 'play';
  st.drawn = null;
  st.turn = seat;
  st.deadline = now + TURN_MS;
  if (st.lastTurns === null) {
    if (now >= st.endsAt) st.lastTurns = activePlayers(st).length;
  } else {
    st.lastTurns -= 1;
    if (st.lastTurns <= 0) finish(st);
  }
}

function begin(st0, seat) {
  if (st0.winnerSeat !== null) throw err('Oyun bitti.');
  if (st0.turn !== seat) throw err('Sıra sizde değil.');
  const st = clone(st0);
  st.last = [];
  st.seq += 1;
  st.moves += 1;
  return st;
}

/** Kart atma. Jokerde [color] zorunludur. */
export function play(st0, seat, cardId, color = null, rng = Math.random, now = Date.now()) {
  const st = begin(st0, seat);
  if (st.phase !== 'play' && st.phase !== 'drawn') throw err('Önce +4 için karar verin.');
  const p = st.players[seat];
  const at = p.hand.indexOf(cardId);
  if (!Number.isInteger(cardId) || at < 0) throw err('Bu kart elinizde yok.');
  if (st.phase === 'drawn' && cardId !== st.drawn) throw err('Yalnızca çektiğiniz kartı atabilirsiniz.');
  if (!canPlay(st, cardId)) throw err('Bu kart atılamaz: renk, sayı ya da aksiyon uymalı.');
  const wild = isWild(cardId);
  if (wild && !COLORS.includes(color)) throw err('Joker için renk seçin.');
  const kind = kindOf(cardId);
  const prevColor = st.color;
  p.hand.splice(at, 1);
  st.discard.push(cardId);
  st.color = wild ? color : colorOf(cardId);
  st.last.push({ t: 'play', seat, code: codeOf(cardId), color: st.color });
  if (p.hand.length === 0) { finish(st, seat); return { state: st, won: true }; }

  const next = nextSeat(st, seat);
  if (kind === 'S') {
    st.last.push({ t: 'skip', seat: next });
    passTurn(st, nextSeat(st, next), now);
  } else if (kind === 'R') {
    st.dir = -st.dir;
    st.last.push({ t: 'reverse', dir: st.dir });
    // İki kişide yön değiştir, rakibin sırasını atlatır (sıra yine atanda).
    passTurn(st, activePlayers(st).length === 2 ? seat : nextSeat(st, seat), now);
  } else if (kind === 'D') {
    const n = drawInto(st, st.players[next], 2, rng);
    st.last.push({ t: 'penalty', seat: next, n });
    passTurn(st, nextSeat(st, next), now);
  } else if (kind === 'F') {
    // Karar sıradaki oyuncuda: kabul ya da itiraz. Suçluluk (elde o anki renkten kart var mıydı) şimdi saptanır.
    st.pending = { by: seat, guilty: p.hand.some((id) => colorOf(id) === prevColor) };
    st.phase = 'challenge';
    st.drawn = null;
    st.turn = next;
    st.deadline = now + TURN_MS;
  } else {
    passTurn(st, next, now);
  }
  return { state: st, won: false };
}

/** Desteden kart çekme. Çekilen kart uyuyorsa oyuncu atar ya da elinde tutar (pass); uymuyorsa sıra geçer. */
export function draw(st0, seat, rng = Math.random, now = Date.now()) {
  const st = begin(st0, seat);
  if (st.phase !== 'play') throw err(st.phase === 'drawn' ? 'Bu sırada zaten kart çektiniz.' : 'Önce +4 için karar verin.');
  const p = st.players[seat];
  const n = drawInto(st, p, 1, rng);
  st.last.push({ t: 'draw', seat, n });
  if (n === 1 && canPlay(st, p.hand[p.hand.length - 1])) {
    st.drawn = p.hand[p.hand.length - 1];
    st.phase = 'drawn';
    st.deadline = now + TURN_MS;
    return { state: st, drawn: st.drawn, canPlay: true };
  }
  const drawn = n === 1 ? p.hand[p.hand.length - 1] : null;
  passTurn(st, nextSeat(st, seat), now);
  return { state: st, drawn, canPlay: false };
}

/** Çekilen kartı elde tutup sırayı geçme. */
export function pass(st0, seat, now = Date.now()) {
  const st = begin(st0, seat);
  if (st.phase !== 'drawn') throw err('Önce kart atın ya da desteden çekin.');
  st.last.push({ t: 'pass', seat });
  passTurn(st, nextSeat(st, seat), now);
  return { state: st };
}

/** +4 kararı: kabul (doChallenge = false) ya da itiraz. */
export function challenge(st0, seat, doChallenge, rng = Math.random, now = Date.now()) {
  const st = begin(st0, seat);
  if (st.phase !== 'challenge' || !st.pending) throw err('İtiraz edilecek bir +4 yok.');
  const { by, guilty } = st.pending;
  st.pending = null;
  const me = st.players[seat];
  if (!doChallenge) {
    const n = drawInto(st, me, 4, rng);
    st.last.push({ t: 'penalty', seat, n });
    passTurn(st, nextSeat(st, seat), now);
    return { state: st, challenged: false };
  }
  if (guilty) {
    const offender = st.players[by];
    const n = offender.out ? 0 : drawInto(st, offender, 4, rng);
    st.last.push({ t: 'challenge', seat, by, ok: true, n });
    // İtiraz haklı: itiraz eden normal oynar (sıra onda kalır).
    st.phase = 'play';
    st.drawn = null;
    st.deadline = now + TURN_MS;
    return { state: st, challenged: true, ok: true };
  }
  const n = drawInto(st, me, 6, rng);
  st.last.push({ t: 'challenge', seat, by, ok: false, n });
  passTurn(st, nextSeat(st, seat), now);
  return { state: st, challenged: true, ok: false };
}

/** Oyuncu kendisi hamle yaptı: otomatik oynama sayacı sıfırlanır. */
export function markActive(st0, seat) {
  const st = clone(st0);
  const p = st.players[seat];
  if (p) p.auto = 0;
  return st;
}

/** Süresi dolan sıra için otomatik hamle. Üst üste MAX_AUTO kez oynamayan oyundan düşer. */
export function autoPlay(st0, rng = Math.random, now = Date.now()) {
  if (st0.winnerSeat !== null) return { state: st0 };
  const seat = st0.turn;
  const pl = st0.players[seat];
  if (pl.auto + 1 > MAX_AUTO) return { state: forfeit(st0, pl.userId, rng, now), forfeited: pl.userId };
  let out;
  if (st0.phase === 'challenge') out = challenge(st0, seat, false, rng, now);
  else if (st0.phase === 'drawn') out = pass(st0, seat, now);
  else {
    out = draw(st0, seat, rng, now);
    if (out.state.phase === 'drawn' && out.state.turn === seat) {
      // Çekilen kart uysa da otomatik oyunda atılmaz: elde kalır, sıra geçer.
      const kept = pass(out.state, seat, now);
      kept.state.last = [...out.state.last, ...kept.state.last];
      out = kept;
    }
  }
  const st = out.state;
  st.players[seat].auto += 1;
  st.last.push({ t: 'auto', seat });
  return { state: st, auto: seat };
}

/** Oyuncu oyundan ayrılır / düşer: kartları desteye karışır, sıralamada sona yazılır. Tek kişi kalırsa o kazanır. */
export function forfeit(st0, userId, rng = Math.random, now = Date.now()) {
  if (st0.winnerSeat !== null) return st0;
  const st = clone(st0);
  const p = st.players.find((x) => x.userId === userId);
  if (!p || p.out) return st;
  st.last = [{ t: 'left', seat: p.seat }];
  st.seq += 1;
  st.draw = shuffle([...st.draw, ...p.hand], rng);
  p.hand = [];
  p.out = true;
  const rest = activePlayers(st);
  if (rest.length <= 1) { finish(st, rest[0]?.seat ?? null); return st; }
  if (st.turn === p.seat) {
    // Sıra (ya da +4 kararı) ondaydı: karar düşer, sıra bir sonrakine geçer.
    st.pending = null;
    passTurn(st, nextSeat(st, p.seat), now);
  }
  return st;
}

const COLOR_ORDER = { r: 0, y: 1, g: 2, b: 3, w: 4 };
const KIND_ORDER = '0123456789SRDWF';
/** Eldeki kartların gösterim sırası: renk, sonra tür. */
export const sortHand = (hand) => [...hand].sort((a, b) => (COLOR_ORDER[colorOf(a)] - COLOR_ORDER[colorOf(b)]) || (KIND_ORDER.indexOf(kindOf(a)) - KIND_ORDER.indexOf(kindOf(b))) || (a - b));

/** Herkese gösterilen durum: eller ve deste GÖSTERİLMEZ (yalnızca kart sayıları). */
export function publicView(st, now = Date.now()) {
  const over = st.winnerSeat !== null;
  return {
    players: st.players.map((p) => ({ userId: p.userId, seat: p.seat, cards: p.hand.length, out: p.out, auto: p.auto })),
    top: codeOf(topCard(st)), color: st.color, dir: st.dir, dealerSeat: st.dealer,
    turnSeat: over ? null : st.turn, phase: st.phase, drawCount: st.draw.length,
    challengeBy: st.phase === 'challenge' && st.pending ? st.pending.by : null,
    turnMsLeft: st.deadline ? Math.max(0, st.deadline - now) : null, turnMs: TURN_MS,
    roundMsLeft: over ? 0 : Math.max(0, st.endsAt - now), lastRound: st.lastTurns !== null,
    seq: st.seq, last: st.last,
    result: st.result,
  };
}

/** Yalnızca oyuncunun kendisine gösterilen bilgiler (eli ve yapabilecekleri). Oyuncu değilse null. */
export function privateView(st, userId) {
  const p = st.players.find((x) => x.userId === userId);
  if (!p) return null;
  const mine = st.winnerSeat === null && !p.out && st.turn === p.seat;
  return {
    seat: p.seat, out: p.out,
    hand: sortHand(p.hand).map((id) => ({ id, code: codeOf(id) })),
    playable: p.out ? [] : playableCards(st, p.seat),
    canDraw: mine && st.phase === 'play',
    canPass: mine && st.phase === 'drawn',
    drawn: mine && st.phase === 'drawn' ? st.drawn : null,
    mustAnswer: mine && st.phase === 'challenge',
  };
}

/** Tutarlılık denetimi (testler için): 108 kartın her biri tam bir yerde. */
export function cardCount(st) {
  return st.draw.length + st.discard.length + st.players.reduce((s, p) => s + p.hand.length, 0);
}
