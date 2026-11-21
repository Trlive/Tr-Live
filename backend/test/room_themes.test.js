import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { imageInfo, acceptableAsIs } from '../src/modules/media/theme_image_info.service.js';

const dir = new URL('../src/samples/themes/', import.meta.url);

test('hazır tema görselleri 1080x1920 ve küçük resimleri 360x640', () => {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.webp'));
  const keys = files.filter((f) => !f.endsWith('_t.webp')).map((f) => f.slice(0, -5));
  assert.ok(keys.length >= 30);
  for (const k of keys) {
    const full = imageInfo(fs.readFileSync(new URL(`${k}.webp`, dir)));
    const thumb = imageInfo(fs.readFileSync(new URL(`${k}_t.webp`, dir)));
    assert.deepEqual([full.w, full.h, full.animated], [1080, 1920, false], k);
    assert.deepEqual([thumb.w, thumb.h], [360, 640], k);
    assert.ok(acceptableAsIs(full));
  }
});

test('migration kataloğundaki her temanın görseli var', () => {
  const sql = fs.readFileSync(new URL('../src/migrations/061_room_themes.sql', import.meta.url), 'utf8')
    + fs.readFileSync(new URL('../src/migrations/063_room_themes_v2.sql', import.meta.url), 'utf8');
  const keys = [...sql.matchAll(/^\s*\('([a-z_]+)',/gm)].map((m) => m[1]);
  for (const k of new Set(keys)) assert.ok(fs.existsSync(new URL(`${k}.webp`, dir)), `${k} görseli yok`);
});

test('png / jpeg boyutu okunur; yatay görsel olduğu gibi kabul edilmez', () => {
  const png = Buffer.alloc(33); png.writeUInt32BE(0x89504e47, 0); png.writeUInt32BE(1920, 16); png.writeUInt32BE(1080, 20);
  assert.deepEqual([imageInfo(png).w, imageInfo(png).h], [1920, 1080]);
  assert.equal(acceptableAsIs(imageInfo(png)), false);
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8, 0x07, 0x80, 0x04, 0x38, 3, ...Array(20).fill(0)]);
  assert.deepEqual([imageInfo(jpg).w, imageInfo(jpg).h], [1080, 1920]);
  assert.equal(imageInfo(Buffer.from('merhaba dunya bu bir gorsel degil!!')), null);
});
