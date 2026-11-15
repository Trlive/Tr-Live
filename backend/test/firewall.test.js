import test from 'node:test';
import assert from 'node:assert/strict';

// Yapılandırma modül yüklenmeden önce ayarlanmalı.
process.env.FIREWALL_IP_PER_MINUTE = '6';
process.env.FIREWALL_MEDIA_PER_MINUTE = '4';
process.env.FIREWALL_BAN_THRESHOLD = '20';
process.env.FIREWALL_ALLOW_IPS = '8.8.8.8';
delete process.env.DATABASE_URL;
const fw = await import('../src/firewall.js');

const makeReq = (ip, url = '/api/rooms', extra = {}) => ({ ip, originalUrl: url, headers: { 'user-agent': 'Dart/3.8' }, socket: { remoteAddress: ip }, ...extra });
function run(mw, req) {
  return new Promise((resolve) => {
    const res = {
      code: 200, headers: {},
      set(k, v) { this.headers[k] = v; return this; },
      status(c) { this.code = c; return this; },
      json(b) { resolve({ status: this.code, body: b, headers: this.headers }); return this; },
    };
    mw(req, res, (err) => resolve({ status: err ? (err.status ?? 500) : 'next', err }));
  });
}

test('normal istek geçer, IP başına sınır aşılınca 429 + Retry-After', async () => {
  const mw = fw.firewall();
  for (let i = 0; i < 6; i++) assert.equal((await run(mw, makeReq('9.9.9.1'))).status, 'next');
  const r = await run(mw, makeReq('9.9.9.1'));
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers['Retry-After']) >= 1);
  assert.equal((await run(mw, makeReq('9.9.9.2'))).status, 'next', 'başka IP etkilenmez');
});

test('WAF saldırıyı reddeder; tekrarlayan saldırgan otomatik yasaklanır; sonra masum istek de reddedilir', async () => {
  const mw = fw.firewall();
  const ip = '9.9.9.3';
  const attack = '/api/users/search?q=1 UNION SELECT password FROM users';
  for (let i = 0; i < 4; i++) assert.equal((await run(mw, makeReq(ip, attack))).status, 403);
  assert.equal(fw.isBanned(ip), true, '4 x 5 puan = eşik (20) → yasak');
  const after = await run(mw, makeReq(ip, '/api/rooms'));
  assert.equal(after.status, 403);
  assert.match(after.body.message, /engellendi/);
  await fw.unbanIp(ip).catch(() => {}); // bellekten kalkar; veritabanı yoksa hata yukarı taşınır (beklenen)
  assert.equal(fw.isBanned(ip), false);
});

test('izin listesindeki IP asla yasaklanmaz', async () => {
  const mw = fw.firewall();
  for (let i = 0; i < 10; i++) await run(mw, makeReq('8.8.8.8', '/api/x?q=../../etc/passwd'));
  assert.equal(fw.isBanned('8.8.8.8'), false);
  assert.equal(fw.banIp('8.8.8.8', 1000, 'deneme'), false);
  assert.equal((await run(mw, makeReq('8.8.8.8'))).status, 'next');
});

test('yönetici elle yasaklayabilir ve kaldırabilir', async () => {
  const mw = fw.firewall();
  assert.equal(fw.banIp('9.9.9.4', 60000, 'elle'), true);
  assert.equal((await run(mw, makeReq('9.9.9.4'))).status, 403);
  assert.ok(fw.listBans().some((b) => b.ip === '9.9.9.4'));
  await fw.unbanIp("9.9.9.4").catch(() => {});
  assert.equal((await run(mw, makeReq('9.9.9.4'))).status, 'next');
});

test('giriş kilidi: 5 hatalı denemeden sonra 429', async () => {
  const g = fw.loginGuard('9.9.9.5', 'ali');
  for (let i = 0; i < 5; i++) { g.check(); g.failed(); }
  assert.throws(() => g.check(), (e) => e.status === 429);
  // başka kullanıcı adı / başka IP etkilenmez
  assert.doesNotThrow(() => fw.loginGuard('9.9.9.5', 'veli').check());
  assert.doesNotThrow(() => fw.loginGuard('9.9.9.6', 'ali').check());
  // başarılı giriş sayacı sıfırlar
  const g2 = fw.loginGuard('9.9.9.7', 'ayse');
  for (let i = 0; i < 4; i++) g2.failed();
  g2.succeeded();
  for (let i = 0; i < 4; i++) g2.failed();
  assert.doesNotThrow(() => g2.check());
});

test('kullanıcı başına sınır: aşınca hata (429) döner', async () => {
  const mw = fw.userLimit('deneme', 3, 60000);
  const req = makeReq('9.9.9.8', '/api/x', { user: { id: 'u-1' } });
  for (let i = 0; i < 3; i++) assert.equal((await run(mw, req)).status, 'next');
  assert.equal((await run(mw, req)).status, 429);
  assert.equal((await run(mw, makeReq('9.9.9.8', '/api/x', { user: { id: 'u-2' } }))).status, 'next', 'başka kullanıcı etkilenmez');
});

