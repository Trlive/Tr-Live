// Gerçek HTTP sunucusu + gerçek WebSocket istemcileriyle: hub'ın dizinleri (oda, kullanıcı, izleyici, IP) doğru mesajı
// doğru sokete götürüyor ve soket kapanınca hiçbir dizinde kalmıyor mu?
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket } from 'ws';
import { attachRealtime, hub } from '../src/infrastructure/websocket/realtime.js';

const server = http.createServer();
attachRealtime(server, {
  authenticate: async (token) => { if (!token) throw new Error('auth'); return { id: token, session_id: `s-${token}` }; },
  isRoomMember: async (userId, roomId) => roomId !== 'yasak',
  presenceSnapshot: async (viewer, ids) => ids.map((userId) => ({ userId, online: true })),
  isPresenceVisible: async () => true,
  maxSocketsPerIp: 3,
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `ws://127.0.0.1:${server.address().port}/ws`;
const U = (n) => `00000000-0000-4000-8000-00000000000${n}`;

/** Bağlanır; gelen mesajları biriktirir. wait(type) o türden mesajı bekler. */
async function connect(user) {
  const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${user}` } });
  const inbox = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(String(raw));
    inbox.push(m);
    for (const w of [...waiters]) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m); }
  });
  const wait = (type, pred = () => true, ms = 2000) => {
    const hit = inbox.find((m) => m.type === type && pred(m));
    if (hit) { inbox.splice(inbox.indexOf(hit), 1); return Promise.resolve(hit); }
    return new Promise((resolve, reject) => {
      const w = { pred: (m) => m.type === type && pred(m), resolve: (m) => { clearTimeout(t); inbox.splice(inbox.indexOf(m), 1); resolve(m); } };
      const t = setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); reject(new Error(`${type} gelmedi`)); }, ms);
      waiters.push(w);
    });
  };
  await wait('connected');
  return { ws, inbox, wait, send: (o) => ws.send(JSON.stringify(o)), close: () => new Promise((r) => { ws.once('close', r); ws.close(); }) };
}
const settle = () => new Promise((r) => setTimeout(r, 50));

test('oda yayını yalnızca o odadakilere gider; oda değişince eski odanın yayını gelmez', async () => {
  const a = await connect(U(1)); const b = await connect(U(2)); const c = await connect(U(3));
  a.send({ type: 'room_subscribe', roomId: 'r1' }); await a.wait('room_subscribed');
  b.send({ type: 'room_subscribe', roomId: 'r1' }); await b.wait('room_subscribed');
  c.send({ type: 'room_subscribe', roomId: 'r2' }); await c.wait('room_subscribed');
  hub.broadcastRoom('r1', { type: 'room_gift', n: 1 });
  await a.wait('room_gift'); await b.wait('room_gift');
  await settle();
  assert.equal(c.inbox.filter((m) => m.type === 'room_gift').length, 0, 'başka odaya sızmaz');
  // b odayı değiştirir: r1 yayını artık ona gitmez.
  b.send({ type: 'room_subscribe', roomId: 'r2' }); await b.wait('room_subscribed');
  hub.broadcastRoom('r1', { type: 'room_gift', n: 2 });
  await a.wait('room_gift', (m) => m.n === 2);
  await settle();
  assert.equal(b.inbox.filter((m) => m.type === 'room_gift').length, 0);
  assert.equal(hub.isUserInRoom(U(2), 'r2'), true);
  assert.equal(hub.isUserInRoom(U(2), 'r1'), false);
  // Üye olmayan odaya abonelik reddedilir ve dizine girmez.
  c.send({ type: 'room_subscribe', roomId: 'yasak' }); await c.wait('error', (m) => m.code === 'not_member');
  assert.equal(hub.isUserInRoom(U(3), 'r2'), true, 'reddedilen abonelik eski odayı bozmaz');
  await Promise.all([a.close(), b.close(), c.close()]);
});

test('kişiye mesaj, odadan ayırma, oda kapatma ve aynı kişinin iki cihazı', async () => {
  const a1 = await connect(U(4)); const a2 = await connect(U(4)); const b = await connect(U(5));
  hub.sendToUser(U(4), { type: 'dm', text: 'selam' });
  await a1.wait('dm'); await a2.wait('dm');
  await settle();
  assert.equal(b.inbox.filter((m) => m.type === 'dm').length, 0);
  a1.send({ type: 'room_subscribe', roomId: 'r3' }); await a1.wait('room_subscribed');
  b.send({ type: 'room_subscribe', roomId: 'r3' }); await b.wait('room_subscribed');
  hub.detachUserFromRoom(U(4), 'r3', { type: 'room_kicked', roomId: 'r3' });
  await a1.wait('room_kicked');
  assert.equal(hub.isUserInRoom(U(4), 'r3'), false);
  hub.broadcastRoom('r3', { type: 'room_message', n: 1 });
  await b.wait('room_message');
  await settle();
  assert.equal(a1.inbox.filter((m) => m.type === 'room_message').length, 0, 'atılan kişi oda mesajı almaz');
  hub.clearRoom('r3');
  assert.equal(hub.isUserInRoom(U(5), 'r3'), false, 'oda kapanınca kimse kalmaz');
  await Promise.all([a1.close(), a2.close(), b.close()]);
});

test('çevrimiçi durum izleme: yalnızca izleyene gider; engelleme sonrası unwatchPair kesilir', async () => {
  const viewer = await connect(U(6));
  viewer.send({ type: 'presence_watch', userIds: [U(7)] });
  await viewer.wait('presence_state');
  const other = await connect(U(8));
  const target = await connect(U(7));
  await viewer.wait('presence', (m) => m.userId === U(7) && m.online === true);
  await settle();
  assert.equal(other.inbox.filter((m) => m.type === 'presence').length, 0, 'izlemeyen bildirim almaz');
  hub.unwatchPair(U(6), U(7));
  hub.setPresenceVisible(U(7), false);
  await settle();
  assert.equal(viewer.inbox.filter((m) => m.type === 'presence').length, 0, 'engelleme sonrası durum gitmez');
  await Promise.all([viewer.close(), other.close(), target.close()]);
});

test('IP başına sınır sayacı kapanan soketleri düşer (yeniden bağlanan kalıcı olarak dışarıda kalmaz)', async () => {
  const s = [];
  for (let i = 0; i < 3; i += 1) s.push(await connect(U(9)));
  // 4. bağlantı sınırı aşar ve kapatılır.
  const extra = new WebSocket(url, { headers: { Authorization: `Bearer ${U(9)}` } });
  const code = await new Promise((r) => extra.on('close', (c) => r(c)));
  assert.equal(code, 1013);
  // Biri kapanınca yer açılır.
  await s.pop().close();
  await settle();
  const again = await connect(U(9));
  s.push(again);
  await Promise.all(s.map((x) => x.close()));
});

test('kapanan soket hiçbir dizinde kalmaz', async () => {
  await settle();
  const st = hub.stats();
  assert.equal(st.sockets, 0);
  assert.equal(hub.isUserInRoom(U(1), 'r1'), false);
  hub.broadcastRoom('r1', { type: 'x' }); // kapanmış sokete yazmaya çalışmamalı (hata yok)
  hub.sendToUser(U(4), { type: 'x' });
});

test.after(() => new Promise((r) => { hub.closeAll(1001, 'bitti', 10); server.close(r); }));
