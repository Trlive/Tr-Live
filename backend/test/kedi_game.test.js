// Kedi Çarkı: Coin cüzdanı (idempotent) + WebSocket girişi (bilet + izin) + bir bahis.
// Gerçek PostgreSQL ister; DATABASE_URL yoksa atlanır.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const HAS_DB = !!process.env.DATABASE_URL;
const T = HAS_DB ? test : test.skip;

T('Kedi Çarkı: cüzdan idempotent, WS bilet+izin ister, bahis Coin düşer', async () => {
  process.env.JWT_SECRET ||= 'test-secret-test-secret-test-secret';
  const { query } = await import('../src/database.js');
  const { attachRealtime } = await import('../src/realtime.js');
  const { startKedi, CoinWallet } = await import('../src/games/kedi.js');
  const { issueGameToken } = await import('../src/routes/activities.js');
  const { default: WebSocket } = await import('ws');

  const sfx = Math.random().toString(36).slice(2, 8);
  const u = (await query(`INSERT INTO users(username, display_name, coins) VALUES($1,$1,10000) RETURNING id`, ['kedi_' + sfx])).rows[0].id;
  const other = (await query(`INSERT INTO users(username, display_name, coins) VALUES($1,$1,10000) RETURNING id`, ['kedo_' + sfx])).rows[0].id;
  const item = (await query(`SELECT id FROM activity_items WHERE link_url LIKE '%/g/kedi/%' LIMIT 1`)).rows[0].id;
  await query(`INSERT INTO activity_access(user_id) VALUES($1) ON CONFLICT DO NOTHING`, [u]);

  // --- cüzdan
  const w = new CoinWallet();
  const tx1 = 'test:' + sfx + ':1';
  assert.deepEqual(await w.debit(u, 1000, tx1, {}), { ok: true, balance: 9000 });
  assert.deepEqual(await w.debit(u, 1000, tx1, {}), { ok: true, balance: 9000, dup: true }, 'aynı txId ikinci kez düşmemeli');
  assert.equal(await w.balance(u), 9000);
  const poor = await w.debit(u, 99999, 'test:' + sfx + ':2', {});
  assert.equal(poor.ok, false);
  assert.equal(poor.error, 'INSUFFICIENT_FUNDS');
  assert.equal((await w.credit(u, 500, 'test:' + sfx + ':3', {})).balance, 9500);
  await w.credit(u, 500, 'test:' + sfx + ':3', {});
  assert.equal(await w.balance(u), 9500, 'aynı kazanç iki kez yazılmamalı');

  // --- WebSocket
  const server = http.createServer();
  attachRealtime(server, { authenticate: async () => null, isRoomMember: async () => false });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const kedi = await startKedi();
  const open = (token) => new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/kedi?token=${encodeURIComponent(token)}`);
    const msgs = [];
    ws.on('message', (d) => msgs.push(JSON.parse(String(d))));
    ws.on('close', (code) => resolve({ ws, msgs, closed: code }));
    ws.on('open', () => setTimeout(() => resolve({ ws, msgs, closed: null }), 700));
  });
  try {
    const bad = await open('sahte');
    assert.ok(bad.closed === 4001 || bad.msgs.some((m) => m.error === 'AUTH_FAILED'), 'sahte bilet reddedilmeli');
    const noPerm = await open(issueGameToken(other, item));
    assert.ok(noPerm.msgs.some((m) => m.error === 'AUTH_FAILED'), 'izni olmayan girememeli');
    const ok = await open(issueGameToken(u, item));
    assert.equal(ok.closed, null, 'izinli oyuncu bağlanmalı');
    assert.ok(ok.msgs.length > 0, 'sunucu ilk durumu göndermeli: ' + JSON.stringify(ok.msgs).slice(0, 200));
    // bahis: Coin gerçekten düşer, ack ve bakiye tutarlı
    const hello = ok.msgs.find((m) => m.type === 'hello');
    assert.ok(hello, 'hello gelmeli');
    const before = await w.balance(u);
    const item0 = hello.config.items[0].id;
    const ack = await new Promise((resolve) => {
      ok.ws.on('message', (d) => { const m = JSON.parse(String(d)); if (m.type === 'ack' && m.reqId === 7) resolve(m); });
      ok.ws.send(JSON.stringify({ type: 'bet', reqId: 7, item: item0, amount: 200, round: hello.state.round }));
      setTimeout(() => resolve({ ok: false, error: 'TIMEOUT' }), 4000);
    });
    assert.equal(ack.ok, true, 'bahis kabul edilmeli: ' + JSON.stringify(ack).slice(0, 200));
    assert.equal(await w.balance(u), before - 200, 'bahis kadar Coin düşmeli');
    ok.ws.close();
  } finally {
    await kedi.stop();
    server.close();
    server.closeAllConnections?.();
    for (const sql of [
      `DELETE FROM wallet_transactions WHERE user_id = ANY($1)`,
      `DELETE FROM financial_audit_logs WHERE user_id = ANY($1)`,
      `DELETE FROM activity_access WHERE user_id = ANY($1)`,
      `DELETE FROM users WHERE id = ANY($1)`,
    ]) await query(sql, [[u, other]]).catch(() => {});
  }
});
