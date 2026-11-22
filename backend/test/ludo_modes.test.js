import test from 'node:test';
import assert from 'node:assert/strict';
import * as ludo from '../src/modules/games/ludo.rules.js';

const T0 = 1_700_000_000_000;
const seq = (...v) => { let i = 0; return () => (v[i++ % v.length] - 0.5) / 6; }; // zar değerleri sırayla
const game = (mode, n = 2) => ludo.newGame(Array.from({ length: n }, (_, i) => `u${i}`), T0, { mode });
// Belirli bir zarla hamle: sıradaki oyuncu atar ve [token] taşını oynar.
function play(st, seat, dice, token) {
  const r = ludo.roll(st, seat, seq(dice), T0);
  assert.equal(r.dice, dice);
  return ludo.move(r.state, seat, token, T0);
}

test('modlar: varsayılan klasik; bilinmeyen mod klasik sayılır; eski durum (mod yok) klasik', () => {
  assert.equal(ludo.newGame(['a', 'b'], T0).mode, 'classic');
  assert.equal(game('quick').mode, 'quick');
  assert.equal(game('items').mode, 'items');
  assert.equal(game('xyz').mode, 'classic');
  const old = game('classic'); delete old.mode; delete old.kills; delete old.frozen; delete old.seq;
  assert.equal(ludo.modeOf(old), 'classic');
  // 6 artık oynatmıyor, biriktiriyor: kuyruk 6 olmayan bir değerle kapanır.
  // Eski durumda `pending` alanı hiç yok; kurallar bunu da taşımalı.
  const rng = seq(6, 1);
  let cur = ludo.roll(old, 0, rng, T0).state;
  assert.equal(cur.dice, null, '6 oynanmıyor');
  cur = ludo.roll(cur, 0, rng, T0).state;         // 1 → kuyruk kapandı: [6, 1]
  const m = ludo.move(cur, 0, 0, T0);
  assert.equal(m.state.tokens[0][0], 0, 'eski durumla oyun sürer');
  assert.ok(m.state.seq > 0);
});

test('eşya kareleri: 12 eşya, hiçbiri güvenli karede değil, her bölgede bir kapı', () => {
  const cells = Object.keys(ludo.ITEM_CELLS).map(Number);
  assert.equal(cells.length, 12);
  assert.ok(cells.every((c) => !ludo.SAFE_CELLS.has(c)));
  assert.deepEqual(cells.filter((c) => ludo.ITEM_CELLS[c] === 'portal'), [5, 18, 31, 44]);
  const count = (t) => cells.filter((c) => ludo.ITEM_CELLS[c] === t).length;
  assert.deepEqual(['dice', 'rocket', 'bomb', 'ice'].map(count), [2, 2, 2, 2]);
});

test('seri mod: tek taş bitişe varınca kazanılır; kırma yoksa ev yoluna girilemez (barikat)', () => {
  let st = game('quick');
  st.tokens[0] = [49, -1, -1, -1];
  assert.deepEqual(ludo.legalMoves(st, 0, 1), [0], 'ana yolda ilerleyebilir');
  assert.deepEqual(ludo.legalMoves(st, 0, 2), [], 'başlangıcın bir gerisine denk gelen hamle yok');
  assert.equal(ludo.roll(st, 0, seq(2), T0).skipped, true);
  assert.equal(ludo.targetOf(st, 0, 49, 3), 0, 'kırma yokken ev yoluna girmez, bir tur daha döner');
  assert.equal(play(st, 0, 5, 0).state.tokens[0][0], 2);
  st.kills[0] = 1;
  assert.deepEqual(ludo.legalMoves(st, 0, 3), [0]);
  st.tokens[0] = [53, -1, -1, -1];
  const m = play(st, 0, 3, 0);
  assert.equal(m.won, true);
  assert.equal(m.state.winnerSeat, 0);
  // Klasikte tek taş yetmez.
  const c = game('classic');
  c.tokens[0] = [53, -1, -1, -1];
  const mc = play(c, 0, 3, 0);
  assert.equal(mc.won, false);
  assert.equal(mc.extraTurn, true);
  assert.deepEqual(ludo.legalMoves(c, 0, 3), [0], 'klasikte barikat yok');
});

