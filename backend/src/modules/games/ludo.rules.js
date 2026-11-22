// Ludo motoru: saf ve sunucu tarafından yönetilir (istemci yalnızca gösterir). Para/bahis YOKTUR.
//
// Konumlar (ilerleme, "progress"):  -1 = üs,  0 = kendi başlangıç karesi,  1..50 = ortak yol,
//                                   51..55 = ev sütunu,  56 = bitti.
// Ortak yol 52 karelidir; koltuk s için küresel kare = (s*13 + progress) % 52 (progress 0..50 iken).
export const SAFE_CELLS = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
export const TURN_MS = 30000;
export const MAX_AUTO = 3;
export const COLORS = ['red', 'green', 'yellow', 'blue'];
export const FINISH = 56;

// Oyun modları (v2.108.0). Mod yazmayan eski oyun durumları 'classic' sayılır.
//  classic: 4 taşın hepsi bitişe varınca kazanılır.
//  quick  : (Seri) tek taş bitişe varınca kazanılır; ama en az bir rakip taşı kırmadan taşlar ev yoluna giremez (barikat).
//  items  : (Eşyalı) klasik kurallar + tahtadaki sabit eşya kareleri:
//           portal → taş bir sonraki bölgenin yıldızlı (güvenli) karesine ışınlanır (16 kare ileri; ev yoluna taşacaksa çalışmaz)
//           rocket → ilerideki en yakın rakip taşı üssüne döner (güvenli karedeki taşa dokunmaz); kırma sayılır
//           ice    → ilerideki en yakın rakip taşının sahibi bir tur atlar
//           bomb   → üstüne gelen taş kendi üssüne döner
//           dice   → bir zar hakkı daha
export const MODES = ['classic', 'quick', 'items'];
export const PORTAL_JUMP = 16;
// Küresel kare numarası → eşya. Her bölgede (13 kare) 3 eşya; hiçbiri güvenli karede değildir.
export const ITEM_CELLS = Object.freeze((() => {
  const m = {};
  for (let q = 0; q < 4; q++) {
    m[q * 13 + 2] = q % 2 === 0 ? 'dice' : 'rocket';
    m[q * 13 + 5] = 'portal';
    m[q * 13 + 10] = q % 2 === 0 ? 'bomb' : 'ice';
  }
  return m;
})());
export const modeOf = (st) => (MODES.includes(st.mode) ? st.mode : 'classic');
const bump = (st) => { st.seq = (st.seq ?? st.moves ?? 0) + 1; };

const clone = (o) => JSON.parse(JSON.stringify(o));

export const cellOf = (seat, progress) => (progress >= 0 && progress <= 50 ? (seat * 13 + progress) % 52 : null);

// 2 oyuncuda karşılıklı koltuklar (0,2); 3-4 oyuncuda sırayla.
export function seatsFor(count) {
  if (count === 2) return [0, 2];
  if (count === 3) return [0, 1, 2];
  if (count === 4) return [0, 1, 2, 3];
  throw new Error('Oyuncu sayısı 2-4 olmalı');
}

export function newGame(userIds, now = Date.now(), opts = {}) {
  if (userIds.length < 2 || userIds.length > 4) throw new Error('Oyuncu sayısı 2-4 olmalı');
  const seats = seatsFor(userIds.length);
  const players = userIds.map((userId, i) => ({ userId, seat: seats[i], auto: 0 }));
  const tokens = {};
  for (const p of players) tokens[p.seat] = [-1, -1, -1, -1];
  const kills = {};
  for (const p of players) kills[p.seat] = 0;
  return {
    players, tokens, turn: players[0].seat, dice: null, pending: [], sixes: 0,
    winnerSeat: null, deadline: now + TURN_MS, log: [], moves: 0,
    mode: MODES.includes(opts.mode) ? opts.mode : 'classic', kills, frozen: [], seq: 1,
  };
}

const playerOf = (st, seat) => st.players.find((p) => p.seat === seat);
export const seatOfUser = (st, userId) => st.players.find((p) => p.userId === userId)?.seat ?? null;

/** [from] konumundaki taşın [dice] ile varacağı konum; hamle geçersizse null. */
export function targetOf(st, seat, from, dice) {
  if (dice == null || from === FINISH) return null;
  if (from === -1) return dice === 6 ? 0 : null;
  const to = from + dice;
  // Seri mod barikatı: rakip taşı kırmamış oyuncunun taşı ev yoluna (51+) giremez; ana yolda bir tur daha döner.
  // (Kendi başlangıcının bir gerisindeki kareye — ilerleme 51 — denk gelen hamle yapılamaz.)
  if (from <= 50 && to > 50 && modeOf(st) === 'quick' && !((st.kills?.[seat] ?? 0) > 0)) return to >= 52 ? to - 52 : null;
  return to <= FINISH ? to : null;
}

