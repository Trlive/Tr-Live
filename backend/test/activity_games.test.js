import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { extractGame, cleanPath, injectSdk } from '../src/modules/games/activity_games.service.js';

// Basit zip üretici (deflate): test için.
function zip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  const crc32 = (buf) => { let c, crc = ~0; for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; crc = (crc >>> 8) ^ c; } return ~crc >>> 0; };
  for (const [name, data] of Object.entries(files)) {
    const nameB = Buffer.from(name);
    const raw = Buffer.from(data);
    const comp = zlib.deflateRawSync(raw);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(8, 8);
    h.writeUInt32LE(crc32(raw), 14); h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(nameB.length, 26);
    parts.push(h, nameB, comp);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10);
    c.writeUInt32LE(crc32(raw), 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(nameB.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, nameB);
    offset += 30 + nameB.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

test('yol temizleme: ../, mutlak yol, gizli dosya ve macOS artıkları reddedilir', () => {
  assert.equal(cleanPath('../x'), null);
  assert.equal(cleanPath('/etc/passwd'), null);
  assert.equal(cleanPath('a/../b'), null);
  assert.equal(cleanPath('.env'), null);
  assert.equal(cleanPath('__MACOSX/a.js'), null);
  assert.equal(cleanPath('img/a.png'), 'img/a.png');
});

test('zip: tek üst klasör soyulur, izinsiz türler atlanır, index.html zorunlu', () => {
  const r = extractGame(zip({ 'oyun/index.html': '<html></html>', 'oyun/game.js': '1', 'oyun/x.php': '<?php', 'oyun/img/a.png': 'p' }));
  assert.deepEqual(r.files.map((f) => f.path).sort(), ['game.js', 'img/a.png', 'index.html']);
  assert.throws(() => extractGame(zip({ 'game.js': '1' })), /index\.html/);
  assert.throws(() => extractGame(zip({ '../evil.html': 'x' })), /Zip içinde dosya yok/);
});

test('SDK sayfaya bir kez eklenir', () => {
  const once = injectSdk('<html><head></head></html>');
  assert.match(once, /_sdk\.js/);
  assert.equal(injectSdk(once), once);
});

// F-01 (v2.131.0): İstemci çarpanıyla çalışan Coin yolu oyun sayfasından kaldırıldı. Sonucu istemci bildiriyordu.
test('SDK ve rotalarda istemci-çarpanlı Coin yolu kalmadı', async () => {
  const { SDK_JS } = await import('../src/modules/games/activity_games.service.js');

  // SDK: Coin hareketi başlatan yöntem ya da uç yok (eski çağrılar "is not a function" hatası verir).
  assert.ok(!/call\('\/settle'/.test(SDK_JS), 'SDK hâlâ /settle çağırıyor');
  assert.ok(!/call\('\/bet'/.test(SDK_JS), 'SDK hâlâ /bet çağırıyor');
  assert.ok(!/\b(bet|settle|play)\s*:/.test(SDK_JS), 'SDK hâlâ Coin yöntemi sunuyor');
  assert.match(SDK_JS, /call\('\/me'\)/, 'salt okunur /me ucu SDK’dan kalkmış');

  // Rota kaydı: playRouter'da yalnızca /me kaldı (kaynak üzerinden; Express sürümünden bağımsız).
  const src = await readFile(new URL('../src/modules/games/activities.routes.js', import.meta.url), 'utf8');
  const routes = [...src.matchAll(/playRouter\.(get|post|put|patch|delete)\('([^']+)'/g)].map((m) => `${m[1].toUpperCase()} ${m[2]}`);
  assert.deepEqual(routes, ['POST /:id/me'], `beklenmeyen oyun ucu: ${routes.join(', ')}`);
  assert.ok(!/coin_play/.test(src), 'coin_play hâlâ kullanılıyor');
});
