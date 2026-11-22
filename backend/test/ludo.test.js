import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame, roll, move, legalMoves, cellOf, SAFE_CELLS, forfeit, autoPlay, pickAuto, FINISH, TURN_MS, MAX_AUTO, seatOfUser, markActive,
} from '../src/modules/games/ludo.rules.js';

const seq = (...vals) => { let i = 0; return () => (vals[i++ % vals.length] - 1) / 6 + 0.001; }; // zar = verilen değer
const U = ['a', 'b', 'c', 'd'];

test('2 oyuncuda koltuklar karşılıklıdır, 4 oyuncuda sıralıdır', () => {
  assert.deepEqual(newGame(['a', 'b'], 0).players.map((p) => p.seat), [0, 2]);
  assert.deepEqual(newGame(U, 0).players.map((p) => p.seat), [0, 1, 2, 3]);
  assert.throws(() => newGame(['a'], 0));
});

test('üsten çıkmak için 6 gerekir', () => {
  const st = newGame(['a', 'b'], 0);
  const r = roll(st, 0, seq(3), 0);
  assert.equal(r.skipped, true, '3 ile üsten çıkılmaz, hamle yok');
  assert.equal(r.state.turn, 2);
});

// ---------------------------------------------------------------------------
// SAHİBİNİN KURALI: 6 OYNATMAZ, BİRİKİR
//   "Misal bir 6 attı, hemen oynatma, 2. zar hakkını da çevirt; misal 3 geldi:
//    bir 6 oynama bir 3 oynama hakkı olacak. 6+6+5 geldi diyelim, bunda da
//    iki altı bir 5 oynayacak."
// ---------------------------------------------------------------------------

test('6 atınca taş OYNATILMAZ, tekrar atılır', () => {
  const st = newGame(['a', 'b'], 0);
  const r = roll(st, 0, seq(6), 0);
  assert.equal(r.rollAgain, true, 'tekrar atacak');
  assert.equal(r.skipped, false);
  assert.deepEqual(r.legal, [], 'oynanacak bir şey yok');
  assert.equal(r.state.dice, null, 'oynanabilir değer yok');
  assert.deepEqual(r.state.pending, [6], '6 biriktirildi');
  assert.equal(r.state.turn, 0, 'sıra hâlâ aynı oyuncuda');
  // Zar atılmadan hamle yapılamaz.
  assert.throws(() => move(r.state, 0, 0, 0), /zar/);
});

test('6 sonra 3: bir 6 bir 3 oynama hakkı (sahibinin örneği)', () => {
  let st = newGame(['a', 'b'], 0);
  st = roll(st, 0, seq(6), 0).state;
  const r = roll(st, 0, seq(3), 0);
  assert.equal(r.rollAgain, false, '3 geldi, kuyruk kapandı');
  assert.deepEqual(r.state.pending, [6, 3], 'iki sonuç birikti');
  assert.equal(r.state.dice, 6, 'önce 6 oynanır');

  // 6 ile taş üsten çıkar; sıra GEÇMEZ, 3 kalır.
  const m1 = move(r.state, 0, 0, 0);
  assert.equal(m1.state.tokens[0][0], 0, 'taş başlangıç karesine çıktı');
  assert.equal(m1.state.turn, 0, 'sıra aynı oyuncuda');
  assert.deepEqual(m1.state.pending, [3], '3 kaldı');
  assert.equal(m1.state.dice, 3);

  // 3 oynanır, kuyruk boşalır, sıra geçer.
  const m2 = move(m1.state, 0, 0, 0);
  assert.equal(m2.state.tokens[0][0], 3, '0 → 3');
  assert.deepEqual(m2.state.pending, []);
  assert.equal(m2.state.turn, 2, 'kuyruk boşaldı, sıra geçti');
});

