import test from 'node:test';
import assert from 'node:assert/strict';
import { retry } from '../src/infrastructure/livekit/retry.js';

const noSleep = () => Promise.resolve();

test('ilk denemede başarılıysa tek çağrı yapılır', async () => {
  let n = 0;
  const r = await retry(async () => { n++; return 'tamam'; }, { sleep: noSleep });
  assert.deepEqual(r, { ok: true, value: 'tamam', attempts: 1 });
  assert.equal(n, 1);
});

test('geçici hatada yeniden dener ve sonunda başarılı olur', async () => {
  let n = 0;
  const waits = [];
  const r = await retry(async () => { if (++n < 3) throw new Error('geçici'); return 7; }, { baseMs: 100, sleep: async (ms) => { waits.push(ms); } });
  assert.equal(r.ok, true);
  assert.equal(r.attempts, 3);
  assert.deepEqual(waits, [100, 200]); // üstel bekleme
});

test('hep başarısızsa fırlatmaz; ok:false ve son hatayı döner', async () => {
  let n = 0;
  const r = await retry(async () => { n++; throw new Error(`hata ${n}`); }, { attempts: 3, sleep: noSleep });
  assert.equal(r.ok, false);
  assert.equal(r.attempts, 3);
  assert.equal(r.error.message, 'hata 3');
});

test('shouldRetry false derse hemen bırakır (ör. katılımcı yok: 404)', async () => {
  let n = 0;
  const r = await retry(async () => { n++; throw Object.assign(new Error('yok'), { status: 404 }); },
    { shouldRetry: (e) => e.status !== 404, sleep: noSleep });
  assert.equal(r.ok, false);
  assert.equal(n, 1);
  assert.equal(r.attempts, 1);
});