export function legalMoves(st, seat, dice) {
  if (dice == null) return [];
  const out = [];
  st.tokens[seat].forEach((p, i) => { if (targetOf(st, seat, p, dice) !== null) out.push(i); });
  return out;
}

function nextSeat(st, seat) {
  const order = st.players.map((p) => p.seat);
  return order[(order.indexOf(seat) + 1) % order.length];
}

function endTurn(st, now, keep = false) {
  st.dice = null;
  // Oynanmamış zar değerleri sıra geçerken DÜŞER. Aksi halde oyuncu bir sonraki turunda
  // geçen turdan kalan zarı oynardı.
  st.pending = [];
  if (!keep) {
    let next = nextSeat(st, st.turn);
    // Dondurulan (buz) oyuncu bir tur atlar.
    const frozen = st.frozen ?? [];
    for (let guard = 0; guard < 4 && frozen.includes(next); guard++) {
      frozen.splice(frozen.indexOf(next), 1);
      st.log.push({ seat: next, event: 'frozen_skip', n: st.seq });
      next = nextSeat(st, next);
    }
    st.frozen = frozen;
    st.turn = next;
    st.sixes = 0;
  }
  st.deadline = now + TURN_MS;
}

// [cell] karesinden ileriye doğru ilk rakip taşı (ana yoldaki). protect: güvenli karedeki taşlar atlanır.
function nearestAhead(st, seat, cell, protect) {
  for (let d = 1; d < 52; d++) {
    const c = (cell + d) % 52;
    if (protect && SAFE_CELLS.has(c)) continue;
    for (const p of st.players) {
      if (p.seat === seat) continue;
      const i = st.tokens[p.seat].findIndex((q) => q >= 0 && q <= 50 && cellOf(p.seat, q) === c);
      if (i >= 0) return { seat: p.seat, token: i };
    }
  }
  return null;
}

/**
 * Zar atar.
 *
 * ## 6 OYNATMAZ, BİRİKİR (sahibinin kuralı)
 *
 *     "Oyuncu 6 atarsa oynatmasın, tekrar zar çevirip 2 veya 3 sonucu birden oynasın."
 *
 * Eskiden 6 atan oyuncu hem 6 ile oynuyor hem bir zar hakkı daha kazanıyordu. Artık 6
 * atıldığında taş oynatılmıyor: değer `st.pending` kuyruğuna yazılıp oyuncu tekrar atıyor.
 * Kuyruk 6 olmayan bir değerle kapanıyor ve oyuncu birikenleri SIRAYLA oynuyor:
 *
 *     [6, 3]      → iki sonuç
 *     [6, 6, 3]   → üç sonuç
 *     [6, 6, 6]   → üç altı: hepsi düşer, sıra geçer (eski kural korundu)
 *
 * Değerler TOPLANMIYOR, tek tek oynanıyor. Toplasaydık (6+6+3=15) üsten taş çıkarmak
 * imkânsız olurdu: `targetOf` üsten çıkış için tam 6 arıyor. Dört taşı da üste olan
 * oyuncu 6 attığında hiç hamlesi kalmazdı, yani oyun kilitlenirdi.
 *
 * `st.dice` her zaman "şu an oynanabilir değer" (kuyruğun başı) demek; kuyruk doluyken
 * null ise oyuncunun tekrar atması gerekiyor.
 */
export function roll(st0, seat, rng = Math.random, now = Date.now()) {
  const st = clone(st0);
  if (st.winnerSeat !== null) throw new Error('Oyun bitti');
  if (st.turn !== seat) throw new Error('Sıra sizde değil');
  if (st.dice !== null) throw new Error('Zar zaten atıldı');
  if (!Array.isArray(st.pending)) st.pending = [];
  const dice = 1 + Math.floor(rng() * 6);
  st.moves += 1;
  bump(st);

  if (dice === 6) {
    st.sixes += 1;
    if (st.sixes >= 3) {
      // Üst üste üç altı: biriken değerlerin hepsi düşer, sıra geçer.
      st.log.push({ seat, dice, event: 'three_sixes', n: st.seq });
      endTurn(st, now);
      st.log = st.log.slice(-20);
      return { state: st, dice, skipped: true, rollAgain: false, pending: [], legal: [] };
    }
    // 6 biriktir ve tekrar at. Taş oynatılmıyor.
    st.pending.push(6);
    st.dice = null;
    st.deadline = now + TURN_MS;
    st.log.push({ seat, dice, event: 'six_again', n: st.seq });
    st.log = st.log.slice(-20);
    return { state: st, dice, skipped: false, rollAgain: true, pending: st.pending.slice(), legal: [] };
  }

  st.sixes = 0;
  st.pending.push(dice);
  // Kuyruğun başındaki oynanamayan değerler düşer: [6, 6, 2] gelip 6'larla hamle yoksa
  // oyuncu 2'yi oynayabilsin. Hiçbiri oynanamıyorsa sıra geçer.
  const dropped = dropUnplayable(st, seat);
  if (!st.pending.length) {
    st.log.push({ seat, dice, event: 'no_move', n: st.seq });
    endTurn(st, now);
    st.log = st.log.slice(-20);
    return { state: st, dice, skipped: true, rollAgain: false, pending: [], legal: [] };
  }
  st.dice = st.pending[0];
  st.deadline = now + TURN_MS;
  st.log.push({ seat, dice, event: 'roll', pending: st.pending.slice(), dropped, n: st.seq });
  st.log = st.log.slice(-20);
  return { state: st, dice, skipped: false, rollAgain: false, pending: st.pending.slice(), legal: legalMoves(st, seat, st.dice) };
}