test('6+6+5: iki altı ve bir 5 oynanır (sahibinin örneği)', () => {
  let st = newGame(['a', 'b'], 0);
  st = roll(st, 0, seq(6), 0).state;
  st = roll(st, 0, seq(6), 0).state;
  assert.deepEqual(st.pending, [6, 6], 'iki 6 birikti');
  assert.equal(st.dice, null, 'hâlâ oynanmıyor');

  const r = roll(st, 0, seq(5), 0);
  assert.deepEqual(r.state.pending, [6, 6, 5], 'üç sonuç');
  assert.equal(r.state.dice, 6);

  // İlk 6: bir taş üsten çıkar.
  let m = move(r.state, 0, 0, 0);
  assert.equal(m.state.tokens[0][0], 0);
  assert.deepEqual(m.state.pending, [6, 5]);
  // İkinci 6: ikinci taş üsten çıkar (ya da ilk taş 6 ilerler) — oyuncu seçer.
  m = move(m.state, 0, 1, 0);
  assert.equal(m.state.tokens[0][1], 0, 'ikinci taş da çıktı');
  assert.deepEqual(m.state.pending, [5]);
  // 5: kalan değer oynanır, sıra geçer.
  m = move(m.state, 0, 0, 0);
  assert.equal(m.state.tokens[0][0], 5);
  assert.equal(m.state.turn, 2);
});

test('6 ekstra tur VERMEZ: 6 oynamak turu uzatmaz', () => {
  // Eski kuralda `dice === 6` ekstra tur veriyordu. Artık 6 zaten tekrar atma hakkı
  // kazandırdığı için ikinci kez ödül verilmiyor; yoksa tur hiç bitmezdi.
  let st = newGame(['a', 'b'], 0);
  st = roll(st, 0, seq(6), 0).state;
  st = roll(st, 0, seq(1), 0).state;   // pending [6, 1]
  st = move(st, 0, 0, 0).state;        // 6 oynandı → üsten çıktı
  const m = move(st, 0, 0, 0);         // 1 oynandı → kuyruk boş
  assert.equal(m.extraTurn, false);
  assert.equal(m.state.turn, 2, 'sıra geçti');
});

test('sıra kontrolü ve çift zar engeli', () => {
  const st = newGame(['a', 'b'], 0);
  assert.throws(() => roll(st, 2, seq(6), 0), /Sıra/);
  // 6 attıktan sonra TEKRAR atmak serbest (kural bu); oynanabilir değer varken yasak.
  const afterSix = roll(st, 0, seq(6), 0).state;
  const playable = roll(afterSix, 0, seq(3), 0).state;   // pending [6, 3], dice = 6
  assert.throws(() => roll(playable, 0, seq(6), 0), /zaten/, 'oynanacak zar varken atılamaz');
  assert.throws(() => move(newGame(['a', 'b'], 0), 0, 0, 0), /zar/);
  assert.throws(() => move(playable, 0, 9, 0), /Geçersiz/);
});

test('üst üste üç altı: biriken her şey DÜŞER ve sıra geçer', () => {
  let st = newGame(['a', 'b'], 0);
  st = roll(st, 0, seq(6), 0).state;   // 1. altı → biriktir
  st = roll(st, 0, seq(6), 0).state;   // 2. altı → biriktir
  assert.deepEqual(st.pending, [6, 6]);
  const r = roll(st, 0, seq(6), 0);    // 3. altı
  assert.equal(r.skipped, true);
  assert.deepEqual(r.state.pending, [], 'biriken iki 6 da düştü');
  assert.equal(r.state.dice, null);
  assert.equal(r.state.turn, 2, 'sıra geçti');
  // Taşların hiçbiri oynanmadı: tur tamamen kaybedildi.
  assert.deepEqual(r.state.tokens[0], [-1, -1, -1, -1]);
});

test('rakip taşı yakalanır, güvenli karede yakalanmaz', () => {
  const st = newGame(['a', 'b'], 0);
  // Koltuk 0 taşı ilerleme 5 → küresel 5. Koltuk 2 taşı ilerleme 31 → (26+31)%52 = 5.
  st.tokens[0] = [4, -1, -1, -1];
  st.tokens[2] = [31, -1, -1, -1];
  st.dice = 1;
  const m = move(st, 0, 0, 0);
  assert.equal(m.captured.length, 1);
  assert.equal(m.state.tokens[2][0], -1);
  assert.equal(m.extraTurn, true);
  // Güvenli kare (küresel 8): ilerleme 8, rakip 34
  const s2 = newGame(['a', 'b'], 0);
  s2.tokens[0] = [7, -1, -1, -1]; s2.tokens[2] = [34, -1, -1, -1]; s2.dice = 1;
  assert.ok(SAFE_CELLS.has(cellOf(0, 8)));
  const m2 = move(s2, 0, 0, 0);
  assert.equal(m2.captured.length, 0);
  assert.equal(m2.state.tokens[2][0], 34);
});

