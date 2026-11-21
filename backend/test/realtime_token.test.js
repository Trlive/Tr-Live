import test from 'node:test';
import assert from 'node:assert/strict';
import { hub, socketToken } from '../src/infrastructure/websocket/realtime.js';

const url = (q) => new URL(`/ws${q}`, 'http://localhost');

test('canlı bağlantı token\'ı: başlık önce gelir, eski sürümler için adres satırı kabul edilir', () => {
  // Yeni uygulama: Authorization başlığı (token adres satırında / erişim kayıtlarında görünmez).
  assert.equal(socketToken({ headers: { authorization: 'Bearer abc.def.ghi' } }, url('')), 'abc.def.ghi');
  // İkisi de varsa başlık kazanır.
  assert.equal(socketToken({ headers: { authorization: 'Bearer yeni' } }, url('?token=eski')), 'yeni');
  // Eski uygulama: ?token=
  assert.equal(socketToken({ headers: {} }, url('?token=eski')), 'eski');
  // Boş / bozuk başlık yok sayılır.
  assert.equal(socketToken({ headers: { authorization: 'Bearer ' } }, url('?token=eski')), 'eski');
  assert.equal(socketToken({ headers: { authorization: 'Basic xyz' } }, url('')), null);
  assert.equal(socketToken({}, url('')), null);
  assert.equal(socketToken(undefined, undefined), null);
});

test('kapanış: bağlantı sunucusu kurulmadan çağrılırsa sessizce 0 döner', () => {
  assert.equal(hub.closeAll(), 0);
});