/** Kuyruğun başındaki, hiçbir taşla oynanamayan değerleri atar. Kaç tanesinin düştüğünü
 *  döndürür; oynanabilir ilk değer başa gelir. */
function dropUnplayable(st, seat) {
  let dropped = 0;
  while (st.pending.length && !legalMoves(st, seat, st.pending[0]).length) {
    st.pending.shift();
    dropped += 1;
  }
  return dropped;
}

export function move(st0, seat, token, now = Date.now()) {
  const st = clone(st0);
  if (st.winnerSeat !== null) throw new Error('Oyun bitti');
  if (st.turn !== seat) throw new Error('Sıra sizde değil');
  if (st.dice === null) throw new Error('Önce zar atın');
  if (!Number.isInteger(token) || !legalMoves(st, seat, st.dice).includes(token)) throw new Error('Geçersiz hamle');

  const dice = st.dice;
  const from = st.tokens[seat][token];
  const to = targetOf(st, seat, from, dice);
  st.tokens[seat][token] = to;

  const captured = [];
  const cell = cellOf(seat, to);
  if (cell !== null && !SAFE_CELLS.has(cell)) {
    for (const p of st.players) {
      if (p.seat === seat) continue;
      st.tokens[p.seat].forEach((q, i) => {
        if (q >= 0 && q <= 50 && cellOf(p.seat, q) === cell) { st.tokens[p.seat][i] = -1; captured.push({ seat: p.seat, token: i }); }
      });
    }
  }
  // Eşyalı mod: konulan karedeki eşyanın etkisi (yakalamadan sonra).
  const fx = [];
  let pos = to;
  let bonus = false;
  const item = modeOf(st) === 'items' && cell !== null ? ITEM_CELLS[cell] : null;
  if (item === 'bomb') {
    pos = -1;
    st.tokens[seat][token] = -1;
    fx.push({ item });
  } else if (item === 'dice') {
    bonus = true;
    fx.push({ item });
  } else if (item === 'portal') {
    if (to + PORTAL_JUMP <= 50) {
      pos = to + PORTAL_JUMP;
      st.tokens[seat][token] = pos;
      fx.push({ item, to: pos });
    }
  } else if (item === 'rocket' || item === 'ice') {
    const hit = nearestAhead(st, seat, cell, item === 'rocket');
    if (hit && item === 'rocket') {
      st.tokens[hit.seat][hit.token] = -1;
      captured.push(hit);
      fx.push({ item, seat: hit.seat, token: hit.token });
    } else if (hit) {
      st.frozen = st.frozen ?? [];
      if (!st.frozen.includes(hit.seat)) st.frozen.push(hit.seat);
      fx.push({ item, seat: hit.seat, token: hit.token });
    }
  }
  if (captured.length) { st.kills = st.kills ?? {}; st.kills[seat] = (st.kills[seat] ?? 0) + captured.length; }
  const finishedToken = pos === FINISH;
  st.moves += 1;
  bump(st);
  st.log.push({ seat, dice, event: captured.length ? 'capture' : finishedToken ? 'finish' : 'move', token, from, to: pos, land: to, fx, captured, n: st.seq });
  st.log = st.log.slice(-20);

  // Seri modda tek taş, diğer modlarda dört taşın hepsi bitişe varınca oyun biter.
  if (modeOf(st) === 'quick' ? finishedToken : st.tokens[seat].every((p) => p === FINISH)) {
    st.winnerSeat = seat;
    st.dice = null;
    st.pending = [];
    st.deadline = null;
    return { state: st, captured, finished: true, extraTurn: false, won: true };
  }
  // Oynanan değer kuyruktan düşer.
  //
  // `dice === 6` ARTIK ekstra tur VERMİYOR: 6, atıldığı anda zaten tekrar atma hakkı
  // kazandırdı ve kuyruğa yazıldı (bkz. roll). Burada da ekstra tur verseydik oyuncu her
  // 6'da iki hak kazanır ve tur hiç bitmezdi.
  if (!Array.isArray(st.pending)) st.pending = [];
  if (st.pending.length) st.pending.shift();
  // Kalan değerlerden oynanamayanlar düşer: [6, 6, 2] gelip ilk 6 oynandıktan sonra
  // ikinci 6 ile hamle kalmamış olabilir.
  dropUnplayable(st, seat);

  if (st.pending.length) {
    // Biriken zarlar bitmedi: sıra aynı oyuncuda, oynanacak değer kuyruğun başı.
    st.dice = st.pending[0];
    st.deadline = now + TURN_MS;
    return {
      state: st, captured, finished: finishedToken, extraTurn: true, won: false,
      pending: st.pending.slice(),
    };
  }

  const extra = captured.length > 0 || finishedToken || bonus;
  endTurn(st, now, extra);
  return { state: st, captured, finished: finishedToken, extraTurn: extra, won: false, pending: [] };
}