test('bitişe tam sayı gerekir; bitirince ekstra tur', () => {
  const st = newGame(['a', 'b'], 0);
  st.tokens[0] = [54, 56, 56, 56]; st.dice = 3;
  assert.deepEqual(legalMoves(st, 0, 3), []);
  assert.deepEqual(legalMoves(st, 0, 2), [0]);
  st.dice = 2;
  const m = move(st, 0, 0, 0);
  assert.equal(m.won, true);
  assert.equal(m.state.winnerSeat, 0);
});

test('hamle yoksa sıra otomatik geçer', () => {
  const st = newGame(['a', 'b'], 0);
  st.tokens[0] = [55, 56, 56, 56];
  const r = roll(st, 0, seq(4), 0);
  assert.equal(r.skipped, true);
  assert.equal(r.state.turn, 2);
});

test('AFK: otomatik oynar, MAX_AUTO sonrası elenir', () => {
  let st = newGame(['a', 'b', 'c'], 0);
  let guard = 0;
  while (st.players.some((p) => p.userId === 'a') && guard++ < 200) {
    if (st.turn === 0) {
      const before = st.players.find((p) => p.userId === 'a').auto;
      const r = autoPlay(st, seq(6, 2, 6, 3), 1000);
      st = r.state;
      if (r.forfeited) { assert.equal(r.forfeited, 'a'); assert.equal(before, MAX_AUTO); break; }
    } else {
      st.turn = 0; st.dice = null;
    }
  }
  assert.ok(!st.players.some((p) => p.userId === 'a'));
  assert.equal(st.players.length, 2);
});

test('markActive AFK sayacını sıfırlar', () => {
  let st = newGame(['a', 'b'], 0);
  st.players[0].auto = 2;
  st = markActive(st, 0);
  assert.equal(st.players[0].auto, 0);
});

test('forfeit: iki kişiden biri çıkarsa diğeri kazanır', () => {
  const st = forfeit(newGame(['a', 'b'], 0), 'a', 0);
  assert.equal(st.winnerSeat, 2);
  const s3 = forfeit(newGame(['a', 'b', 'c'], 0), 'a', 5);
  assert.equal(s3.winnerSeat, null);
  assert.equal(s3.turn, 1);
  assert.equal(s3.deadline, 5 + TURN_MS);
});

test('pickAuto bitirmeyi yakalamaya, yakalamayı çıkışa tercih eder', () => {
  const st = newGame(['a', 'b'], 0);
  st.tokens[0] = [52, 10, -1, -1]; st.dice = 4;
  assert.equal(pickAuto(st, 0), 0);
  const s2 = newGame(['a', 'b'], 0);
  s2.tokens[0] = [4, -1, -1, -1]; s2.tokens[2] = [31, -1, -1, -1]; s2.dice = 1;
  assert.equal(pickAuto(s2, 0), 0);
});

test('seatOfUser', () => {
  const st = newGame(['a', 'b'], 0);
  assert.equal(seatOfUser(st, 'b'), 2);
  assert.equal(seatOfUser(st, 'x'), null);
});

test('4 oyunculu tam oyun simülasyonu bir kazanan ile biter', () => {
  let seed = 12345;
  const rng = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  let st = newGame(U, 0);
  let steps = 0;
  while (st.winnerSeat === null && steps++ < 20000) {
    const seat = st.turn;
    const r = roll(st, seat, rng, steps);
    st = r.state;
    // 6 geldi: taş oynatılmıyor, oyuncu tekrar atıyor.
    if (r.rollAgain) continue;
    if (!r.skipped) {
      // Biriken zarların hepsini oyna (en çok üç değer olabilir).
      for (let g = 0; g < 4 && st.dice !== null && st.turn === seat && st.winnerSeat === null; g++) {
        const pick = pickAuto(st, seat);
        if (pick === null) break;
        st = move(st, seat, pick, steps).state;
      }
    }
    for (const sSeat of Object.keys(st.tokens)) for (const p of st.tokens[sSeat]) assert.ok(p >= -1 && p <= FINISH);
  }
  assert.notEqual(st.winnerSeat, null, 'oyun bitmeli');
  assert.ok(st.tokens[st.winnerSeat].every((p) => p === FINISH));
});

