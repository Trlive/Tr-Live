// Wild King: saf rastgele motor + istemci/sunucu şerit uyumu (her yerde); DB akışı (DATABASE_URL varsa).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../src/games/wild/engine.js';

test('Wild King: şeritler istemci dosyasıyla birebir aynı dizilir', () => {
  const src = fs.readFileSync(new URL('../src/games/wild/client/game.js', import.meta.url), 'utf8');
  const a = src.indexOf('function buildStrips(counts){');
  const b = src.indexOf('const gridFrom=', a);
  assert.ok(a > 0 && b > a, 'istemcide buildStrips bulunamadı');
  const fn = new Function('S10', 'SF', 'SH', 'SP', `${src.slice(a, b)}\nreturn buildStrips;`)(E.S10, E.SF, E.SH, E.SP);
  // istemci STRIPS'i global atar; çıktıyı yakalamak için eşdeğer çağrı
  let captured;
  const wrapped = new Function('S10', 'SF', 'SH', 'SP', `let STRIPS=[];\n${src.slice(a, b)}\nreturn (c)=>{buildStrips(c);return STRIPS};`)(E.S10, E.SF, E.SH, E.SP);
  captured = wrapped(E.STRIP_COUNTS);
  assert.deepEqual(captured, E.STRIPS);
  assert.equal(typeof fn, 'function');
  // istemcinin kullandığı şerit sayıları da aynı olmalı
  assert.ok(src.includes(JSON.stringify(E.STRIP_COUNTS).replace(/"/g, '')), 'istemcideki BAL_STRIPS sunucuyla aynı olmalı');
});

test('Wild King: ödeme tablosu ve değerlendirme', () => {
  // 5 Kaplan (7) üst çizgide: 1000 × çizgi bahsi
  const g = [[7, 0, 0], [7, 0, 0], [7, 0, 0], [7, 0, 0], [7, 0, 0]];
  const R = E.evalGrid(g.map((c) => [c[0], c[1], c[2]]), 10);
  assert.equal(R.lines.find((l) => l.li === 1)?.amt, 10000); // 0 = üst çizgi satırı ('00000')
  // ödeme çarpanı yalnızca aşağı yuvarlayarak uygulanır
  assert.equal(E.evalGrid(g, 10, 0.95).lines.find((l) => l.li === 1).amt, 9500);
  // 3 FREE → 3 spin, 4 → 6, 5 → 10
  assert.equal(E.freeCount(3), 3); assert.equal(E.freeCount(4), 6); assert.equal(E.freeCount(5), 10); assert.equal(E.freeCount(2), 0);
  assert.equal(E.tierFor(5000), 'mini'); assert.equal(E.tierFor(499999), 'mega'); assert.equal(E.tierFor(4999), null);
});

test('Wild King: saf rastgele geri ödeme makul aralıkta (çarpan 1)', () => {
  let wag = 0, paid = 0;
  for (let i = 0; i < 250000; i++) { wag += E.NL; paid += E.spinOnce(1).R.win; }
  const rtp = paid / wag * 100; // yalnızca hat kazançları (free/bonus hariç) ≈ %93
  assert.ok(rtp > 80 && rtp < 108, `hat RTP beklenmedik: ${rtp.toFixed(1)}`);
});

test('Wild King: Çılgın Slot değerlendirmesi', () => {
  assert.deepEqual(E.crzEval(['x5', 'x5', 'x5'], 1000), { gain: 5000, extra: 0 });
  assert.deepEqual(E.crzEval(['x2', 'x2', 'blank'], 1000), { gain: 500, extra: 0 });
  assert.deepEqual(E.crzEval(['+1', '+1', 'x2'], 1000), { gain: 0, extra: 2 });
  assert.equal(E.crzEval(['x10', 'x10', 'x10'], 1000, 0.95).gain, 9500);
});

const HAS_DB = !!process.env.DATABASE_URL;
const T = HAS_DB ? test : test.skip;

function handler(router, method, p) {
  if (router.routes) return router.routes.find((r) => r.method === method && r.path === p).handlers.at(-1); // yerel deneme yönlendiricisi
  const layer = router.stack.find((l) => l.route && l.route.path === p && l.route.methods[method.toLowerCase()]);
  return layer.route.stack.at(-1).handle;
}

T('Wild King: spin/bonus/kumar Coin bakiyesini tutarlı değiştirir', async () => {
  process.env.JWT_SECRET ||= 'test-secret-test-secret-test-secret';
  const { query } = await import('../src/database.js');
  const { wildRouter } = await import('../src/games/wild.js');
  const sfx = Math.random().toString(36).slice(2, 8);
  const uid = (await query(`INSERT INTO users(username, display_name, coins) VALUES($1,$1,100000) RETURNING id`, ['wk_' + sfx])).rows[0].id;
  const call = async (method, p, body = {}) => {
    let out; const res = { json: (v) => { out = v; } };
    await handler(wildRouter, method, p)({ wk: { userId: uid }, body, get: () => '' }, res);
    return out;
  };
  const coins = async () => Number((await query(`SELECT coins FROM users WHERE id = $1`, [uid])).rows[0].coins);
  try {
    const st = await call('GET', '/state');
    assert.equal(st.balance, 100000);
    assert.equal(st.config.payFactor > 0 && st.config.payFactor <= 1, true);
    // spinler: bakiye = önceki - bahis + kazanç (her adımda)
    let bal = 100000;
    for (let i = 0; i < 8; i++) {
      const r = await call('POST', '/spin', { betIdx: 0 });
      if (r.isFree) { assert.equal(r.balance, bal + r.win); } else { assert.equal(r.balance, bal - 200 + r.win); }
      bal = r.balance;
      assert.equal(await coins(), bal);
      assert.equal(r.g.length, 5);
    }
    // yetersiz bakiye
    await query(`UPDATE users SET coins = 100 WHERE id = $1`, [uid]);
    await query(`UPDATE wild_king_state SET free_left = 0 WHERE user_id = $1`, [uid]);
    await assert.rejects(call('POST', '/spin', { betIdx: 0 }), (e) => e.status === 402);
    // geçersiz bahis
    await assert.rejects(call('POST', '/spin', { betIdx: 99 }), (e) => e.status === 400);
    // Çılgın Slot: bilet → aç → bitene kadar çevir; kazanç kadar Coin eklenir
    await query(`UPDATE users SET coins = 50000 WHERE id = $1`, [uid]);
    await query(`UPDATE wild_king_state SET tickets = 1, ticket_bets = '[1000]' WHERE user_id = $1`, [uid]);
    const o = await call('POST', '/crazy/open');
    assert.equal(o.base, 1000); assert.equal(o.tickets, 0);
    await assert.rejects(call('POST', '/spin', { betIdx: 0 }), (e) => e.status === 409, 'bonus açıkken spin olmamalı');
    let last; for (let i = 0; i < 60; i++) { last = await call('POST', '/crazy/spin'); if (last.done) break; }
    assert.equal(last.done, true);
    assert.equal(await coins(), 50000 + last.win);
    // Kart kumarı: kazanç koyulur, kaybedince 0, alınca iade
    await query(`UPDATE users SET coins = 10000 WHERE id = $1`, [uid]);
    await query(`UPDATE wild_king_state SET gamble_avail = 3000 WHERE user_id = $1`, [uid]);
    const gs = await call('POST', '/gamble/start');
    assert.equal(gs.stake, 3000); assert.equal(await coins(), 7000);
    const gp = await call('POST', '/gamble/pick', { color: 'r' });
    if (gp.win && !gp.done) { const t = await call('POST', '/gamble/take'); assert.equal(t.balance, 7000 + gp.stake); }
    else assert.equal(await coins(), gp.win ? 7000 + gp.stake : 7000);
    await assert.rejects(call('POST', '/gamble/start'), (e) => e.status === 409, 'fırsat bir kez kullanılır');
  } finally {
    for (const sql of [`DELETE FROM wild_king_spins WHERE user_id=$1`, `DELETE FROM wallet_transactions WHERE user_id=$1`, `DELETE FROM wild_king_state WHERE user_id=$1`, `DELETE FROM users WHERE id=$1`]) await query(sql, [uid]).catch(() => {});
  }
});
