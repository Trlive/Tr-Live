import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import express from 'express';
import { AccessToken, TrackSource } from 'livekit-server-sdk';
import { publishPolicy, sourceAllowed } from '../src/modules/rooms/publish_policy.rules.js';

process.env.LIVEKIT_API_KEY = 'APItest';
process.env.LIVEKIT_API_SECRET = 'test-secret-test-secret-test-secret-1234';
process.env.LIVEKIT_URL = 'ws://127.0.0.1:1';
const { handleLivekitEvent, router } = await import('../src/modules/rooms/livekit_webhook.routes.js');

const ROOM = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const audio = { room_type: 'audio', muted_seats: [2] };
const video = { room_type: 'video', muted_seats: [2] };

test('yayın kuralı: koltuk, susturulmuş koltuk (sesli/görüntülü), odada değil', () => {
  assert.deepEqual(publishPolicy(audio, null), { canPublish: false, sources: null });
  assert.deepEqual(publishPolicy(audio, { seat_index: null }), { canPublish: false, sources: null });
  assert.deepEqual(publishPolicy(audio, { seat_index: 1 }), { canPublish: true, sources: null });
  assert.deepEqual(publishPolicy(audio, { seat_index: 2 }), { canPublish: false, sources: null }, 'sesli: susturulmuş koltuk yayın yapamaz');
  assert.deepEqual(publishPolicy(video, { seat_index: 2 }), { canPublish: true, sources: [TrackSource.CAMERA] }, 'görüntülü: yalnızca kamera');
  assert.deepEqual(publishPolicy({ room_type: 'audio' }, { seat_index: 0 }), { canPublish: true, sources: null }, 'muted_seats boş olabilir');
  const camOnly = publishPolicy(video, { seat_index: 2 });
  assert.equal(sourceAllowed(camOnly, TrackSource.CAMERA), true);
  assert.equal(sourceAllowed(camOnly, TrackSource.MICROPHONE), false);
  assert.equal(sourceAllowed({ canPublish: false, sources: null }, TrackSource.CAMERA), false);
});

function fakeDeps({ room = audio, member = { seat_index: 1 } } = {}) {
  const calls = [];
  return {
    calls,
    deps: {
      roomOf: async () => room, memberOf: async () => member,
      setPermission: async (...a) => { calls.push(['perm', ...a]); return true; },
      remove: async (...a) => { calls.push(['remove', ...a]); },
    },
  };
}
const ev = (event, extra = {}) => ({ event, room: { name: ROOM }, participant: { identity: USER }, ...extra });

test('katılım: üye olan kalır, üye olmayan ve kapanmış odadaki çıkarılır', async () => {
  let f = fakeDeps();
  assert.equal(await handleLivekitEvent(ev('participant_joined'), f.deps), 'ok');
  assert.equal(f.calls.length, 0);
  f = fakeDeps({ member: null });
  assert.equal(await handleLivekitEvent(ev('participant_joined'), f.deps), 'removed');
  assert.deepEqual(f.calls, [['remove', ROOM, USER]]);
  f = fakeDeps({ room: null });
  assert.equal(await handleLivekitEvent(ev('participant_joined'), f.deps), 'removed', 'oda kapanmış');
});

test('yayın: koltuktaki serbest; koltuksuz / susturulmuş koltuktaki ses kesilir, görüntülüde kamera serbest', async () => {
  const mic = { track: { source: TrackSource.MICROPHONE } };
  const cam = { track: { source: TrackSource.CAMERA } };
  let f = fakeDeps({ member: { seat_index: 1 } });
  assert.equal(await handleLivekitEvent(ev('track_published', mic), f.deps), 'ok');
  f = fakeDeps({ member: { seat_index: null } });
  assert.equal(await handleLivekitEvent(ev('track_published', mic), f.deps), 'revoked');
  assert.deepEqual(f.calls, [['perm', ROOM, USER, { canPublish: false, sources: null }]]);
  f = fakeDeps({ room: audio, member: { seat_index: 2 } });
  assert.equal(await handleLivekitEvent(ev('track_published', mic), f.deps), 'revoked', 'sesli susturulmuş koltuk');
  f = fakeDeps({ room: video, member: { seat_index: 2 } });
  assert.equal(await handleLivekitEvent(ev('track_published', cam), f.deps), 'ok', 'görüntülü susturulmuş koltukta kamera serbest');
  assert.equal(await handleLivekitEvent(ev('track_published', mic), f.deps), 'revoked');
  assert.deepEqual(f.calls.at(-1), ['perm', ROOM, USER, { canPublish: true, sources: [TrackSource.CAMERA] }]);
});

test('PK izleyicisi yayın açarsa çıkarılır; ilgisiz olaylar ve bozuk adlar yok sayılır', async () => {
  const f = fakeDeps();
  assert.equal(await handleLivekitEvent({ event: 'participant_joined', room: { name: ROOM }, participant: { identity: `pk-${USER}` } }, f.deps), 'ok');
  assert.equal(await handleLivekitEvent({ event: 'track_published', room: { name: ROOM }, participant: { identity: `pk-${USER}` }, track: { source: 2 } }, f.deps), 'removed');
  assert.equal(await handleLivekitEvent(ev('room_finished'), f.deps), 'ignored');
  assert.equal(await handleLivekitEvent({ event: 'participant_joined', room: { name: 'oda' }, participant: { identity: USER } }, f.deps), 'ignored');
  assert.equal(await handleLivekitEvent({ event: 'participant_joined', room: { name: ROOM }, participant: { identity: 'egress-1' } }, f.deps), 'ignored');
  assert.equal(await handleLivekitEvent(null, f.deps), 'ignored');
});

test('uç: imzalı istek kabul edilir; imzasız ya da gövdesi değiştirilmiş istek 401', async () => {
  const app = express();
  app.use('/livekit/webhook', router);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/livekit/webhook`;
  // Bilinmeyen oda/kimlik: olay doğrulanır ama veritabanına gidilmez ("ignored").
  const body = JSON.stringify({ event: 'room_started', room: { name: 'deneme' }, id: 'EV_1', createdAt: '1' });
  const sign = async (b) => {
    const at = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
    at.sha256 = crypto.createHash('sha256').update(b).digest('base64');
    return at.toJwt();
  };
  const post = (b, auth) => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/webhook+json', ...(auth ? { Authorization: auth } : {}) }, body: b });
  assert.equal((await post(body, await sign(body))).status, 200);
  assert.equal((await post(body)).status, 401, 'imzasız');
  assert.equal((await post(body.replace('deneme', 'baska'), await sign(body))).status, 401, 'gövde değişmiş');
  await new Promise((r) => server.close(r));
});