test('AFK oyuncu 6 atarsa SIRASINI KAYBETMEZ, tekrar atar', () => {
  // Gerçek hata: autoPlay 6 attıktan sonra st.dice null kalıyor, pickAuto boş dönüyor ve
  // oyuncu tekrar atmak yerine turunu kaybediyordu.
  const st = newGame(['a', 'b'], 0);
  const r = autoPlay(st, seq(6, 2), 0);
  assert.equal(r.forfeited, null);
  // 6 biriktirildi, 2 ile kuyruk kapandı, 6 oynanıp taş üsten çıktı.
  assert.equal(r.state.tokens[0][0] >= 0, true, 'taş oynandı, tur kaybedilmedi');
});

test('AFK: biriken zarların hepsi tek zaman aşımında oynanır', () => {
  const st = newGame(['a', 'b'], 0);
  // 6, 6, 1 → iki taş üsten çıkar, sonra 1 oynanır.
  const r = autoPlay(st, seq(6, 6, 1), 0);
  assert.deepEqual(r.state.pending, [], 'kuyruk boşaldı');
  const out = r.state.tokens[0].filter((p) => p >= 0).length;
  assert.ok(out >= 1, 'en az bir taş oyunda');
});

test('kuyruğun arkasındaki değer, önündeki oynandıktan sonra oynanabilir hale gelir', () => {
  // Dört taş da üste: 2 ile hamle YOK, 6 ile üsten çıkılır. Kuyruk [6, 2].
  // 2'yi baştan atmak YANLIŞ olurdu: 6 oynanınca taş 0'a çıkıyor ve 2 oynanabilir oluyor.
  // Bu yüzden yalnızca kuyruğun BAŞINDAKİ oynanamayan değerler düşüyor.
  let st = roll(newGame(['a', 'b'], 0), 0, seq(6), 0).state;
  const r = roll(st, 0, seq(2), 0);
  assert.equal(r.skipped, false);
  assert.equal(r.state.dice, 6, 'önce 6 oynanır');
  assert.deepEqual(r.state.pending, [6, 2], '2 kuyrukta bekliyor');
  st = move(r.state, 0, 0, 0).state;
  assert.equal(st.tokens[0][0], 0, 'taş üsten çıktı');
  assert.equal(st.dice, 2, 'şimdi 2 oynanabilir');
  assert.equal(st.turn, 0, 'sıra hâlâ aynı oyuncuda');
  st = move(st, 0, 0, 0).state;
  assert.equal(st.tokens[0][0], 2, '0 → 2');
  assert.equal(st.turn, 2, 'kuyruk boşaldı, sıra geçti');
});

test('kuyruğun BAŞINDAKİ oynanamayan değer düşer', () => {
  // Taş ev yolunun sonunda: büyük zar oynanamaz, küçük oynanır.
  const st = newGame(['a', 'b'], 0);
  // Üç taş bitişte, biri 54'te. FINISH = 56, yani 54+6 = 60 taşmış olur ama 54+2 = 56 tam.
  // Üste taş BIRAKMIYORUZ: üstteki taş 6 ile çıkabildiği için 6 oynanabilir olurdu.
  st.tokens[0] = [54, FINISH, FINISH, FINISH];
  let s2 = roll(st, 0, seq(6), 0).state;   // 6 birikir (oynanamaz)
  const r = roll(s2, 0, seq(2), 0);        // kuyruk [6, 2]; 6 oynanamaz → düşer
  assert.equal(r.skipped, false);
  assert.deepEqual(r.state.pending, [2], 'oynanamayan 6 düştü');
  assert.equal(r.state.dice, 2);
  s2 = move(r.state, 0, 0, 0).state;
  assert.equal(s2.tokens[0][0], FINISH, 'taş bitişe ulaştı (54 + 2 = 56)');
});

test('tek atışta 6 olmayan değer: davranış eskisi gibi', () => {
  const st = newGame(['a', 'b'], 0);
  st.tokens[0] = [5, -1, -1, -1];
  const r = roll(st, 0, seq(4), 0);
  assert.equal(r.rollAgain, false);
  assert.deepEqual(r.state.pending, [4]);
  assert.equal(r.state.dice, 4);
  const m = move(r.state, 0, 0, 0);
  assert.equal(m.state.tokens[0][0], 9);
  assert.equal(m.state.turn, 2, 'tek değer oynandı, sıra geçti');
});