test('seri mod: kırma sayılır ve barikatı açar', () => {
  const st = game('quick');
  st.tokens[0] = [3, -1, -1, -1];
  st.tokens[2] = [30, -1, -1, -1]; // koltuk 2, ilerleme 30 → küresel kare (26+30)%52 = 4
  const m = play(st, 0, 1, 0);
  assert.equal(m.captured.length, 1);
  assert.equal(m.state.kills[0], 1);
  assert.equal(m.state.tokens[2][0], -1);
  assert.equal(m.extraTurn, true);
});

test('eşyalı mod: zar (+1 hak), bomba (üsse döner), kapı (16 kare ileri, güvenli kare)', () => {
  let st = game('items');
  st.tokens[0] = [0, -1, -1, -1];
  let m = play(st, 0, 2, 0); // kare 2: zar
  assert.equal(m.state.tokens[0][0], 2);
  assert.equal(m.extraTurn, true);
  assert.equal(m.state.turn, 0);
  assert.deepEqual(m.state.log.at(-1).fx, [{ item: 'dice' }]);

  st = game('items');
  st.tokens[0] = [7, -1, -1, -1];
  m = play(st, 0, 3, 0); // kare 10: bomba
  assert.equal(m.state.tokens[0][0], -1);
  assert.equal(m.state.turn, 2);
  assert.equal(m.state.log.at(-1).land, 10);
  assert.equal(m.state.log.at(-1).to, -1);

  st = game('items');
  st.tokens[0] = [4, -1, -1, -1];
  m = play(st, 0, 1, 0); // kare 5: kapı → 21 (yıldız)
  assert.equal(m.state.tokens[0][0], 21);
  assert.ok(ludo.SAFE_CELLS.has(ludo.cellOf(0, 21)));
  // Ev yoluna taşacaksa kapı çalışmaz: koltuk 0 için ilerleme 44 (kare 44, kapı) + 16 > 50.
  st = game('items');
  st.tokens[0] = [43, -1, -1, -1];
  m = play(st, 0, 1, 0);
  assert.equal(m.state.tokens[0][0], 44);
  assert.deepEqual(m.state.log.at(-1).fx, []);
  // Klasik modda eşya yok.
  st = game('classic');
  st.tokens[0] = [7, -1, -1, -1];
  assert.equal(play(st, 0, 3, 0).state.tokens[0][0], 10);
});

test('eşyalı mod: füze ilerideki en yakın rakibi üsse yollar (güvenli karedekine dokunmaz)', () => {
  const st = game('items', 3);
  st.tokens[0] = [13, -1, -1, -1];
  st.tokens[1] = [8, 10, -1, -1]; // koltuk 1: kareler 21 (güvenli), 23
  st.tokens[2] = [0, -1, -1, -1]; // kare 26 (güvenli)
  const m = play(st, 0, 2, 0); // kare 15: füze
  assert.equal(m.state.tokens[1][0], 8, 'güvenli karedeki taş korunur');
  assert.equal(m.state.tokens[1][1], -1, 'ilk korunmasız rakip taşı üsse döner');
  assert.equal(m.state.kills[0], 1);
  assert.equal(m.extraTurn, true);
  assert.deepEqual(m.state.log.at(-1).fx, [{ item: 'rocket', seat: 1, token: 1 }]);
  // İleride rakip yoksa etkisiz.
  const lone = game('items');
  lone.tokens[0] = [13, -1, -1, -1];
  const m2 = play(lone, 0, 2, 0);
  assert.deepEqual(m2.state.log.at(-1).fx, []);
  assert.equal(m2.extraTurn, false);
});

test('eşyalı mod: buz en yakın rakibin sahibine bir tur atlatır', () => {
  let st = game('items', 3);
  st.tokens[0] = [20, -1, -1, -1];
  st.tokens[1] = [15, -1, -1, -1]; // kare 28
  let m = play(st, 0, 3, 0); // kare 23: buz
  assert.deepEqual(m.state.frozen, [], 'sıra geçerken dondurulan atlandı ve çözüldü');
  assert.equal(m.state.turn, 2, 'koltuk 1 atlandı');
  assert.ok(m.state.log.some((e) => e.event === 'frozen_skip' && e.seat === 1));
  // İki kişide: rakip atlanır, sıra yine bende.
  st = game('items');
  st.tokens[0] = [20, -1, -1, -1];
  st.tokens[2] = [5, -1, -1, -1]; // kare 31
  m = play(st, 0, 3, 0);
  assert.equal(m.state.turn, 0);
  assert.deepEqual(m.state.frozen, []);
});