// Zaman aşımı / AFK: sıradaki oyuncu için otomatik oynar. MAX_AUTO kez üst üste otomatik oynarsa oyundan atılır.
export function pickAuto(st, seat) {
  const legal = legalMoves(st, seat, st.dice);
  if (!legal.length) return null;
  let best = legal[0]; let bestScore = -1;
  for (const i of legal) {
    const from = st.tokens[seat][i];
    const to = targetOf(st, seat, from, st.dice);
    let score = to < from ? 0 : to;
    if (to === FINISH) score += 1000;
    const cell = cellOf(seat, to);
    if (cell !== null && !SAFE_CELLS.has(cell)) {
      for (const p of st.players) if (p.seat !== seat) for (const q of st.tokens[p.seat]) if (q >= 0 && q <= 50 && cellOf(p.seat, q) === cell) score += 500;
    }
    if (from === -1) score += 100;
    if (modeOf(st) === 'items' && cell !== null && ITEM_CELLS[cell] === 'bomb') score -= 2000;
    if (score > bestScore) { best = i; bestScore = score; }
  }
  return best;
}

export function autoPlay(st0, rng = Math.random, now = Date.now()) {
  let st = clone(st0);
  const seat = st.turn;
  const pl = playerOf(st, seat);
  pl.auto += 1;
  if (pl.auto > MAX_AUTO) return { state: forfeit(st, pl.userId, now), forfeited: pl.userId };
  // 6 OYNATMIYOR, tekrar attırıyor: kuyruk 6 olmayan bir değerle kapanana kadar at.
  // En çok üç atış olabilir (üçüncü 6 sırayı geçirir) ama döngüye güvenmek yerine sınır var.
  //
  // Bu döngü olmadan, zaman aşımına düşen oyuncu 6 attığında `st.dice` null kalıyor,
  // pickAuto boş dönüyor ve oyuncu tekrar atmak yerine SIRASINI KAYBEDİYORDU.
  for (let guard = 0; guard < 4 && st.dice === null && st.turn === seat && st.winnerSeat === null; guard++) {
    const r = roll(st, seat, rng, now);
    st = r.state;
    if (r.skipped || st.turn !== seat) return { state: st, forfeited: null };
  }
  // Biriken zarların hepsi tek zaman aşımında oynanır; oyuncu her değer için ayrı ayrı
  // zaman aşımına düşmesin.
  for (let guard = 0; guard < 4 && st.dice !== null && st.turn === seat && st.winnerSeat === null; guard++) {
    const pick = pickAuto(st, seat);
    if (pick === null) { bump(st); endTurn(st, now); return { state: st, forfeited: null }; }
    st = move(st, seat, pick, now).state;
  }
  return { state: st, forfeited: null };
}

// Oyuncu hamle yaptığında AFK sayacı sıfırlanır.
export function markActive(st0, seat) {
  const st = clone(st0);
  const p = playerOf(st, seat);
  if (p) p.auto = 0;
  return st;
}

export function forfeit(st0, userId, now = Date.now()) {
  const st = clone(st0);
  const p = st.players.find((x) => x.userId === userId);
  if (!p) return st;
  const wasTurn = st.turn === p.seat;
  const next = wasTurn ? nextSeat(st, p.seat) : st.turn;
  st.players = st.players.filter((x) => x.userId !== userId);
  delete st.tokens[p.seat];
  if (st.kills) delete st.kills[p.seat];
  if (st.frozen) st.frozen = st.frozen.filter((x) => x !== p.seat);
  bump(st);
  st.log.push({ seat: p.seat, event: 'forfeit', n: st.seq });
  if (st.players.length === 1) {
    st.winnerSeat = st.players[0].seat;
    st.dice = null;
    st.deadline = null;
    return st;
  }
  if (wasTurn) { st.turn = next; st.dice = null; st.sixes = 0; st.deadline = now + TURN_MS; }
  return st;
}
