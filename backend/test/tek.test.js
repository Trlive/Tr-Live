import test from 'node:test';
import assert from 'node:assert/strict';
import * as tek from '../src/modules/games/tek.rules.js';

// Tekrarlanabilir rastgelelik.
function rngOf(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const T0 = 1_700_000_000_000;

// Kodlardan (ör. 'r5', 'wF') belirli bir durum kurar; kullanılmayan kartlar desteye gider.
function mk({ hands, top, color = null, turn = 0, dir = 1, drawTop = [] }) {
  const used = new Set();
  const take = (code) => {
    const id = tek.DECK.findIndex((c, i) => c === code && !used.has(i));
    assert.ok(id >= 0, `kart kalmadı: ${code}`);
    used.add(id);
    return id;
  };
  const players = hands.map((h, seat) => ({ userId: `u${seat}`, seat, hand: h.map(take), auto: 0, out: false }));
  const first = take(top);
  const upcoming = drawTop.map(take); // sırayla çekilecek kartlar
  const rest = tek.DECK.map((_, i) => i).filter((i) => !used.has(i));
  return {
    kind: 'tek', players, draw: [...rest, ...upcoming.reverse()], discard: [first], color: color ?? tek.colorOf(first), dir,
    dealer: 0, turn, phase: 'play', drawn: null, pending: null,
    deadline: T0 + tek.TURN_MS, startedAt: T0, endsAt: T0 + tek.ROUND_MS, lastTurns: null,
    winnerSeat: null, result: null, seq: 1, moves: 0, last: [],
  };
}
const idOf = (st, seat, code) => st.players[seat].hand.find((id) => tek.codeOf(id) === code);
const codes = (st, seat) => st.players[seat].hand.map(tek.codeOf);

test('deste: 108 kart = 76 sayı + 24 aksiyon + 8 joker', () => {
  assert.equal(tek.DECK.length, 108);
  const ids = tek.DECK.map((_, i) => i);
  assert.equal(ids.filter(tek.isNumber).length, 76);
  assert.equal(ids.filter((i) => !tek.isNumber(i) && !tek.isWild(i)).length, 24);
  assert.equal(ids.filter(tek.isWild).length, 8);
  assert.equal(tek.pointsOf(tek.DECK.indexOf('r7')), 7);
  assert.equal(tek.pointsOf(tek.DECK.indexOf('gS')), 20);
  assert.equal(tek.pointsOf(tek.DECK.indexOf('wF')), 50);
});

test('yeni oyun: herkese 7 kart, açılış sayı kartı, sıra dağıtıcının yanında', () => {
  for (let n = 2; n <= 9; n++) {
    const st = tek.newGame(Array.from({ length: n }, (_, i) => `u${i}`), rngOf(n), T0);
    assert.ok(st.players.every((p) => p.hand.length === 7));
    assert.ok(tek.isNumber(tek.topCard(st)));
    assert.equal(st.color, tek.colorOf(tek.topCard(st)));
    assert.equal(tek.cardCount(st), 108);
    assert.equal(st.turn, (st.dealer + 1) % n);
    assert.equal(st.deadline, T0 + tek.TURN_MS);
  }
  assert.throws(() => tek.newGame(['a']), /2–9/);
  assert.throws(() => tek.newGame(Array.from({ length: 10 }, (_, i) => `u${i}`)), /2–9/);
});

test('kart atma: renk / sayı / aksiyon eşleşmesi, sıra ve yetki', () => {
  const st = mk({ hands: [['r5', 'g7', 'b2', 'gS'], ['r1', 'r2'], ['y1', 'y2']], top: 'r7' });
  assert.deepEqual(tek.playableCards(st, 0).map(tek.codeOf).sort(), ['g7', 'r5']);
  assert.deepEqual(tek.playableCards(st, 1), [], 'sırası olmayanın atılabilir kartı yok');
  assert.throws(() => tek.play(st, 1, idOf(st, 1, 'r1')), /Sıra sizde değil/);
  assert.throws(() => tek.play(st, 0, idOf(st, 0, 'b2')), /atılamaz/);
  assert.throws(() => tek.play(st, 0, idOf(st, 1, 'r1')), /elinizde yok/);
  assert.throws(() => tek.play(st, 0, 'r5'), /elinizde yok/);
  const a = tek.play(st, 0, idOf(st, 0, 'g7'), null, Math.random, T0 + 5).state;
  assert.equal(a.color, 'g');
  assert.equal(a.turn, 1);
  assert.equal(tek.codeOf(tek.topCard(a)), 'g7');
  assert.equal(a.players[0].hand.length, 3);
  assert.equal(a.deadline, T0 + 5 + tek.TURN_MS);
  assert.equal(a.seq, 2);
  assert.equal(st.players[0].hand.length, 4, 'girdi durumu değişmez');
  assert.equal(tek.cardCount(a), 108);
});

test('atla, yön değiştir, +2', () => {
  let st = mk({ hands: [['rS', 'r1'], ['g1', 'g2'], ['b1', 'b2']], top: 'r7' });
  let a = tek.play(st, 0, idOf(st, 0, 'rS')).state;
  assert.equal(a.turn, 2, 'atla: 1. koltuk sırasını kaybeder');
  assert.deepEqual(a.last.map((e) => e.t), ['play', 'skip']);

  st = mk({ hands: [['rR', 'r1'], ['g1', 'g2'], ['b1', 'b2']], top: 'r7' });
  a = tek.play(st, 0, idOf(st, 0, 'rR')).state;
  assert.equal(a.dir, -1);
  assert.equal(a.turn, 2, 'yön döndü: sıra ters yöndeki oyuncuda');

  st = mk({ hands: [['rR', 'r1'], ['g1', 'g2']], top: 'r7' });
  a = tek.play(st, 0, idOf(st, 0, 'rR')).state;
  assert.equal(a.turn, 0, 'iki kişide yön değiştir atla gibidir');

  st = mk({ hands: [['rD', 'r1'], ['g1', 'g2'], ['b1', 'b2']], top: 'r7' });
  a = tek.play(st, 0, idOf(st, 0, 'rD')).state;
  assert.equal(a.players[1].hand.length, 4, '+2: sıradaki 2 kart çeker');
  assert.equal(a.turn, 2, '+2: sıradaki sırasını kaybeder');
  assert.equal(tek.cardCount(a), 108);

  // aksiyon aksiyonla eşleşir (renk farklı olsa da)
  st = mk({ hands: [['gS', 'r1'], ['g1', 'g2'], ['b1', 'b2']], top: 'rS' });
  assert.ok(tek.canPlay(st, idOf(st, 0, 'gS')));
});

test('joker: renk seçimi zorunlu; sonraki kart seçilen renge uyar', () => {
  const st = mk({ hands: [['wW', 'r1'], ['g1', 'r9', 'b7'], ['b1', 'b2']], top: 'r7' });
  assert.throws(() => tek.play(st, 0, idOf(st, 0, 'wW')), /renk seçin/);
  assert.throws(() => tek.play(st, 0, idOf(st, 0, 'wW'), 'w'), /renk seçin/);
  const a = tek.play(st, 0, idOf(st, 0, 'wW'), 'g').state;
  assert.equal(a.color, 'g');
  assert.equal(a.turn, 1);
  assert.deepEqual(tek.playableCards(a, 1).map(tek.codeOf), ['g1'], 'jokerin üstüne yalnızca seçilen renk (7 sayısı eşleşmez)');
});

test('+4: kabul, haklı itiraz, haksız itiraz', () => {
  // Atanın elinde kırmızı var → suçlu.
  let st = mk({ hands: [['wF', 'r1', 'g1'], ['g2', 'g3'], ['b1', 'b2']], top: 'r7' });
  let a = tek.play(st, 0, idOf(st, 0, 'wF'), 'b').state;
  assert.equal(a.phase, 'challenge');
  assert.equal(a.turn, 1);
  assert.equal(a.color, 'b');
  assert.equal(tek.publicView(a, T0).challengeBy, 0);
  assert.ok(!JSON.stringify(tek.publicView(a, T0)).includes('guilty'), 'suçluluk bilgisi herkese açık görünümde yok');
  assert.throws(() => tek.play(a, 1, a.players[1].hand[0]), /\+4 için karar/);
  assert.throws(() => tek.draw(a, 1), /\+4 için karar/);
  assert.throws(() => tek.challenge(a, 2, true), /Sıra sizde değil/);

  let b = tek.challenge(a, 1, false).state;
  assert.equal(b.players[1].hand.length, 6, 'kabul: 4 kart çeker');
  assert.equal(b.turn, 2, 'kabul: sırasını kaybeder');

  b = tek.challenge(a, 1, true);
  assert.equal(b.ok, true);
  assert.equal(b.state.players[0].hand.length, 6, 'haklı itiraz: 4 kartı atan çeker');
  assert.equal(b.state.players[1].hand.length, 2);
  assert.equal(b.state.turn, 1, 'haklı itiraz: itiraz eden normal oynar');
  assert.equal(b.state.phase, 'play');
  assert.equal(tek.cardCount(b.state), 108);

  // Atanın elinde kırmızı yok → suçsuz.
  st = mk({ hands: [['wF', 'g1', 'b1'], ['g2', 'g3'], ['b2', 'b3']], top: 'r7' });
  a = tek.play(st, 0, idOf(st, 0, 'wF'), 'g').state;
  b = tek.challenge(a, 1, true);
  assert.equal(b.ok, false);
  assert.equal(b.state.players[1].hand.length, 8, 'haksız itiraz: 6 kart çeker');
  assert.equal(b.state.turn, 2);
  assert.throws(() => tek.challenge(b.state, 2, true), /İtiraz edilecek/);
});

test('kart çekme: uymayan kartta sıra geçer; uyan kart atılır ya da elde tutulur', () => {
  let st = mk({ hands: [['g1', 'g2'], ['b1', 'b2'], ['y1', 'y2']], top: 'r7', drawTop: ['b9'] });
  let a = tek.draw(st, 0);
  assert.equal(a.canPlay, false);
  assert.equal(a.state.players[0].hand.length, 3);
  assert.equal(a.state.turn, 1);

  st = mk({ hands: [['g1', 'r3'], ['b1', 'b2'], ['y1', 'y2']], top: 'r7', drawTop: ['r9'] });
  a = tek.draw(st, 0, Math.random, T0 + 1000);
  assert.equal(a.canPlay, true);
  assert.equal(a.state.phase, 'drawn');
  assert.equal(a.state.turn, 0);
  assert.equal(a.state.deadline, T0 + 1000 + tek.TURN_MS);
  assert.deepEqual(tek.playableCards(a.state, 0).map(tek.codeOf), ['r9'], 'çektikten sonra yalnızca çekilen kart');
  assert.throws(() => tek.play(a.state, 0, idOf(a.state, 0, 'r3')), /Yalnızca çektiğiniz/);
  assert.throws(() => tek.draw(a.state, 0), /zaten kart çektiniz/);
  const kept = tek.pass(a.state, 0).state;
  assert.equal(kept.turn, 1);
  assert.equal(kept.players[0].hand.length, 3);
  const played = tek.play(a.state, 0, a.drawn).state;
  assert.equal(played.turn, 1);
  assert.equal(played.players[0].hand.length, 2);
  assert.throws(() => tek.pass(st, 0), /Önce kart atın/);

  const pv = tek.privateView(a.state, 'u0');
  assert.equal(pv.drawn, a.drawn);
  assert.equal(pv.canPass, true);
  assert.equal(pv.canDraw, false);
});

test('el sınırı 20 kart: ceza ve çekme sınırı aşmaz', () => {
  const many = ['b1', 'b1', 'b2', 'b2', 'b3', 'b3', 'b4', 'b4', 'b5', 'b5', 'b6', 'b6', 'b7', 'b7', 'b8', 'b8', 'b9', 'b9', 'g1'];
  let st = mk({ hands: [['rD', 'r1'], many, ['y1', 'y2']], top: 'r7' });
  let a = tek.play(st, 0, idOf(st, 0, 'rD')).state;
  assert.equal(a.players[1].hand.length, 20, '19 + 2 → 20');
  assert.equal(a.last.find((e) => e.t === 'penalty').n, 1);
  // 20 karttayken çekmek isteyen kart alamaz, sıra geçer.
  st = mk({ hands: [[...many, 'g2'], ['y1', 'y2']], top: 'r7' });
  const d = tek.draw(st, 0);
  assert.equal(d.state.players[0].hand.length, 20);
  assert.equal(d.state.turn, 1);
  assert.equal(d.drawn, null);
});

test('deste bitince atılan kartlar karıştırılıp yeniden deste olur', () => {
  const st = mk({ hands: [['g1', 'g2'], ['b1', 'b2']], top: 'r7' });
  st.discard = [...st.draw, ...st.discard];
  st.draw = [];
  const top = tek.topCard(st);
  const a = tek.draw(st, 0, rngOf(3)).state;
  assert.equal(a.players[0].hand.length, 3);
  assert.deepEqual(a.discard, [top], 'üstteki kart yerinde kalır');
  assert.equal(tek.cardCount(a), 108);
  // Hiç kart kalmadıysa çekilemez, sıra geçer.
  const empty = mk({ hands: [['g1', 'g2'], ['b1', 'b2']], top: 'r7' });
  empty.players[1].hand.push(...empty.draw.splice(0));
  const e = tek.draw(empty, 0);
  assert.equal(e.state.players[0].hand.length, 2);
  assert.equal(e.state.turn, 1);
});

test('kazanma ve sıralama: az puan iyi; ayrılan en sonda', () => {
  const st = mk({ hands: [['r1'], ['g9', 'wW'], ['b1', 'b2'], ['yS', 'y1']], top: 'r7' });
  const out = tek.play(st, 0, idOf(st, 0, 'r1'));
  assert.equal(out.won, true);
  const a = out.state;
  assert.equal(a.winnerSeat, 0);
  assert.equal(a.phase, 'over');
  assert.equal(a.deadline, null);
  assert.deepEqual(a.result.map((r) => [r.seat, r.score, r.rank]), [[0, 0, 1], [2, 3, 2], [3, 21, 3], [1, 59, 4]]);
  assert.throws(() => tek.play(a, 1, a.players[1].hand[0]), /Oyun bitti/);
  assert.equal(tek.publicView(a, T0).turnSeat, null);
  assert.deepEqual(tek.playableCards(a, 1), []);

  const f = tek.forfeit(st, 'u2');
  assert.equal(f.players[2].out, true);
  assert.equal(f.players[2].hand.length, 0);
  assert.equal(tek.cardCount(f), 108, 'ayrılanın kartları desteye döner');
  const g = tek.play(f, 0, idOf(f, 0, 'r1')).state;
  assert.deepEqual(g.result.map((r) => r.seat), [0, 3, 1, 2]);
  assert.equal(g.result[3].left, true);
});

test('oyundan ayrılma: sıra geçer, tek kişi kalınca o kazanır, +4 kararı düşer', () => {
  let st = mk({ hands: [['r1', 'r2'], ['g1', 'g2'], ['b1', 'b2']], top: 'r7' });
  let a = tek.forfeit(st, 'u0', Math.random, T0 + 9);
  assert.equal(a.turn, 1);
  assert.equal(a.deadline, T0 + 9 + tek.TURN_MS);
  assert.equal(tek.seatOfUser(a, 'u0'), null);
  assert.equal(tek.nextSeat(a, 2), 1, 'düşen oyuncu atlanır');
  a = tek.forfeit(a, 'u1');
  assert.equal(a.winnerSeat, 2);
  assert.deepEqual(a.result.map((r) => r.seat), [2, 0, 1]);
  assert.equal(tek.forfeit(a, 'u2'), a, 'biten oyunda değişiklik olmaz');

  // +4 kararı bekleyen oyuncu ayrılırsa karar düşer, sıra ilerler.
  st = mk({ hands: [['wF', 'r1'], ['g1', 'g2'], ['b1', 'b2']], top: 'r7' });
  a = tek.play(st, 0, idOf(st, 0, 'wF'), 'y').state;
  const b = tek.forfeit(a, 'u1');
  assert.equal(b.phase, 'play');
  assert.equal(b.pending, null);
  assert.equal(b.turn, 2);
  // +4'ü atan ayrılırsa haklı itirazda kimse kart çekmez.
  const c = tek.challenge(tek.forfeit(a, 'u0'), 1, true);
  assert.equal(c.ok, true);
  assert.equal(c.state.players[1].hand.length, 2);
  assert.equal(c.state.turn, 1);
});

test('otomatik oyun: çeker / geçer / kabul eder; üst üste 3 kezden sonra oyundan düşer', () => {
  let st = mk({ hands: [['g1', 'r3'], ['b1', 'b2'], ['y1', 'y2']], top: 'r7', drawTop: ['r9'] });
  let a = tek.autoPlay(st, Math.random, T0 + tek.TURN_MS);
  assert.equal(a.auto, 0);
  assert.equal(a.state.players[0].hand.length, 3, 'otomatik: kart çeker, atmaz');
  assert.equal(a.state.players[0].auto, 1);
  assert.equal(a.state.turn, 1);
  assert.deepEqual(a.state.last.map((e) => e.t), ['draw', 'pass', 'auto']);

  st = mk({ hands: [['wF', 'g1'], ['g2', 'g3'], ['b2', 'b3']], top: 'r7' });
  a = tek.autoPlay(tek.play(st, 0, idOf(st, 0, 'wF'), 'g').state);
  assert.equal(a.state.players[1].hand.length, 6, 'otomatik: +4 kabul edilir');
  assert.equal(a.state.turn, 2);

  st = mk({ hands: [['g1', 'g2'], ['b1', 'b2'], ['y1', 'y2']], top: 'r7' });
  st.players[0].auto = tek.MAX_AUTO;
  a = tek.autoPlay(st);
  assert.equal(a.forfeited, 'u0');
  assert.equal(a.state.players[0].out, true);
  assert.equal(a.state.turn, 1);
  assert.equal(tek.markActive(st, 0).players[0].auto, 0);
});

test('süre sınırı: 15 dakika dolunca herkes birer kez daha oynar, el puana göre biter', () => {
  let st = mk({ hands: [['r1', 'r2', 'r3'], ['r4', 'g9', 'g8'], ['r5', 'wW', 'b9']], top: 'r7' });
  const late = T0 + tek.ROUND_MS + 1;
  st = tek.play(st, 0, idOf(st, 0, 'r1'), null, Math.random, late).state;
  assert.equal(st.lastTurns, 3);
  assert.equal(tek.publicView(st, late).lastRound, true);
  assert.equal(tek.publicView(st, late).roundMsLeft, 0);
  st = tek.play(st, 1, idOf(st, 1, 'r4'), null, Math.random, late).state;
  st = tek.play(st, 2, idOf(st, 2, 'r5'), null, Math.random, late).state;
  assert.equal(st.winnerSeat, null);
  st = tek.play(st, 0, idOf(st, 0, 'r2'), null, Math.random, late).state;
  assert.equal(st.phase, 'over');
  assert.deepEqual(st.result.map((r) => [r.seat, r.score]), [[0, 3], [1, 17], [2, 59]]);
  assert.equal(st.winnerSeat, 0);
});

test('gizlilik: herkese açık görünümde el ve deste yok; özel görünüm yalnızca kendi eli', () => {
  const st = tek.newGame(['a', 'b', 'c'], rngOf(7), T0);
  const pub = tek.publicView(st, T0 + 4000);
  const text = JSON.stringify(pub);
  assert.ok(!text.includes('hand') && !text.includes('"draw"') && !text.includes('discard'));
  assert.deepEqual(pub.players.map((p) => p.cards), [7, 7, 7]);
  assert.equal(pub.drawCount, 108 - 21 - 1);
  assert.equal(pub.turnMsLeft, tek.TURN_MS - 4000);
  assert.equal(pub.roundMsLeft, tek.ROUND_MS - 4000);
  const pv = tek.privateView(st, 'b');
  assert.equal(pv.hand.length, 7);
  assert.deepEqual(pv.hand.map((c) => c.id).sort((x, y) => x - y), [...st.players[1].hand].sort((x, y) => x - y));
  assert.equal(tek.privateView(st, 'zz'), null);
  const turnUser = st.players[st.turn].userId;
  assert.equal(tek.privateView(st, turnUser).canDraw, true);
  assert.ok(tek.privateView(st, turnUser).playable.every((id) => tek.canPlay(st, id)));
});

test('rastgele oyunlar: kart sayısı korunur, el 20\'yi aşmaz, oyun her zaman biter', () => {
  let finishedByWin = 0;
  let finishedByTime = 0;
  for (let g = 0; g < 400; g++) {
    const rng = rngOf(1000 + g);
    const n = 2 + (g % 8);
    let now = T0;
    let st = tek.newGame(Array.from({ length: n }, (_, i) => `u${i}`), rng, now);
    let steps = 0;
    while (st.winnerSeat === null) {
      steps += 1;
      assert.ok(steps < 5000, `oyun bitmedi (g=${g})`);
      now += 1000 + Math.floor(rng() * 9000);
      const seat = st.turn;
      const roll = rng();
      if (roll < 0.03) st = tek.autoPlay(st, rng, now).state;
      else if (roll < 0.035 && tek.activePlayers(st).length > 2) st = tek.forfeit(st, st.players[Math.floor(rng() * n)].userId, rng, now);
      else if (st.phase === 'challenge') st = tek.challenge(tek.markActive(st, seat), seat, rng() < 0.5, rng, now).state;
      else {
        const can = tek.playableCards(st, seat);
        if (can.length && (st.phase === 'drawn' ? rng() < 0.8 : rng() < 0.9)) {
          const id = can[Math.floor(rng() * can.length)];
          st = tek.play(tek.markActive(st, seat), seat, id, tek.isWild(id) ? tek.COLORS[Math.floor(rng() * 4)] : null, rng, now).state;
        } else if (st.phase === 'drawn') st = tek.pass(st, seat, now).state;
        else st = tek.draw(st, seat, rng, now).state;
      }
      assert.equal(tek.cardCount(st), 108, `kart sayısı (g=${g}, adım=${steps})`);
      assert.ok(st.players.every((p) => p.hand.length <= tek.HAND_MAX));
      assert.ok(st.winnerSeat !== null || !st.players[st.turn].out, 'sıra oyundaki birinde');
      assert.equal(new Set([...st.draw, ...st.discard, ...st.players.flatMap((p) => p.hand)]).size, 108, 'her kart tam bir yerde');
    }
    assert.equal(st.result.length, n);
    assert.deepEqual(st.result.map((r) => r.rank), Array.from({ length: n }, (_, i) => i + 1));
    assert.equal(st.result[0].seat, st.winnerSeat);
    assert.ok(!st.result[0].left);
    if (st.result[0].cards === 0) finishedByWin += 1; else finishedByTime += 1;
  }
  assert.ok(finishedByWin > 300, `çoğu oyun elini bitirenle biter (${finishedByWin}/${finishedByTime})`);
});

test('oyun sayfası: yer tutucular var, satır içi betik/stil yok (sıkı içerik güvenlik ilkesiyle çalışır)', async () => {
  const fs = await import('node:fs');
  const html = fs.readFileSync(new URL('../src/pages/tek.html', import.meta.url), 'utf8');
  assert.equal((html.match(/<script nonce="__NONCE__">/g) || []).length, 1);
  assert.equal((html.match(/<style nonce="__NONCE__">/g) || []).length, 1);
  assert.equal((html.match(/<script/g) || []).length, 1, 'nonce\'suz betik yok');
  for (const ph of ['__ROOM_ID__', '__LANG__', '__APP_VERSION__']) assert.ok(html.includes(ph), ph);
  assert.ok(!/\sstyle\s*=\s*["']/.test(html), 'satır içi style özelliği CSP ile engellenir');
  assert.ok(!/\son[a-z]+\s*=\s*["']/.test(html), 'satır içi olay işleyici yok');
  assert.ok(!/https?:\/\//.test(html.replace(/http:\/\/www\.w3\.org\/[^"']*/g, '')), 'dış adres yüklenmez');
  // Dört dilin anahtarları aynı olmalı (eksik çeviri kalmasın).
  const dict = html.slice(html.indexOf('const LANGS = {'), html.indexOf('const RULES = {'));
  const keys = (code) => [...dict.slice(dict.indexOf(`\n${code}: {`)).split('\n')[1].matchAll(/(?:^|[{,] )([A-Za-z0-9]+): '/g)].map((m) => m[1]).sort();
  const tr = keys('tr');
  assert.ok(tr.length > 50);
  for (const l of ['en', 'ar', 'hi']) assert.deepEqual(keys(l), tr, `çeviri anahtarları: ${l}`);
});
