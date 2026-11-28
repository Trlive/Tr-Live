import test from 'node:test';
import assert from 'node:assert/strict';
import { attachRealtime, hub } from '../src/infrastructure/websocket/realtime.js';

// Gerçek hub kodu, sahte soketlerle: ağ yok, yalnızca oda olayı numaralandırma davranışı sınanır.
const tick = () => new Promise((r) => setImmediate(r));
function fakeSocket() {
  const handlers = {};
  return {
    readyState: 1, bufferedAmount: 0, sent: [], handlers,
    on(evt, fn) { handlers[evt] = fn; }, send(t) { this.sent.push(JSON.parse(t)); },
    close() { this.readyState = 3; }, ping() {}, terminate() {},
    of(type) { return this.sent.filter((m) => m.type === type); },
  };
}
const members = new Map([['u1', new Set(['R1'])], ['u2', new Set(['R1'])], ['u3', new Set(['R1'])], ['u4', new Set(['R2'])]]);
const wss = attachRealtime({ on() {} }, {
  authenticate: async (token) => ({ id: token, session_id: null }),
  isRoomMember: async (userId, roomId) => members.get(userId)?.has(roomId) === true,
  isPresenceVisible: async () => false,
});

async function join(userId, roomId) {
  const ws = fakeSocket();
  wss.clients.add(ws);
  wss.emit('connection', ws, { url: `/ws?roomId=${roomId}`, headers: { authorization: `Bearer ${userId}` } });
  for (let i = 0; i < 6; i += 1) await tick();
  return ws;
}

test('abonelik onayı o anki taban numarayı taşır; iki üye aynı numaraları alır', async () => {
  const a = await join('u1', 'R1');
  const b = await join('u2', 'R1');
  assert.deepEqual(a.of('room_subscribed').map((m) => m.seq), [0]);
  assert.deepEqual(b.of('room_subscribed').map((m) => m.seq), [0]);
  hub.broadcastRoom('R1', { type: 'room_seat_changed', userId: 'x', seatIndex: 1 });
  hub.broadcastRoom('R1', { type: 'room_role_changed', userId: 'x', role: 'admin' });
  assert.deepEqual(a.of('room_seat_changed').map((m) => m.seq), [1]);
  assert.deepEqual(a.of('room_role_changed').map((m) => m.seq), [2]);
  assert.deepEqual(b.sent.filter((m) => m.seq).map((m) => m.seq), [1, 2]);
});

test('görsel olay damgasız gider ve numara tüketmez', async () => {
  const a = await join('u1', 'R1');
  const base = a.of('room_subscribed')[0].seq;
  hub.broadcastRoom('R1', { type: 'room_gift', giftId: 'g' });
  hub.broadcastRoom('R1', { type: 'room_seat_changed', userId: 'x', seatIndex: 2 });
  assert.equal(a.of('room_gift')[0].seq, undefined);
  assert.equal(a.of('room_seat_changed')[0].seq, base + 1); // görsel olay araya numara sokmadı
});

test('sonradan abone olan, mevcut numarayı taban alır (sahte boşluk görmez)', async () => {
  const before = await join('u2', 'R1');
  hub.broadcastRoom('R1', { type: 'room_member_joined', userId: 'y' });
  const late = await join('u3', 'R1');
  const baseline = late.of('room_subscribed')[0].seq;
  hub.broadcastRoom('R1', { type: 'room_member_left', userId: 'y' });
  assert.equal(late.of('room_member_left')[0].seq, baseline + 1); // tabandan hemen sonraki numara
  assert.ok(before.of('room_member_left')[0].seq >= baseline + 1);
});

test('odalar bağımsız numaralanır', async () => {
  const d = await join('u4', 'R2');
  assert.deepEqual(d.of('room_subscribed').map((m) => m.seq), [0]);
  hub.broadcastRoom('R2', { type: 'room_seat_changed', userId: 'z', seatIndex: 0 });
  assert.equal(d.of('room_seat_changed')[0].seq, 1);
});

test('üye olmayan abone edilmez ve numara almaz', async () => {
  const ws = fakeSocket();
  wss.clients.add(ws);
  wss.emit('connection', ws, { url: '/ws?roomId=R1', headers: { authorization: 'Bearer yabanci' } });
  for (let i = 0; i < 6; i += 1) await tick();
  assert.equal(ws.of('room_subscribed').length, 0);
  assert.equal(ws.of('error')[0].code, 'not_member');
  hub.broadcastRoom('R1', { type: 'room_seat_changed', userId: 'q', seatIndex: 3 });
  assert.equal(ws.of('room_seat_changed').length, 0);
});

test('oda kapanınca (clearRoom) sayaç sıfırlanır: yeni abone taban 0 görür', async () => {
  hub.broadcastRoom('R2', { type: 'room_seat_changed', userId: 'z', seatIndex: 1 });
  hub.clearRoom('R2');
  const again = await join('u4', 'R2');
  assert.deepEqual(again.of('room_subscribed').map((m) => m.seq), [0]);
});

// ---- v2.154.1 eklemeleri ----
const send = async (ws, msg) => { await ws.handlers.message(Buffer.from(JSON.stringify(msg))); for (let i = 0; i < 6; i += 1) await tick(); };

test('son abone çıkınca sayaç silinir (yayın olmasa da bellek şişmez); hub.roomSeq REST için o anki numarayı verir', async () => {
  members.set('u5', new Set(['R3']));
  const a = await join('u5', 'R3');
  hub.broadcastRoom('R3', { type: 'room_seat_changed', userId: 'k', seatIndex: 0 });
  hub.broadcastRoom('R3', { type: 'room_seat_changed', userId: 'k', seatIndex: 1 });
  assert.equal(hub.roomSeq('R3'), 2);
  await send(a, { type: 'room_unsubscribe' });
  assert.equal(hub.roomSeq('R3'), 0, 'odada kimse kalmadı: sayaç silindi');
  hub.broadcastRoom('R3', { type: 'room_seat_changed', userId: 'k', seatIndex: 2 });
  assert.equal(hub.roomSeq('R3'), 0, 'abonesiz odaya yayın numara tüketmez');
});

test('kalp atışı aboneliği yinelediğinde onay aynı numarayı taşır (istemci yanlış boşluk görmez)', async () => {
  members.set('u6', new Set(['R4']));
  const a = await join('u6', 'R4');
  hub.broadcastRoom('R4', { type: 'room_role_changed', userId: 'k', role: 'admin' });
  await send(a, { type: 'room_subscribe', roomId: 'R4' });
  const subs = a.of('room_subscribed').map((m) => m.seq);
  assert.deepEqual(subs, [0, 1], 'yineleme onayı son görülen numarayla aynı');
  assert.equal(a.of('room_role_changed')[0].seq, 1);
});
