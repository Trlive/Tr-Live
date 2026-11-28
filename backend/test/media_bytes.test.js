import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { verifyFetched, dropDecision, readBytes, processDrops, processDeletes, isMediaKey, MediaBytesError } from '../src/modules/media/media_bytes.rules.js';

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const buf = Buffer.from('merhaba dünya');

test('depodan okunan baytlar boyut ve sha256 ile doğrulanır', () => {
  assert.equal(verifyFetched(buf, { size_bytes: buf.length, sha256: sha(buf) }), buf);
  assert.throws(() => verifyFetched(buf, { size_bytes: buf.length + 1 }), MediaBytesError); // boyut uyuşmuyor
  assert.throws(() => verifyFetched(buf, { size_bytes: buf.length, sha256: sha(Buffer.from('baska')) }), /sha256/);
  assert.equal(verifyFetched(buf, {}), buf); // kayıt yoksa doğrulanacak şey yok
});

test('veritabanı kopyası varsa depoya hiç gidilmez', async () => {
  let called = 0;
  const out = await readBytes({ data: buf, storage_key: 'media/a.png' }, { cfg: {}, get: async () => { called++; return null; } });
  assert.equal(out, buf);
  assert.equal(called, 0);
  // pg Buffer yerine Uint8Array verirse Buffer'a çevrilir.
  assert.ok(Buffer.isBuffer(await readBytes({ data: new Uint8Array(buf) }, { cfg: null, get: async () => null })));
});

test('kopyası silinmiş (boş) dosya depodan okunur ve doğrulanır', async () => {
  const row = { data: Buffer.alloc(0), storage_key: 'media/a.png', size_bytes: buf.length, sha256: sha(buf) };
  assert.deepEqual(await readBytes(row, { cfg: { x: 1 }, get: async (cfg, key) => { assert.equal(key, 'media/a.png'); return buf; } }), buf);
  // Depodaki dosya bozulmuşsa sessizce işlenmez.
  await assert.rejects(() => readBytes(row, { cfg: {}, get: async () => Buffer.from('bozuk dosya!!') }), MediaBytesError);
});

test('baytlar hiçbir yerde yoksa açık hata verir (boş bayt üzerinde işlem yapılmaz)', async () => {
  await assert.rejects(() => readBytes({ data: Buffer.alloc(0) }, { cfg: {}, get: async () => buf }), /baytları yok/);
  await assert.rejects(() => readBytes({ data: null, storage_key: 'k' }, { cfg: null, get: async () => buf }), /yapılandırılmamış/);
  await assert.rejects(() => readBytes({ data: null, storage_key: 'k' }, { cfg: {}, get: async () => null }), /depoda bulunamadı/);
});

test('silme kararı: depoda şimdi var ve boyut kayıtla aynıysa', () => {
  assert.deepEqual(dropDecision({ size_bytes: 100 }, { size: 100 }), { ok: true });
  assert.equal(dropDecision({ size_bytes: 100 }, null).ok, false); // depoda yok
  assert.equal(dropDecision({ size_bytes: 100 }, { size: 99 }).reason, 'boyut uyuşmuyor');
  assert.equal(dropDecision({ size_bytes: null }, { size: 0 }).ok, false); // kayıtlı boyut yok: doğrulanamaz
  assert.equal(dropDecision({ size_bytes: 0 }, { size: 0 }).ok, false);
});

test('silme turu yalnızca doğrulananı siler', async () => {
  const rows = [{ id: 1, size_bytes: 10 }, { id: 2, size_bytes: 10 }, { id: 3, size_bytes: 10 }, { id: 4, size_bytes: 10 }];
  const heads = { 1: { size: 10 }, 2: { size: 9 }, 3: null, 4: { size: 10 } };
  const dropped = [];
  const r = await processDrops(rows, { head: async (row) => heads[row.id], drop: async (row) => { dropped.push(row.id); return 1; } });
  assert.deepEqual(dropped, [1, 4]); // 2: boyut uyuşmuyor, 3: depoda yok
  assert.deepEqual(r, { dropped: 2, unverified: 2, candidates: 4 });
});

test('depo art arda hata verirse tur durur; başarılı HEAD sayacı sıfırlar', async () => {
  const rows = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, size_bytes: 5 }));
  let calls = 0;
  const r = await processDrops(rows, { head: async () => { calls++; throw new Error('R2 yok'); }, drop: async () => 1 });
  assert.equal(calls, 3); // 3 hatadan sonra durdu
  assert.equal(r.dropped, 0);
  // Araya giren başarı sayacı sıfırlar: hata, hata, BAŞARI, hata, hata → durmaz.
  const seq = ['err', 'err', 'ok', 'err', 'err', 'ok'];
  let i = 0;
  const r2 = await processDrops(seq.map((_, k) => ({ id: k, size_bytes: 5 })), {
    head: async () => { const s = seq[i++]; if (s === 'err') throw new Error('x'); return { size: 5 }; }, drop: async () => 1,
  });
  assert.equal(r2.dropped, 2);
  assert.equal(i, 6);
});