test('otomatik oyun bombadan kaçınır; ayrılan oyuncunun kayıtları temizlenir', () => {
  const st = game('items', 3);
  st.tokens[0] = [7, 20, -1, -1];
  st.dice = 3;
  assert.equal(ludo.pickAuto(st, 0), 1, 'bombaya (kare 10) gitmez');
  st.frozen = [1];
  const f = ludo.forfeit(st, 'u1', T0);
  assert.deepEqual(f.frozen, []);
  assert.equal(f.kills[1], undefined);
  assert.ok(f.seq > st.seq);
});

test('rastgele oyunlar: üç modda da oyun biter ve taş konumları geçerlidir', () => {
  let s = 12345;
  const rng = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (const mode of ludo.MODES) {
    for (let g = 0; g < 40; g++) {
      let st = ludo.newGame(Array.from({ length: 2 + (g % 3) }, (_, i) => `u${i}`), T0, { mode });
      let steps = 0;
      while (st.winnerSeat === null) {
        steps += 1;
        assert.ok(steps < 20000, `bitmedi: ${mode}`);
        const seat = st.turn;
        const r = ludo.roll(st, seat, rng, T0);
        st = r.state;
        // 6 geldi: taş oynatılmıyor, oyuncu tekrar atıyor.
        if (r.rollAgain) continue;
        if (!r.skipped) {
          // Biriken zarların hepsi oynanır (en çok üç değer).
          for (let g2 = 0; g2 < 4 && st.dice !== null && st.turn === seat && st.winnerSeat === null; g2++) {
            const legal = ludo.legalMoves(st, seat, st.dice);
            if (!legal.length) break;
            st = ludo.move(st, seat, legal[Math.floor(rng() * legal.length)], T0).state;
          }
        }
        for (const p of st.players) assert.ok(st.tokens[p.seat].every((q) => Number.isInteger(q) && q >= -1 && q <= ludo.FINISH));
        assert.ok(st.winnerSeat !== null || st.players.some((p) => p.seat === st.turn));
      }
      const w = st.tokens[st.winnerSeat];
      if (mode === 'quick') assert.ok(w.includes(ludo.FINISH) && st.kills[st.winnerSeat] > 0, 'seri: kırma + bir taş');
      else assert.ok(w.every((q) => q === ludo.FINISH));
    }
  }
});

test('ludo sayfası: yer tutucular var, satır içi betik/stil yok, dört dilin anahtarları aynı', async () => {
  const fs = await import('node:fs');
  const html = fs.readFileSync(new URL('../src/pages/ludo.html', import.meta.url), 'utf8');
  assert.equal((html.match(/<script nonce="__NONCE__">/g) || []).length, 1);
  assert.equal((html.match(/<script/g) || []).length, 1);
  assert.equal((html.match(/<style nonce="__NONCE__">/g) || []).length, 1);
  for (const ph of ['__ROOM_ID__', '__LANG__', '__APP_VERSION__']) assert.ok(html.includes(ph), ph);
  assert.ok(!/\sstyle\s*=\s*["']/.test(html), 'satır içi style özelliği CSP ile engellenir');
  assert.ok(!/\son[a-z]+\s*=\s*["']/.test(html), 'satır içi olay işleyici yok');
  assert.ok(!html.includes('color-mix('), 'eski WebView sürümlerinde çalışmayan CSS yok');
  const dict = html.slice(html.indexOf('const LANGS = {'), html.indexOf('const RULES = {'));
  const keys = (code) => [...dict.split('\n').find((l) => l.startsWith(`${code}: {`)).matchAll(/(?:\{ |", )([A-Za-z0-9]+): "/g)].map((m) => m[1]).sort();
  const tr = keys('tr');
  assert.ok(tr.length > 50, String(tr.length));
  for (const l of ['en', 'ar', 'hi']) assert.deepEqual(keys(l), tr, `çeviri anahtarları: ${l}`);
});