test('gövde koruması: prototype pollution reddedilir', async () => {
  const mw = fw.bodyGuard();
  assert.equal((await run(mw, makeReq('9.9.9.9', '/api/x', { body: { a: 1 } }))).status, 'next');
  const evil = JSON.parse('{"__proto__":{"isAdmin":true}}');
  assert.equal((await run(mw, makeReq('9.9.9.10', '/api/x', { body: evil }))).status, 400);
});

test('oda şifresi deneme sınırı (hitLimit)', () => {
  for (let i = 0; i < 5; i++) assert.equal(fw.hitLimit('roompw:r1:u1', 5, 60000).allowed, true);
  assert.equal(fw.hitLimit('roompw:r1:u1', 5, 60000).allowed, false);
});

test('görsel dosyaları API bütçesinden ayrı sayılır', async () => {
  const mw = fw.firewall();
  const ip = '9.9.9.20';
  for (let i = 0; i < 6; i++) assert.equal((await run(mw, makeReq(ip))).status, 'next');
  assert.equal((await run(mw, makeReq(ip))).status, 429, 'API bütçesi doldu');
  // API bütçesi doluyken görseller yüklenmeye devam eder (kendi bütçesi: 4).
  for (const url of ['/uploads/a.png', '/media/3f0c0b1e-0000-4000-8000-000000000000.png', '/api/emoji/noto/1f600', '/uploads/b.png']) {
    assert.equal((await run(mw, makeReq(ip, url))).status, 'next', url);
  }
  assert.equal((await run(mw, makeReq(ip, '/uploads/c.png'))).status, 429, 'görsel bütçesi de sınırlıdır');
  // Tersi: görsel seli API isteklerini engellemez.
  const ip2 = '9.9.9.21';
  for (let i = 0; i < 10; i++) await run(mw, makeReq(ip2, '/uploads/x.png'));
  assert.equal((await run(mw, makeReq(ip2))).status, 'next');
  assert.equal(fw.isMediaPath('/api/rooms'), false);
  assert.equal(fw.isMediaPath(undefined), false);
});

test('hız sınırı aşımı tek başına IP yasağına dönüşmez (ortak IP / hızlı dokunan kullanıcı)', async () => {
  const mw = fw.firewall();
  const ip = '9.9.9.22';
  // Eşik 20 puan: eskiden sınırı aşan her istek 1 puandı, 20 fazladan istek IP'deki herkesi yasaklıyordu.
  for (let i = 0; i < 200; i++) await run(mw, makeReq(ip));
  assert.equal(fw.isBanned(ip), false, 'IP sınırı aşımı dakikada en fazla bir puan');
  const lim = fw.userLimit('deneme_combo', 3, 60000);
  const req = makeReq('9.9.9.23', '/api/x', { user: { id: 'u-9' } });
  let limited = 0;
  for (let i = 0; i < 200; i++) if ((await run(lim, req)).status === 429) limited += 1;
  assert.equal(limited, 197, 'sınır yine uygulanır (429)');
  assert.equal(fw.isBanned('9.9.9.23'), false, 'kullanıcı sınırı aşımı yasağa dönüşmez');
  // Aynı IP'de farklı sınırlar aynı anda aşılsa da puanlar toplanıp yasağa gitmez (ortak kova).
  const ip3 = '9.9.9.25';
  for (const name of ['a', 'b', 'c', 'd', 'e']) {
    const m = fw.userLimit(`deneme_${name}`, 1, 60000);
    for (let i = 0; i < 50; i++) await run(m, makeReq(ip3, '/api/x', { user: { id: `u-${name}` } }));
  }
  for (let i = 0; i < 200; i++) await run(mw, makeReq(ip3));
  assert.equal(fw.isBanned(ip3), false);
  assert.equal((await run(mw, makeReq(ip3, '/uploads/a.png'))).status, 'next', 'yasak yok: görseller de açılır');
});

test('"çok istek" ihlalleri ortak kovadan dakikada bir puan alır; saldırı imzaları her seferinde puanlanır', () => {
  const ip = '9.9.9.24';
  for (let i = 0; i < 100; i++) fw.noteViolation(ip, 'ws_ip_flood', { volume: true });
  for (let i = 0; i < 100; i++) fw.noteViolation(ip, 'rate_limit', { volume: true });
  assert.equal(fw.isBanned(ip), false);
  // Kısılmayan ihlaller (WAF imzası, şifre denemesi) eşiği (20) doldurur: 1 + 7 x 3 = 22.
  for (let i = 0; i < 6; i++) fw.noteViolation(ip, 'deneme_saldiri', { weight: 3 });
  assert.equal(fw.isBanned(ip), false, '1 + 18 = 19 < 20');
  fw.noteViolation(ip, 'deneme_saldiri', { weight: 3 });
  assert.equal(fw.isBanned(ip), true);
});