test('bu arada geri alınan dosya (UPDATE 0 satır) silinmiş sayılmaz', async () => {
  const r = await processDrops([{ id: 1, size_bytes: 5 }], { head: async () => ({ size: 5 }), drop: async () => 0 });
  assert.deepEqual(r, { dropped: 0, unverified: 0, candidates: 1 });
});

test('regresyon koruması: /media/:file bayt sütununu koşulsuz seçmez', () => {
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.ok(!/SELECT mime, data, storage_key/.test(app), 'taşınmış dosyada da bayt okunuyor');
  assert.match(app, /CASE WHEN storage_key IS NULL OR NOT \$2::boolean THEN data END AS data/);
});

const KEY = 'media/0b8e6a4c-1d2f-4a5b-9c3d-7e8f9a0b1c2d.png';

test('silme kuyruğu yalnızca depoya yazılan biçimdeki anahtarları kabul eder', () => {
  assert.equal(isMediaKey(KEY), true);
  assert.equal(isMediaKey('media/0b8e6a4c-1d2f-4a5b-9c3d-7e8f9a0b1c2d.mp4'), true);
  for (const bad of ['', null, undefined, 42, 'media/../etc/passwd', 'media/abc.png', '../media/0b8e6a4c-1d2f-4a5b-9c3d-7e8f9a0b1c2d.png',
    'media/0B8E6A4C-1D2F-4A5B-9C3D-7E8F9A0B1C2D.png', 'media/0b8e6a4c-1d2f-4a5b-9c3d-7e8f9a0b1c2d.png/x', 'baska/0b8e6a4c-1d2f-4a5b-9c3d-7e8f9a0b1c2d.png']) {
    assert.equal(isMediaKey(bad), false, String(bad));
  }
});

test('silme kuyruğu: başarılı silme kuyruktan çıkar; geçersiz anahtar depoya hiç gitmez', async () => {
  const log = { del: [], done: [], fail: [] };
  const r = await processDeletes([KEY, 'media/../x', 'media/1b8e6a4c-1d2f-4a5b-9c3d-7e8f9a0b1c2d.webp'], {
    del: async (k) => { log.del.push(k); },
    done: async (k) => { log.done.push(k); },
    fail: async (k, m) => { log.fail.push([k, m]); },
  });
  assert.deepEqual(log.del, [KEY, 'media/1b8e6a4c-1d2f-4a5b-9c3d-7e8f9a0b1c2d.webp']); // 'media/../x' gitmedi
  assert.deepEqual(log.done, log.del);
  assert.deepEqual(log.fail, [['media/../x', 'geçersiz anahtar biçimi']]);
  assert.deepEqual(r, { deleted: 2, failed: 1 });
});

test('silme kuyruğu: depo hatasında anahtar kuyrukta KALIR (done çağrılmaz), deneme sayısı artar, art arda 3 hatada tur durur', async () => {
  const keys = Array.from({ length: 6 }, (_, i) => `media/${String(i).repeat(8)}-1d2f-4a5b-9c3d-7e8f9a0b1c2d.png`);
  const log = { done: 0, fail: [] };
  let calls = 0;
  const r = await processDeletes(keys, {
    del: async () => { calls++; throw new Error('R2 DELETE 503'); },
    done: async () => { log.done++; },
    fail: async (k, m) => { log.fail.push(m); },
  });
  assert.equal(calls, 3);
  assert.equal(log.done, 0); // silinemeyen anahtar kuyruktan ÇIKARILMAZ
  assert.equal(log.fail.length, 3);
  assert.match(log.fail[0], /503/);
  assert.deepEqual(r, { deleted: 0, failed: 3 });
});

test('migration 118: tetikleyici silinen satırın depo anahtarını AYNI işlemde kuyruğa yazar', () => {
  const sql = fs.readFileSync(new URL('../src/migrations/118_media_delete_queue.sql', import.meta.url), 'utf8');
  assert.match(sql, /AFTER DELETE ON media_files/);
  assert.match(sql, /FOR EACH ROW/);
  assert.match(sql, /IF OLD\.storage_key IS NOT NULL/);
  assert.match(sql, /ON CONFLICT DO NOTHING/);
  assert.match(sql, /storage_key TEXT PRIMARY KEY/);
});
