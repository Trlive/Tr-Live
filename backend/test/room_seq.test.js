import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoomSeq, stampRoomEvent } from '../src/infrastructure/websocket/room_seq.js';

const DECOR = new Set(['room_gift', 'room_scoreboard']);

test('sayaç 1\'den başlar, odalar bağımsızdır, drop sıfırlar', () => {
  const s = createRoomSeq();
  assert.equal(s.current('a'), 0);
  assert.equal(s.next('a'), 1);
  assert.equal(s.next('a'), 2);
  assert.equal(s.next('b'), 1);
  assert.equal(s.current('a'), 2);
  s.drop('a');
  assert.equal(s.current('a'), 0);
  assert.equal(s.current('b'), 1);
  assert.equal(s.size(), 1);
});

test('durum olayına seq damgalanır, görsel olay damgasız ve numara tüketmez', () => {
  const s = createRoomSeq();
  assert.deepEqual(stampRoomEvent({ type: 'room_seat_changed', userId: 'u' }, 'r', s, DECOR), { type: 'room_seat_changed', userId: 'u', seq: 1 });
  assert.deepEqual(stampRoomEvent({ type: 'room_gift' }, 'r', s, DECOR), { type: 'room_gift' });
  assert.equal(stampRoomEvent({ type: 'room_message' }, 'r', s, DECOR).seq, 2); // görsel olay 2'yi tüketmedi
  assert.equal(s.current('r'), 2);
});

test('damgalama özgün nesneyi değiştirmez (aynı nesne birden çok odaya gönderilebilir)', () => {
  const s = createRoomSeq();
  const p = { type: 'room_closed' };
  const a = stampRoomEvent(p, 'r1', s, DECOR);
  const b = stampRoomEvent(p, 'r2', s, DECOR);
  assert.equal(p.seq, undefined);
  assert.equal(a.seq, 1);
  assert.equal(b.seq, 1); // her odanın kendi sayacı
});
