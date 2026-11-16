// Uçtan uca testler: GERÇEK PostgreSQL + GERÇEK sunucu süreci.
// Çalıştırma:  TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/trlive_test npm run test:e2e
// Veritabanı boş/atılabilir olmalıdır. Testler sırayla çalışır ve birbirinin durumunu kullanır.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const run = promisify(execFile);
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB = process.env.TEST_DATABASE_URL;
const PORT = Number(process.env.E2E_PORT || 3199);
const BASE = `http://127.0.0.1:${PORT}`;
const skip = !DB ? 'TEST_DATABASE_URL tanımlı değil' : false;

const tag = Date.now().toString(36);
const env = {
  ...process.env, NODE_ENV: 'test', PORT: String(PORT), DATABASE_URL: DB, DATABASE_SSL: 'false',
  JWT_SECRET: 'e2e-secret-e2e-secret-e2e-secret-1234567890', FIREWALL_ENABLED: 'false', GLOBAL_GIFT_MIN_COINS: '100',
  ADMIN_USERNAMES: `e2e_${tag}_boss`,
  UPLOAD_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'trlive-up-')),
};

let server; let pool;
const sql = (q, p = []) => pool.query(q, p);
const giveWip = (u, level) => sql(
  `INSERT INTO user_wip(user_id, level, starts_at, expires_at, is_active) VALUES($1,$2,NOW(),NOW()+INTERVAL '1 day',TRUE)
   ON CONFLICT (user_id) DO UPDATE SET level=$2, expires_at=NOW()+INTERVAL '1 day', is_active=TRUE`, [u.id, level]);
const dropWip = (u) => sql(`DELETE FROM user_wip WHERE user_id = $1`, [u.id]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, p, { body, token, headers = {}, raw } = {}) {
  const res = await fetch(BASE + p, {
    method,
    headers: { ...(raw ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  let json = null;
  try { json = await res.json(); } catch { /* gövde yok */ }
  return { status: res.status, body: json };
}
const ok = (r, msg = '') => assert.ok(r.status >= 200 && r.status < 300, `${msg} → HTTP ${r.status} ${JSON.stringify(r.body)}`);
const status = (r, code, msg = '') => assert.equal(r.status, code, `${msg} → HTTP ${r.status} ${JSON.stringify(r.body)}`);

async function register(name) {
  const r = await api('POST', '/api/auth/register', { body: { username: `e2e_${tag}_${name}`, password: 'sifre123', displayName: `Kişi ${name}` } });
  ok(r, `kayıt ${name}`);
  return { id: r.body.user.id, token: r.body.token, username: `e2e_${tag}_${name}` };
}
const coins = async (u) => BigInt((await sql('SELECT coins FROM users WHERE id=$1', [u.id])).rows[0].coins);
const diamonds = async (u) => BigInt((await sql('SELECT diamonds FROM users WHERE id=$1', [u.id])).rows[0].diamonds);

const U = {}; let roomId; let rose; let heart;

before(async () => {
  if (skip) return;
  pool = new pg.Pool({ connectionString: DB });
  await run(process.execPath, ['src/migration_runner.js'], { cwd: dir, env });
  server = spawn(process.execPath, ['src/server.js'], { cwd: dir, env, stdio: ['ignore', 'inherit', 'inherit'] });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/health`)).ok) return; } catch { /* henüz kalkmadı */ }
    await sleep(500);
  }
  throw new Error('Sunucu 30 sn içinde açılmadı');
});

after(async () => {
  if (server) { server.kill('SIGTERM'); await sleep(300); }
  if (pool) await pool.end();
});

test('sağlık ve kayıt/giriş', { skip, timeout: 60000 }, async () => {
  const h = await api('GET', '/health');
  ok(h);
  for (const n of ['a', 'b', 'c', 'd', 'f', 'g', 'h', 'e', 'x']) U[n] = await register(n);
  const dup = await api('POST', '/api/auth/register', { body: { username: U.a.username.toUpperCase(), password: 'sifre123' } });
  status(dup, 409, 'büyük/küçük harf duyarsız tekrar');
  status(await api('POST', '/api/auth/register', { body: { username: 'x', password: 'sifre123' } }), 400, 'kısa kullanıcı adı');
  status(await api('POST', '/api/auth/register', { body: { username: `okay_${tag}`, password: '123' } }), 400, 'kısa şifre');
  const login = await api('POST', '/api/auth/login', { body: { username: U.a.username, password: 'sifre123' } });
  ok(login, 'giriş');
  status(await api('POST', '/api/auth/login', { body: { username: U.a.username, password: 'yanlis' } }), 401, 'yanlış şifre');
  const me = await api('GET', '/api/me', { token: U.a.token });
  ok(me);
  assert.equal(me.body.user.id, U.a.id);
  status(await api('GET', '/api/me'), 401, 'token yok');
  status(await api('GET', '/api/rooms/abc/members', { token: U.a.token }), 400, 'geçersiz UUID 500 değil 400 olmalı');
  await sql(`UPDATE users SET coins = 100000 WHERE id = ANY($1::uuid[])`, [Object.values(U).map((u) => u.id)]);
  await sql(`UPDATE users SET system_role = 'admin' WHERE id = $1`, [U.d.id]);
  const gifts = await api('GET', '/api/gifts', { token: U.a.token });
  ok(gifts);
  rose = gifts.body.gifts.find((g) => g.name === 'Rose');
  heart = gifts.body.gifts.find((g) => g.name === 'Heart');
  assert.ok(rose && heart, 'tohum hediyeleri (Rose, Heart) bulunmalı');
});

test('giriş kilidi: 5 hatalı denemeden sonra doğru şifre bile 429', { skip, timeout: 60000 }, async () => {
  for (let i = 0; i < 5; i++) status(await api('POST', '/api/auth/login', { body: { username: U.x.username, password: 'yanlis' } }), 401);
  status(await api('POST', '/api/auth/login', { body: { username: U.x.username, password: 'sifre123' } }), 429, 'kilitli');
});

test('profil: düzenleme, arama, takip, gizli mod, avatar yükleme, engelleme etkisi', { skip, timeout: 60000 }, async () => {
  ok(await api('PATCH', '/api/me', { token: U.b.token, body: { bio: 'merhaba', city: 'İstanbul', gender: 'other', whoCanDm: 'everyone' } }));
  status(await api('PATCH', '/api/me', { token: U.b.token, body: { gender: 'zzz' } }), 400);
  status(await api('PATCH', '/api/me', { token: U.b.token, body: { avatarUrl: 'http://x/y.png' } }), 400, 'https zorunlu');
  const s = await api('GET', `/api/users/search?q=${encodeURIComponent(`e2e_${tag}_b`)}`, { token: U.a.token });
  ok(s);
  assert.ok(s.body.users.some((u) => u.id === U.b.id));
  ok(await api('POST', `/api/users/${U.b.id}/follow`, { token: U.a.token }));
  const prof = await api('GET', `/api/users/${U.b.id}`, { token: U.a.token });
  ok(prof);
  assert.equal(prof.body.profile.isFollowing, true);
  assert.equal(prof.body.profile.followers, 1);
  assert.equal(prof.body.profile.coins, undefined, 'başkasının bakiyesi görünmemeli');
  // gizli mod: WIP 10 ayrıcalığı (üyeliği olmayan açamaz)
  assert.equal((await api('PATCH', '/api/me', { token: U.c.token, body: { isHidden: true } })).status, 403, 'gizli kullanıcı WIP 10 ister');
  await giveWip(U.c, 10);
  ok(await api('PATCH', '/api/me', { token: U.c.token, body: { isHidden: true } }));
  const hidden = await api('GET', `/api/users/${U.c.id}`, { token: U.a.token });
  assert.equal(hidden.body.profile.displayName, 'Gizli Kullanıcı');
  const s2 = await api('GET', `/api/users/search?q=${encodeURIComponent(`e2e_${tag}_c`)}`, { token: U.a.token });
  assert.ok(!s2.body.users.some((u) => u.id === U.c.id), 'gizli kullanıcı aramada çıkmamalı');
  ok(await api('PATCH', '/api/me', { token: U.c.token, body: { isHidden: false } }));
  await dropWip(U.c);
  // avatar (1x1 png)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const up = await api('PUT', '/api/me/avatar', { token: U.b.token, raw: png, headers: { 'Content-Type': 'image/png' } });
  ok(up, 'avatar');
  const img = await fetch(BASE + up.body.url);
  assert.equal(img.status, 200);
  const bad = await api('PUT', '/api/me/avatar', { token: U.b.token, raw: Buffer.from('not an image at all'), headers: { 'Content-Type': 'image/png' } });
  status(bad, 400, 'sahte görsel reddedilmeli');
});

test('oda: oluşturma, etiket, katılma, mikrofon, üyeler', { skip, timeout: 60000 }, async () => {
  const r = await api('POST', '/api/rooms', { token: U.a.token, body: { name: 'E2E Oda', seatCount: 8, tags: ['müzik', 'sohbet'] } });
  ok(r, 'oda');
  roomId = r.body.room.id;
  // kalıcı oda: aynı türde ikinci "oda aç" yeni oda açmaz, mevcut odayı döndürür; ad ve etiketler profildeki gibi kalır
  const second = await api('POST', '/api/rooms', { token: U.a.token, body: { name: 'İkinci', tags: ['başka'] } });
  status(second, 200, 'aynı odaya girer');
  assert.equal(second.body.room.id, roomId);
  assert.equal(second.body.room.name, 'E2E Oda');
  const list = await api('GET', `/api/rooms?tag=${encodeURIComponent('müzik')}`);
  ok(list);
  const row = list.body.rooms.find((x) => x.id === roomId);
  assert.ok(row, 'oda listede');
  assert.equal(row.id, roomId, 'oda kimliği sahip kimliğiyle karışmamalı');
  assert.equal(row.ownerId, U.a.id);
  for (const n of ['b', 'c', 'f']) ok(await api('POST', `/api/rooms/${roomId}/join`, { token: U[n].token }), `${n} katıl`);
  const take = await api('POST', `/api/rooms/${roomId}/mic/take`, { token: U.b.token, body: {} });
  ok(take);
  assert.equal(take.body.seatIndex, 1);
  status(await api('POST', `/api/rooms/${roomId}/mic/take`, { token: U.c.token, body: { seatIndex: 1 } }), 409, 'dolu koltuk');
  status(await api('POST', `/api/rooms/${roomId}/mic/take`, { token: U.c.token, body: { seatIndex: 0 } }), 403, '0. koltuk sahibine ait');
  const m = await api('GET', `/api/rooms/${roomId}/members`, { token: U.a.token });
  ok(m);
  const byId = Object.fromEntries(m.body.members.map((x) => [x.userId, x]));
  assert.equal(byId[U.a.id].seatIndex, 0);
  assert.equal(byId[U.b.id].seatIndex, 1);
  assert.equal(byId[U.b.id].user.coins, undefined, 'üye listesinde bakiye olmamalı');
});

test('hediye: tekli, KENDİNE hediye, eşit dağıtım, bakiye/muhasebe doğruluğu', { skip, timeout: 60000 }, async () => {
  const a0 = await coins(U.a); const b0 = await diamonds(U.b); const a0d = await diamonds(U.a);
  const single = await api('POST', `/api/rooms/${roomId}/gifts/send`, { token: U.a.token, body: { giftId: rose.id, quantity: 3, distribution: 'single', recipientId: U.b.id } });
  ok(single, 'tekli');
  assert.equal(single.body.totalCoins, '30');
  assert.equal(await coins(U.a), a0 - 30n);
  assert.equal(await diamonds(U.b), b0 + 30n);

  const self = await api('POST', `/api/rooms/${roomId}/gifts/send`, { token: U.a.token, body: { giftId: rose.id, quantity: 2, distribution: 'single', recipientId: U.a.id } });
  ok(self, 'kendine hediye');
  assert.equal(await diamonds(U.a), a0d + 20n, 'kendine hediyede Diamond artar');
  assert.equal(await coins(U.a), a0 - 50n, 'Coin düşer');

  const equal = await api('POST', `/api/rooms/${roomId}/gifts/send`, { token: U.a.token, body: { giftId: rose.id, quantity: 4, distribution: 'equal' } });
  ok(equal, 'eşit');
  assert.equal(equal.body.transactions.length, 2, 'mikrofondaki iki kişiye (A ve B)');
  const wt = await sql(`SELECT COUNT(*)::int AS n FROM wallet_transactions WHERE user_id = $1 AND transaction_type = 'gift_sent'`, [U.a.id]);
  assert.ok(wt.rows[0].n >= 4);

  const random = await api('POST', `/api/rooms/${roomId}/gifts/send`, { token: U.a.token, body: { giftId: rose.id, quantity: 10, distribution: 'random' } });
  ok(random, 'rastgele');
  assert.equal(random.body.transactions.reduce((s, t) => s + t.quantity, 0), 10);

  status(await api('POST', `/api/rooms/${roomId}/gifts/send`, { token: U.d.token, body: { giftId: rose.id, quantity: 1, distribution: 'single', recipientId: U.b.id } }), 403, 'odada olmayan gönderemez');
  await sql(`UPDATE users SET coins = 5 WHERE id = $1`, [U.c.id]);
  status(await api('POST', `/api/rooms/${roomId}/gifts/send`, { token: U.c.token, body: { giftId: rose.id, quantity: 1, distribution: 'single', recipientId: U.b.id } }), 400, 'yetersiz coin');
  await sql(`UPDATE users SET coins = 100000 WHERE id = $1`, [U.c.id]);
  status(await api('POST', `/api/rooms/${roomId}/gifts/send`, { token: U.a.token, body: { giftId: rose.id, quantity: 1, distribution: 'single', recipientId: U.d.id } }), 400, 'alıcı odada değil');
  status(await api('POST', `/api/rooms/${roomId}/gifts/send`, { token: U.a.token, body: { giftId: 'zzz', quantity: 1, distribution: 'single', recipientId: U.b.id } }), 400);
  // eşzamanlı karşılıklı hediyeler kilitlenme (deadlock) üretmemeli
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) => api('POST', `/api/rooms/${roomId}/gifts/send`, {
    token: i % 2 ? U.a.token : U.b.token, body: { giftId: rose.id, quantity: 1, distribution: 'single', recipientId: i % 2 ? U.b.id : U.a.id } })));
  for (const r of results) status(r, 200, 'eşzamanlı hediye');
  const neg = await sql(`SELECT COUNT(*)::int AS n FROM users WHERE coins < 0 OR diamonds < 0`);
  assert.equal(neg.rows[0].n, 0);
  const ge = await sql(`SELECT COUNT(*)::int AS n FROM global_gift_events`);
  assert.ok(ge.rows[0].n >= 0);
  const wip = await api('GET', '/api/gifts/global/recent', { token: U.a.token });
  ok(wip);
});

test('hediye: çoklu alıcı (her birine tam adet), Tüm Koltuk / Tüm Oda, sekmeler', { skip, timeout: 60000 }, async () => {
  const list = await api('GET', '/api/gifts', { token: U.a.token });
  ok(list);
  assert.ok(list.body.globalMinCoins);
  assert.ok(list.body.gifts.every((g) => ['event', 'popular', 'private', 'vip', 'lucky', 'cp'].includes(g.category)));
  const a0 = await coins(U.a);
  const each = await api('POST', `/api/rooms/${roomId}/gifts/send`, { token: U.a.token, body: { giftId: rose.id, quantity: 2, distribution: 'each', recipientIds: [U.b.id, U.c.id] } });
  ok(each, 'each');
  assert.equal(each.body.totalCoins, '40', 'adet × kişi');
  assert.equal(await coins(U.a), a0 - 40n);
  status(await api('POST', `/api/rooms/${roomId}/gifts/send`, { token: U.a.token, body: { giftId: rose.id, quantity: 1, distribution: 'each', recipientIds: [] } }), 400, 'boş alıcı listesi');
  status(await api('POST', `/api/rooms/${roomId}/gifts/send`, { token: U.a.token, body: { giftId: rose.id, quantity: 1, distribution: 'each', recipientIds: ['00000000-0000-4000-8000-000000000000'] } }), 400, 'odada olmayan alıcı');
  const mic = await api('POST', `/api/rooms/${roomId}/gifts/send`, { token: U.a.token, body: { giftId: rose.id, quantity: 1, distribution: 'all_mic' } });
  ok(mic, 'all_mic');
  assert.ok(mic.body.transactions.every((t) => t.receiverId !== U.a.id), 'kendine gitmez');
  const all = await api('POST', `/api/rooms/${roomId}/gifts/send`, { token: U.a.token, body: { giftId: rose.id, quantity: 1, distribution: 'all_room' } });
  ok(all, 'all_room');
  assert.ok(all.body.transactions.length >= 2);
  assert.ok(all.body.transactions.every((t) => t.receiverId !== U.a.id));
});


test('moderasyon: yetki, mikrofon kapatma, atma, engelleme, rol, WIP dokunulmazlığı', { skip, timeout: 60000 }, async () => {
  status(await api('POST', `/api/rooms/${roomId}/members/${U.a.id}/kick`, { token: U.b.token }), 403, 'üye sahibi atamaz');
  ok(await api('POST', `/api/rooms/${roomId}/members/${U.b.id}/mic-off`, { token: U.a.token }), 'mic-off');
  let m = (await api('GET', `/api/rooms/${roomId}/members`, { token: U.a.token })).body.members;
  assert.equal(m.find((x) => x.userId === U.b.id).microphone, false);
  ok(await api('POST', `/api/rooms/${roomId}/members/${U.c.id}/kick`, { token: U.a.token }), 'kick');
  m = (await api('GET', `/api/rooms/${roomId}/members`, { token: U.a.token })).body.members;
  assert.ok(!m.some((x) => x.userId === U.c.id));
  // atılan kişi 24 saat giremez; oda sahibi yönetici kayıtlarından yasağı kaldırır
  const banned = await api('POST', `/api/rooms/${roomId}/join`, { token: U.c.token });
  status(banned, 403, 'atılan 24 saat giremez');
  assert.match(banned.body.message, /çıkarıldınız.*(saat|dakika) sonra/);
  status(await api('GET', `/api/rooms/${roomId}/moderation`, { token: U.b.token }), 403, 'üye yönetici kayıtlarını göremez');
  const mod1 = await api('GET', `/api/rooms/${roomId}/moderation`, { token: U.a.token });
  ok(mod1, 'yönetici kayıtları');
  assert.equal(mod1.body.kickHours, 24);
  const ban1 = mod1.body.bans.find((x) => x.userId === U.c.id);
  assert.ok(ban1 && ban1.kind === 'kick' && ban1.until && ban1.by.id === U.a.id, 'süren yasak listede');
  const hoursLeft = (new Date(ban1.until).getTime() - Date.now()) / 3600e3;
  assert.ok(hoursLeft > 23.9 && hoursLeft <= 24.01, `24 saat (${hoursLeft})`);
  const kickLog = mod1.body.logs.find((x) => x.action === 'kick' && x.targetId === U.c.id);
  assert.ok(kickLog && kickLog.actor.id === U.a.id && kickLog.banned === true && kickLog.detail.hours === 24);
  assert.ok(mod1.body.logs.some((x) => x.action === 'mic_off' && x.targetId === U.b.id), 'mikrofondan indirme kaydı');
  status(await api('DELETE', `/api/rooms/${roomId}/blocks/${U.c.id}`, { token: U.b.token }), 403, 'üye yasak kaldıramaz');
  const unb = await api('DELETE', `/api/rooms/${roomId}/blocks/${U.c.id}`, { token: U.a.token });
  ok(unb); assert.equal(unb.body.removed, true);
  ok(await api('POST', `/api/rooms/${roomId}/join`, { token: U.c.token }), 'yasak kalkınca girer');
  ok(await api('POST', `/api/rooms/${roomId}/members/${U.c.id}/block`, { token: U.a.token }), 'block');
  const blk = await api('POST', `/api/rooms/${roomId}/join`, { token: U.c.token });
  status(blk, 403, 'engelli giremez');
  assert.match(blk.body.message, /engellenmiş/);
  ok(await api('DELETE', `/api/rooms/${roomId}/blocks/${U.c.id}`, { token: U.a.token }));
  ok(await api('POST', `/api/rooms/${roomId}/join`, { token: U.c.token }));
  const mod2 = (await api('GET', `/api/rooms/${roomId}/moderation`, { token: U.a.token })).body;
  assert.equal(mod2.bans.length, 0, 'yasak kalmadı');
  assert.deepEqual(mod2.logs.filter((x) => x.targetId === U.c.id).map((x) => x.action), ['unban', 'block', 'unban', 'kick'], 'kayıtlar yeniden eskiye');
  assert.ok(mod2.logs.every((x) => x.banned === false));
  ok(await api('POST', `/api/rooms/${roomId}/members/${U.b.id}/role`, { token: U.a.token, body: { role: 'moderator' } }));
  status(await api('POST', `/api/rooms/${roomId}/members/${U.a.id}/kick`, { token: U.b.token }), 403, 'moderatör sahibi atamaz');
  status(await api('POST', `/api/rooms/${roomId}/members/${U.c.id}/role`, { token: U.b.token, body: { role: 'cohost' } }), 403, 'moderatör rol veremez');
  // WIP 6+ (atılma dokunulmazlığı) olan kullanıcı moderatör tarafından atılamaz; oda sahibi atabilir
  await sql(`INSERT INTO user_wip(user_id, level, starts_at, expires_at, is_active) VALUES($1,6,NOW(),NOW()+INTERVAL '1 day',TRUE)
             ON CONFLICT (user_id) DO UPDATE SET level=6, expires_at=NOW()+INTERVAL '1 day', is_active=TRUE`, [U.f.id]);
  status(await api('POST', `/api/rooms/${roomId}/members/${U.f.id}/kick`, { token: U.b.token }), 403, 'WIP dokunulmazlığı');
  await sql(`UPDATE user_wip SET is_active = FALSE WHERE user_id = $1`, [U.f.id]);
  ok(await api('POST', `/api/rooms/${roomId}/members/${U.b.id}/role`, { token: U.a.token, body: { role: 'user' } }));
  ok(await api('POST', `/api/rooms/${roomId}/mic/take`, { token: U.b.token, body: {} }));
});

test('yazılı sohbet: gönder, listele, sustur, sil, spam', { skip, timeout: 60000 }, async () => {
  const a = await api('POST', `/api/rooms/${roomId}/messages`, { token: U.a.token, body: { text: 'Merhaba\u202E herkese' } });
  status(a, 201);
  assert.equal(a.body.message.text, 'Merhaba herkese', 'yön değiştirme karakteri temizlenmeli');
  const b = await api('POST', `/api/rooms/${roomId}/messages`, { token: U.b.token, body: { text: 'selam' } });
  status(b, 201);
  let list = await api('GET', `/api/rooms/${roomId}/messages`, { token: U.c.token });
  ok(list);
  assert.equal(list.body.messages.length, 2);
  assert.equal(list.body.messages[0].text, 'Merhaba herkese', 'eskiden yeniye sıralı');
  status(await api('POST', `/api/rooms/${roomId}/messages`, { token: U.b.token, body: { text: 'aaaaaaaaaaaaaaaaaaaa' } }), 422, 'flood');
  status(await api('POST', `/api/rooms/${roomId}/messages`, { token: U.b.token, body: { text: '   ' } }), 400);
  ok(await api('POST', `/api/rooms/${roomId}/members/${U.c.id}/chat-mute`, { token: U.a.token, body: { minutes: 5 } }));
  status(await api('POST', `/api/rooms/${roomId}/messages`, { token: U.c.token, body: { text: 'ben' } }), 403, 'susturulmuş');
  ok(await api('POST', `/api/rooms/${roomId}/members/${U.c.id}/chat-mute`, { token: U.a.token, body: { minutes: 0 } }));
  status(await api('POST', `/api/rooms/${roomId}/messages`, { token: U.c.token, body: { text: 'ben geldim' } }), 201);
  ok(await api('DELETE', `/api/rooms/${roomId}/messages/${b.body.message.id}`, { token: U.a.token }));
  list = await api('GET', `/api/rooms/${roomId}/messages`, { token: U.a.token });
  assert.ok(!list.body.messages.some((x) => x.id === b.body.message.id), 'silinen mesaj görünmemeli');
  ok(await api('PATCH', `/api/rooms/${roomId}`, { token: U.a.token, body: { chatEnabled: false } }));
  status(await api('POST', `/api/rooms/${roomId}/messages`, { token: U.c.token, body: { text: 'kapalıyken' } }), 403, 'sohbet kapalı');
  ok(await api('POST', `/api/rooms/${roomId}/messages`, { token: U.a.token, body: { text: 'yetkili yazabilir' } }));
  ok(await api('PATCH', `/api/rooms/${roomId}`, { token: U.a.token, body: { chatEnabled: true } }));
});

test('müzik çalar: kütüphane, sıra, yetki, duraklat/devam/ara/sonraki, otomatik geçiş', { skip, timeout: 90000 }, async () => {
  const t1 = (await sql(`INSERT INTO music_tracks(title, artist, url, duration_ms, license_note) VALUES('Parça 1','Sanatçı','https://example.com/1.mp3',120000,'e2e test lisansı') RETURNING id`)).rows[0].id;
  const t2 = (await sql(`INSERT INTO music_tracks(title, artist, url, duration_ms, license_note) VALUES('Parça 2','Sanatçı','https://example.com/2.mp3',120000,'e2e test lisansı') RETURNING id`)).rows[0].id;
  const short = (await sql(`INSERT INTO music_tracks(title, artist, url, duration_ms, license_note) VALUES('Kısa','Sanatçı','https://example.com/3.mp3',2000,'e2e test lisansı') RETURNING id`)).rows[0].id;
  const lib = await api('GET', '/api/music/tracks?q=par', { token: U.f.token });
  ok(lib);
  assert.ok(lib.body.tracks.length >= 2);
  // F üye mikrofonda değil → sıraya ekleyemez; mikrofona çıkınca ekler ama kontrol edemez
  status(await api('POST', `/api/rooms/${roomId}/music/queue`, { token: U.f.token, body: { trackId: t1 } }), 403, 'mikrofonsuz ekleyemez');
  ok(await api('POST', `/api/rooms/${roomId}/mic/take`, { token: U.f.token, body: {} }));
  const q1 = await api('POST', `/api/rooms/${roomId}/music/queue`, { token: U.f.token, body: { trackId: t1 } });
  status(q1, 201);
  assert.equal(q1.body.state.status, 'playing', 'boşken ilk eklenen hemen çalar');
  assert.equal(q1.body.state.track.id, t1);
  status(await api('POST', `/api/rooms/${roomId}/music/pause`, { token: U.f.token }), 403, 'yetkisiz kontrol');
  ok(await api('POST', `/api/rooms/${roomId}/music/queue`, { token: U.a.token, body: { trackId: t2 } }));
  let st = (await api('GET', `/api/rooms/${roomId}/music`, { token: U.c.token })).body.state;
  assert.equal(st.queue.length, 1);
  await sleep(1200);
  const p = await api('POST', `/api/rooms/${roomId}/music/pause`, { token: U.a.token });
  ok(p);
  assert.equal(p.body.state.status, 'paused');
  assert.ok(p.body.state.positionMs >= 1000, `konum ilerlemiş olmalı: ${p.body.state.positionMs}`);
  const frozen = p.body.state.positionMs;
  await sleep(800);
  st = (await api('GET', `/api/rooms/${roomId}/music`, { token: U.a.token })).body.state;
  assert.equal(st.positionMs, frozen, 'duraklatılmışken konum sabit');
  ok(await api('POST', `/api/rooms/${roomId}/music/play`, { token: U.a.token }));
  const sk = await api('POST', `/api/rooms/${roomId}/music/seek`, { token: U.a.token, body: { positionMs: 60000 } });
  ok(sk);
  assert.ok(sk.body.state.positionMs >= 60000 && sk.body.state.positionMs < 62000);
  status(await api('POST', `/api/rooms/${roomId}/music/seek`, { token: U.a.token, body: { positionMs: -5 } }), 400);
  const nx = await api('POST', `/api/rooms/${roomId}/music/next`, { token: U.a.token });
  ok(nx);
  assert.equal(nx.body.state.track.id, t2);
  // otomatik geçiş: kısa şarkı bitince sıradaki/dur
  ok(await api('POST', `/api/rooms/${roomId}/music/play`, { token: U.a.token, body: { trackId: short } }));
  ok(await api('POST', `/api/rooms/${roomId}/music/queue`, { token: U.a.token, body: { trackId: t2 } }));
  await sleep(6500);
  st = (await api('GET', `/api/rooms/${roomId}/music`, { token: U.a.token })).body.state;
  assert.equal(st.track?.id, t2, 'kısa şarkı bitince sıradaki otomatik başlamalı');
  assert.equal(st.status, 'playing');
  const stop = await api('POST', `/api/rooms/${roomId}/music/stop`, { token: U.a.token });
  ok(stop);
  assert.equal(stop.body.state.status, 'stopped');
  status(await api('POST', `/api/rooms/${roomId}/music/play`, { token: U.a.token, body: { trackId: '00000000-0000-4000-8000-000000000000' } }), 404);
});

test('şifreli oda', { skip, timeout: 60000 }, async () => {
  const r = await api('POST', '/api/rooms', { token: U.e.token, body: { name: 'Gizli Oda' } });
  ok(r);
  assert.equal(r.body.room.locked, false, 'oda kurulurken şifre istenmez');
  const id = r.body.room.id;
  ok(await api('PATCH', `/api/rooms/${id}`, { token: U.e.token, body: { password: '1234' } }), 'şifre oda içinden konur');
  status(await api('POST', `/api/rooms/${id}/join`, { token: U.f.token }), 403, 'şifresiz');
  status(await api('POST', `/api/rooms/${id}/join`, { token: U.f.token, body: { password: 'yanlis' } }), 403, 'yanlış şifre');
  ok(await api('POST', `/api/rooms/${id}/join`, { token: U.f.token, body: { password: '1234' } }), 'doğru şifre');
  ok(await api('POST', `/api/rooms/${id}/join`, { token: U.f.token }), 'zaten üye olan şifresiz yeniden bağlanabilir');
  const fIn = await sql(`SELECT room_id FROM room_members WHERE user_id = $1`, [U.f.id]);
  assert.deepEqual(fIn.rows.map((x) => x.room_id), [id], 'tek oda kuralı: yeni odaya giren önceki odadan çıkar');
  ok(await api('POST', `/api/rooms/${id}/close`, { token: U.e.token }));
  ok(await api('POST', `/api/rooms/${roomId}/join`, { token: U.f.token, body: {} }), 'F ana odaya döner');
});

test('aile: kurma, katılma, çifte üyelik engeli, devir, dağıtma', { skip, timeout: 60000 }, async () => {
  const f = await api('POST', '/api/families', { token: U.a.token, body: { name: `A${tag}`.slice(0, 12), description: 'test' } });
  ok(f);
  const id = f.body.family.id;
  status(await api('POST', '/api/families', { token: U.a.token, body: { name: `B${tag}`.slice(0, 12) } }), 409, 'zaten ailede');
  // Katılım başvuru ile: yönetici onaylar
  ok(await api('POST', `/api/families/${id}/join`, { token: U.b.token }));
  const reqs = (await api('GET', `/api/families/${id}/requests`, { token: U.a.token })).body.requests;
  assert.equal(reqs.length, 1); assert.equal(reqs[0].user.id, U.b.id);
  status(await api('GET', `/api/families/${id}/requests`, { token: U.b.token }), 403, 'üye olmayan istekleri göremez');
  ok(await api('POST', `/api/families/${id}/requests/${U.b.id}/accept`, { token: U.a.token }));
  status(await api('POST', `/api/families/${id}/join`, { token: U.b.token }), 409, 'tekrar katılım');
  // İstek Ayarları: zenginlik seviyesi sınırı
  ok(await api('PUT', `/api/families/${id}/settings`, { token: U.a.token, body: { joinMinLevel: 150 } }));
  status(await api('POST', `/api/families/${id}/join`, { token: U.f.token }), 400, 'seviye şartı');
  ok(await api('PUT', `/api/families/${id}/settings`, { token: U.a.token, body: { joinMinLevel: 0 } }));
  const g = await api('POST', '/api/families', { token: U.g.token, body: { name: `C${tag}`.slice(0, 12) } });
  ok(g);
  status(await api('POST', `/api/families/${g.body.family.id}/join`, { token: U.b.token }), 409, 'başka aileye sessiz başarı OLMAMALI');
  status(await api('POST', `/api/families/${id}/leave`, { token: U.a.token }), 409, 'sahip ayrılamaz');
  const mem = await api('GET', `/api/families/${id}/members`, { token: U.a.token });
  assert.equal(mem.body.members[0].role, 'owner', 'sahip en üstte');
  // aile puanı: A'nın aileden biri olan B'ye hediyesi aile puanını artırır
  const before = BigInt((await sql('SELECT total_points FROM families WHERE id=$1', [id])).rows[0].total_points);
  ok(await api('POST', `/api/rooms/${roomId}/gifts/send`, { token: U.a.token, body: { giftId: rose.id, quantity: 5, distribution: 'single', recipientId: U.b.id } }));
  const after = BigInt((await sql('SELECT total_points FROM families WHERE id=$1', [id])).rows[0].total_points);
  assert.equal(after - before, 100n, 'alınan 50 Elmas + gönderilen 50 Coin');
  const week = (await api('GET', `/api/families/${id}/members`, { token: U.a.token })).body.members;
  assert.equal(week.find((m) => m.userId === U.b.id).weekPoints, '50', 'üyenin haftalık katkısı');
  const det = (await api('GET', `/api/families/${id}`, { token: U.b.token })).body.family;
  assert.equal(det.tier, 'Demir'); assert.equal(det.capacity, 150); assert.ok(det.publicId);
  ok(await api('POST', `/api/families/${id}/transfer`, { token: U.a.token, body: { userId: U.b.id } }));
  status(await api('DELETE', `/api/families/${id}`, { token: U.a.token }), 403, 'artık sahip değil');
  ok(await api('DELETE', `/api/families/${id}`, { token: U.b.token }));
  const mine = await api('GET', '/api/families/mine', { token: U.a.token });
  assert.equal(mine.body.family, null);
  ok(await api('DELETE', `/api/families/${g.body.family.id}`, { token: U.g.token }));
});

test('WIP: kademeler, satın alma, uzatma, düşük seviye engeli, oda sınırı artışı', { skip, timeout: 60000 }, async () => {
  const t = await api('GET', '/api/wip/tiers', { token: U.h.token });
  ok(t);
  assert.equal(t.body.tiers.length, 11, 'WIP 1–10 + SWIP');
  const plan = (lvl) => t.body.tiers.find((x) => x.level === lvl).plans[0];
  const c0 = await coins(U.h);
  ok(await api('POST', '/api/wip/purchase', { token: U.h.token, body: { planId: plan(2).id } }));
  assert.equal(await coins(U.h), c0 - BigInt(plan(2).priceCoins));
  let w = (await api('GET', '/api/wip', { token: U.h.token })).body.wip;
  assert.equal(w.level, 2);
  const exp1 = new Date(w.expiresAt).getTime();
  ok(await api('POST', '/api/wip/purchase', { token: U.h.token, body: { planId: plan(2).id } }));
  w = (await api('GET', '/api/wip', { token: U.h.token })).body.wip;
  assert.ok(new Date(w.expiresAt).getTime() - exp1 > 29 * 86400000, 'aynı seviye süreyi uzatır');
  status(await api('POST', '/api/wip/purchase', { token: U.h.token, body: { planId: plan(1).id } }), 409, 'düşük seviye');
  ok(await api('GET', '/api/me/visitors', { token: U.h.token }), 'WIP2 ziyaretçi listesi');
  status(await api('GET', '/api/me/visitors', { token: U.g.token }), 403, 'WIP yok');
  const r1 = await api('POST', '/api/rooms', { token: U.h.token, body: { name: 'H1' } });
  ok(r1);
  const again = await api('POST', '/api/rooms', { token: U.h.token, body: { name: 'H3' } });
  status(again, 200, 'aynı türde yeni oda açılmaz');
  assert.equal(again.body.room.id, r1.body.room.id);
  const r2 = await api('POST', '/api/rooms', { token: U.h.token, body: { name: 'H2', roomType: 'video' } });
  ok(r2, 'görüntülü oda');
  const h1 = await sql(`SELECT is_active FROM rooms WHERE id = $1`, [r1.body.room.id]);
  assert.equal(h1.rows[0].is_active, false, 'tek oda kuralı: görüntülü odasını açınca sesli odasından çıkar, oda kapanır');
  await api('POST', `/api/rooms/${r2.body.room.id}/close`, { token: U.h.token });
  await sql(`UPDATE users SET coins = 10 WHERE id = $1`, [U.x.id]);
  status(await api('POST', '/api/wip/purchase', { token: U.x.token, body: { planId: plan(1).id } }), 400, 'yetersiz coin');
});

let agencyId; let agencyCode;
test('ajans/yayıncı: başvuru, kod, onay, katılma, hedef/maaş, komisyon kademesi, dönem kapatma, KYC, ödeme', { skip, timeout: 90000 }, async () => {
  // Başvuru yolları kapalı: ajansı yönetici açar, yayıncılık yalnızca davetle.
  status(await api('POST', '/api/broadcaster/apply', { token: U.f.token }), 403, 'yayıncı başvurusu kapalı');
  status(await api('POST', '/api/agencies', { token: U.e.token, body: { name: `Ajans ${tag}` } }), 403, 'kullanıcı ajans kuramaz');
  status(await api('POST', '/api/admin/agencies', { token: U.a.token, body: { userId: U.e.id, name: `Ajans ${tag}` } }), 403, 'yetkisiz ajans açma');
  const ag = await api('POST', '/api/admin/agencies', { token: U.d.token, body: { userId: U.e.id, name: `Ajans ${tag}`, description: 'test ajansı' } });
  status(ag, 201);
  agencyId = ag.body.agency.id;
  assert.equal(ag.body.agency.status, 'active');
  status(await api('POST', '/api/admin/agencies', { token: U.d.token, body: { userId: U.e.id, name: `Ajans2 ${tag}` } }), 409, 'ikinci ajans');
  status(await api('POST', `/api/agencies/${agencyId}/apply`, { token: U.f.token }), 403, 'ajansa başvuru kapalı');

  const mine = await api('GET', '/api/agencies/mine', { token: U.e.token });
  agencyCode = mine.body.owned.agencyCode;
  assert.match(agencyCode, /^\d{8}$/, '8 haneli ajans kodu');
  status(await api('POST', '/api/agencies/apply-by-code', { token: U.f.token, body: { code: agencyCode } }), 403, 'kodla başvuru kapalı');
  // Kullanıcı ID'si ile bulunur ve davet edilir.
  const fPub = (await sql(`SELECT public_id FROM users WHERE id = $1`, [U.f.id])).rows[0].public_id;
  const found = await api('GET', `/api/users/search?q=${encodeURIComponent(fPub)}`, { token: U.e.token });
  ok(found);
  assert.equal(found.body.users[0].id, U.f.id, 'ID ile arama');
  const inv = await api('POST', `/api/agencies/${agencyId}/invite`, { token: U.e.token, body: { userId: U.f.id } });
  status(inv, 201);
  status(await api('POST', `/api/agency-requests/${inv.body.requestId}/respond`, { token: U.e.token, body: { accept: true } }), 403, 'daveti davet eden kabul edemez');
  ok(await api('POST', `/api/agency-requests/${inv.body.requestId}/respond`, { token: U.f.token, body: { accept: true } }));
  assert.equal((await sql(`SELECT status, agency_id FROM broadcasters WHERE user_id = $1`, [U.f.id])).rows[0].status, 'approved');
  // Ajans sahibi kendi ajansında yayıncı olabilir.
  status(await api('POST', `/api/agencies/${agencyId}/self-join`, { token: U.f.token }), 403, 'sahibi olmayan katılamaz');
  ok(await api('POST', `/api/agencies/${agencyId}/self-join`, { token: U.e.token }));
  status(await api('POST', `/api/agencies/${agencyId}/self-join`, { token: U.e.token }), 409, 'tekrar katılma');
  ok(await api('POST', '/api/broadcaster/leave-agency', { token: U.e.token }));
  await sql(`DELETE FROM broadcasters WHERE user_id = $1`, [U.e.id]);

  // Ayarlar: yalnızca yönetici; geçersiz kademe / maaş tablosu reddedilir.
  status(await api('PUT', '/api/admin/agency-config', { token: U.a.token, body: { settings: { cycle: 'monthly' } } }), 403);
  status(await api('PUT', '/api/admin/agency-config', { token: U.d.token, body: { salaryTiers: [{ hours: 9, diamonds: 100, salaryCents: 5 }, { hours: 1, diamonds: 200, salaryCents: 9 }] } }), 400, 'azalan kademe');
  ok(await api('PUT', '/api/admin/agency-config', { token: U.d.token, body: {
    settings: { cycle: 'monthly', penaltyBps: 5000, requireOfficialEvents: false, minEventCount: 0, currency: 'USD', validDayMinutes: 60, requireGameHours: false, transferWaitHours: 72 },
  } }));
  const lv = (diamonds, hours, s1, ag) => ({ diamonds, days: null, hours, gameHours: 0, salary1Cents: s1, salary2Cents: '0', agencyCents: ag });
  status(await api('PUT', '/api/admin/pay-levels', { token: U.a.token, body: { levels: [lv('100', 1, '1000', '300')] } }), 403);
  status(await api('PUT', '/api/admin/pay-levels', { token: U.d.token, body: { levels: [lv('1000', 1, '1000', '300'), lv('100', 1, '1', '1')] } }), 400, 'azalan elmas kotası');
  // Test için küçük tablo: 100 Diamond + 1 saat → 10 $ maaş, ajansa 3 $ prim; 1000 Diamond + 10 saat → 50 $.
  ok(await api('PUT', '/api/admin/pay-levels', { token: U.d.token, body: { levels: [lv('100', 1, '1000', '300'), lv('1000', 10, '5000', '900')] } }));

  // Yalnızca yayıncı onayından SONRAKİ süre ve hediyeler sayılır: önceki hediyeler (Tüm Oda testi) onaydan önceye, onay 4 saat öncesine alınır.
  await sql(`UPDATE gift_transactions SET created_at = NOW() - INTERVAL '5 hours' WHERE receiver_id = $1`, [U.f.id]);
  await sql(`UPDATE broadcasters SET approved_at = NOW() - INTERVAL '4 hours' WHERE user_id = $1`, [U.f.id]);
  // A (oda sahibi) F'ye hediye: 200 Diamond. F kendine hediye: sayılmaz.
  ok(await api('POST', `/api/rooms/${roomId}/gifts/send`, { token: U.a.token, body: { giftId: heart.id, quantity: 4, distribution: 'single', recipientId: U.f.id } }));
  ok(await api('POST', `/api/rooms/${roomId}/gifts/send`, { token: U.f.token, body: { giftId: heart.id, quantity: 4, distribution: 'single', recipientId: U.f.id } }));
  const tagged = await sql(`SELECT COUNT(*)::int AS n FROM gift_transactions WHERE receiver_id=$1 AND receiver_agency_id=$2`, [U.f.id, agencyId]);
  assert.equal(tagged.rows[0].n, 2, 'hediyeler ajansla etiketlenir');
  // F'nin 2 saatlik mikrofon oturumu
  await sql(`INSERT INTO mic_sessions(user_id, room_id, started_at, ended_at) VALUES($1,$2,NOW() - INTERVAL '3 hours', NOW() - INTERVAL '1 hour')`, [U.f.id, roomId]);

  const dash = await api('GET', `/api/agencies/${agencyId}/dashboard`, { token: U.e.token });
  ok(dash);
  assert.equal(dash.body.broadcasters.length, 1);
  assert.equal(dash.body.broadcasters[0].diamonds, '200', 'kazanca kendine hediye dahil değil');
  assert.ok(dash.body.broadcasters[0].seconds >= 7200);
  assert.equal(dash.body.totals.teamDiamonds, '200');
  assert.equal(dash.body.totals.estimatedCommissionCents, '300', '200 ≥ 100 → 1. seviyenin ajans primi');
  assert.equal(dash.body.broadcasters[0].tier, 1);
  assert.equal(dash.body.broadcasters[0].estimatedCents, '1000');
  status(await api('GET', `/api/agencies/${agencyId}/dashboard`, { token: U.g.token }), 403, 'başkası paneli göremez');
  const me = await api('GET', '/api/broadcaster/me', { token: U.f.token });
  ok(me);
  assert.equal(me.body.broadcaster.progress.diamonds, '200');
  assert.equal(me.body.broadcaster.progress.tier, 1);
  assert.equal(me.body.broadcaster.progress.next.level, 2);

  // Dönem kapatma: bitmeyen dönem force olmadan kapanmaz.
  const period = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 7);
  status(await api('POST', '/api/admin/payouts/close', { token: U.d.token, body: { period } }), 409, 'dönem bitmedi');
  status(await api('POST', '/api/admin/payouts/close', { token: U.a.token, body: { period, force: true } }), 403);
  const closed = await api('POST', '/api/admin/payouts/close', { token: U.d.token, body: { period, force: true } });
  status(closed, 201);
  assert.equal(closed.body.hostStatements, 1);
  assert.equal(closed.body.agencyStatements, 1);
  status(await api('POST', '/api/admin/payouts/close', { token: U.d.token, body: { period, force: true } }), 409, 'aynı dönem iki kez kapanmaz');

  const list = await api('GET', '/api/admin/payouts', { token: U.d.token });
  const pid = list.body.periods[0].id;
  const detail = await api('GET', `/api/admin/payouts/${pid}`, { token: U.d.token });
  ok(detail);
  const hs = detail.body.hostStatements[0]; const as = detail.body.agencyStatements[0];
  assert.equal(hs.salaryCents, '1000'); assert.equal(hs.penaltyApplied, false); assert.equal(hs.method, 1);
  assert.equal(as.commissionCents, '300'); assert.equal(as.ownerCents, '300');

  // KYC onayı olmadan yayıncı maaşı ödenemez
  status(await api('POST', `/api/admin/statements/host/${hs.id}/pay`, { token: U.d.token }), 409, 'KYC yok');
  ok(await api('POST', '/api/me/kyc/request', { token: U.f.token }));
  status(await api('POST', '/api/me/kyc/request', { token: U.f.token }), 409);
  ok(await api('POST', `/api/admin/users/${U.f.id}/kyc`, { token: U.d.token, body: { status: 'approved' } }));
  // Dolar cüzdanı: KYC'siz yayıncının maaşı dönem kapanışında yatmadı; ajans primi yattı.
  assert.equal((await api('GET', '/api/usd/me', { token: U.f.token })).body.balanceCents, '0');
  assert.equal(hs.status, 'pending');
  assert.equal(as.status, 'paid', 'ajans primi dönem kapanınca cüzdana yatar');
  assert.equal((await api('GET', '/api/usd/me', { token: U.e.token })).body.balanceCents, '300');
  ok(await api('POST', `/api/admin/statements/host/${hs.id}/pay`, { token: U.d.token }));
  assert.equal((await api('GET', '/api/usd/me', { token: U.f.token })).body.balanceCents, '1000', 'KYC onayından sonra ödenince maaş cüzdana yatar');
  status(await api('POST', `/api/admin/statements/host/${hs.id}/pay`, { token: U.d.token }), 409, 'iki kez ödenemez');
  status(await api('POST', `/api/admin/statements/agency/${as.id}/pay`, { token: U.d.token }), 409, 'ajans primi zaten cüzdanda');
  assert.equal((await api('GET', '/api/usd/me', { token: U.e.token })).body.balanceCents, '300', 'ikinci kez yatmaz');
  const stm = await api('GET', '/api/broadcaster/statements', { token: U.f.token });
  assert.equal(stm.body.statements[0].status, 'paid');
  const astm = await api('GET', `/api/agencies/${agencyId}/statements`, { token: U.e.token });
  assert.equal(astm.body.agencyStatements[0].status, 'paid');
  // Ajans Merkezi ve maaş tablosu uçları
  const home = await api('GET', `/api/agency-center/${agencyId}/home`, { token: U.e.token });
  ok(home);
  assert.equal(home.body.role, 'owner');
  status(await api('GET', `/api/agency-center/${agencyId}/home`, { token: U.g.token }), 403, 'başkası Ajansım\'ı göremez');
  ok(await api('GET', '/api/agency-center/pay-table', { token: U.f.token }));
  // Varsayılan 44 seviyeli tabloya dön (sonraki testler etkilenmesin).
  const reset = await api('POST', '/api/admin/pay-levels/reset', { token: U.d.token });
  ok(reset);
  assert.equal(reset.body.config.payLevels.length, 44);
});

test('oda: gizli oda + davet kodu, tema, WIP özel tema, sayı tahtası, sohbet temizleme', { skip, timeout: 60000 }, async () => {
  const hr = await api('POST', '/api/rooms', { token: U.g.token, body: { name: 'Gizli Oda', hidden: true, theme: 'neon' } });
  status(hr, 201);
  const hid = hr.body.room.id; const code = hr.body.room.joinCode;
  assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(hr.body.room.theme, 'neon');
  const pub = await api('GET', '/api/rooms', { token: U.x.token });
  assert.ok(!pub.body.rooms.some((r) => r.id === hid), 'gizli oda listede yok');
  status(await api('GET', `/api/rooms/${hid}`, { token: U.x.token }), 404, 'gizli oda ayrıntısı gizli');
  status(await api('POST', `/api/rooms/${hid}/join`, { token: U.x.token, body: {} }), 403, 'kodsuz girilemez');
  status(await api('POST', `/api/rooms/${hid}/join`, { token: U.x.token, body: { code: 'AAAAAA' } }), 403, 'yanlış kod');
  status(await api('POST', '/api/rooms/by-code', { token: U.x.token, body: { code: 'ZZZZZZ' } }), 404);
  const bc = await api('POST', '/api/rooms/by-code', { token: U.x.token, body: { code } });
  ok(bc);
  assert.equal(bc.body.roomId, hid);
  const j = await api('POST', `/api/rooms/${hid}/join`, { token: U.x.token, body: { code } });
  ok(j);
  assert.equal(j.body.room.joinCode, undefined, 'kodu yalnızca sahibi görür');
  const own = await api('GET', `/api/rooms/${hid}`, { token: U.g.token });
  assert.equal(own.body.room.joinCode, code);
  // kod yenileme / sabit kalma
  const same = await api('PATCH', `/api/rooms/${hid}`, { token: U.g.token, body: { hidden: true } });
  assert.equal(same.body.room.joinCode, code, 'tekrar gizleme kodu değiştirmez');
  const regen = await api('PATCH', `/api/rooms/${hid}`, { token: U.g.token, body: { regenerateCode: true } });
  assert.notEqual(regen.body.room.joinCode, code);
  // tema
  status(await api('PATCH', `/api/rooms/${hid}`, { token: U.g.token, body: { theme: 'yok' } }), 400);
  ok(await api('PATCH', `/api/rooms/${hid}`, { token: U.g.token, body: { theme: 'galaxy' } }));
  status(await api('PATCH', `/api/rooms/${hid}`, { token: U.g.token, body: { themeImageUrl: 'https://example.com/a.png' } }), 403, 'WIP 6 gerekir');
  ok(await api('POST', `/api/admin/users/${U.g.id}/wip`, { token: U.d.token, body: { level: 6, days: 30 } }));
  ok(await api('PATCH', `/api/rooms/${hid}`, { token: U.g.token, body: { themeImageUrl: 'https://example.com/a.png' } }));
  // sayı tahtası: x mikrofona çıkar, g ona hediye gönderir
  const c = await sql(`UPDATE users SET coins = coins + 10000 WHERE id = $1 RETURNING id`, [U.g.id]);
  assert.equal(c.rowCount, 1);
  ok(await api('POST', `/api/rooms/${hid}/mic/take`, { token: U.x.token, body: {} }));
  ok(await api('POST', `/api/rooms/${hid}/gifts/send`, { token: U.g.token, body: { giftId: heart.id, quantity: 3, distribution: 'single', recipientId: U.x.id } }));
  const sb = await api('GET', `/api/rooms/${hid}/scoreboard`, { token: U.x.token });
  ok(sb);
  const row = sb.body.scoreboard.find((r) => r.userId === U.x.id);
  assert.equal(row.coins, '150'); assert.equal(row.count, '3'); assert.equal(row.seatIndex, 1);
  status(await api('POST', `/api/rooms/${hid}/scoreboard/reset`, { token: U.x.token }), 403);
  ok(await api('POST', `/api/rooms/${hid}/scoreboard/reset`, { token: U.g.token }));
  assert.equal((await api('GET', `/api/rooms/${hid}/scoreboard`, { token: U.x.token })).body.scoreboard.length, 0);
  // sohbet temizleme
  ok(await api('POST', `/api/rooms/${hid}/messages`, { token: U.x.token, body: { text: 'merhaba' } }));
  status(await api('DELETE', `/api/rooms/${hid}/messages`, { token: U.x.token }), 403, 'sıradan üye temizleyemez');
  ok(await api('POST', `/api/rooms/${hid}/members/${U.x.id}/role`, { token: U.g.token, body: { role: 'moderator' } }));
  const cl = await api('DELETE', `/api/rooms/${hid}/messages`, { token: U.x.token });
  ok(cl);
  assert.equal((await api('GET', `/api/rooms/${hid}/messages`, { token: U.x.token })).body.messages.length, 0);
  // mikrofon oturumu açıldı mı
  const ms = await sql(`SELECT COUNT(*)::int AS n FROM mic_sessions WHERE room_id = $1 AND ended_at IS NULL`, [hid]);
  assert.equal(ms.rows[0].n, 2, 'sahip + mikrofondaki kullanıcı');
  ok(await api('POST', `/api/rooms/${hid}/close`, { token: U.g.token }));
  const ms2 = await sql(`SELECT COUNT(*)::int AS n FROM mic_sessions WHERE room_id = $1 AND ended_at IS NULL`, [hid]);
  assert.equal(ms2.rows[0].n, 0, 'oda kapanınca oturumlar kapanır');
});

test('PK: davet, kabul, skor (kendine hediye ve koltuktaki konuk da sayılır), bitiş', { skip, timeout: 60000 }, async () => {
  const r2 = await api('POST', '/api/rooms', { token: U.h.token, body: { name: 'PK Rakip' } });
  status(r2, 201);
  const room2 = r2.body.room.id;
  ok(await api('POST', `/api/rooms/${room2}/join`, { token: U.c.token }));
  // Odalar arası PK yalnızca görüntülü yayınlar arasında (v2.74); süreler 5/10/15/30 dk.
  status(await api('POST', '/api/pk/challenge', { token: U.a.token, body: { roomId, targetRoomId: room2, durationSeconds: 300 } }), 409, 'sesli odalar arası PK yok');
  await sql(`UPDATE rooms SET room_type = 'video' WHERE id = ANY($1::uuid[])`, [[roomId, room2]]);
  status(await api('POST', '/api/pk/challenge', { token: U.b.token, body: { roomId, targetRoomId: room2, durationSeconds: 300 } }), 403, 'sahip değil');
  status(await api('POST', '/api/pk/challenge', { token: U.a.token, body: { roomId, targetRoomId: room2, durationSeconds: 60 } }), 400, 'geçersiz süre');
  const ch = await api('POST', '/api/pk/challenge', { token: U.a.token, body: { roomId, targetRoomId: room2, durationSeconds: 300 } });
  status(ch, 201);
  const pkId = ch.body.pk.id;
  status(await api('POST', '/api/pk/challenge', { token: U.a.token, body: { roomId, targetRoomId: room2, durationSeconds: 300 } }), 409, 'ikinci PK');
  status(await api('POST', `/api/pk/${pkId}/respond`, { token: U.a.token, body: { accept: true } }), 403, 'davet eden kabul edemez');
  ok(await api('POST', `/api/pk/${pkId}/respond`, { token: U.h.token, body: { accept: true } }));
  // Micolive gibi: A'ya (oda sahibi) B hediye 50 + A kendine 100 = 150. C, H'ye 100; C koltuğa çıkıp kendine 100 → 200.
  await sql(`UPDATE users SET coins = coins + 10000 WHERE id = ANY($1::uuid[])`, [[U.a.id, U.b.id, U.c.id]]);
  ok(await api('POST', `/api/rooms/${roomId}/gifts/send`, { token: U.b.token, body: { giftId: heart.id, quantity: 1, distribution: 'single', recipientId: U.a.id } }));
  ok(await api('POST', `/api/rooms/${roomId}/gifts/send`, { token: U.a.token, body: { giftId: heart.id, quantity: 2, distribution: 'single', recipientId: U.a.id } }));
  ok(await api('POST', `/api/rooms/${room2}/gifts/send`, { token: U.c.token, body: { giftId: heart.id, quantity: 2, distribution: 'single', recipientId: U.h.id } }));
  let st = await api('GET', `/api/rooms/${roomId}/pk`, { token: U.b.token });
  assert.equal(st.body.pk.a.score, '150', 'kendine hediye de sayılır');
  assert.equal(st.body.pk.b.score, '100');
  // Dinleyiciye (koltukta olmayan) gelen hediye sayılmaz; koltuktaki konuğa gelen (kendine bile) sayılır.
  ok(await api('POST', `/api/rooms/${room2}/gifts/send`, { token: U.c.token, body: { giftId: heart.id, quantity: 1, distribution: 'single', recipientId: U.c.id } }));
  st = await api('GET', `/api/rooms/${roomId}/pk`, { token: U.b.token });
  assert.equal(st.body.pk.b.score, '100', 'dinleyiciye gelen hediye sayılmaz');
  ok(await api('POST', `/api/rooms/${room2}/mic/take`, { token: U.c.token, body: {} }), 'konuk koltuğa çıkar');
  ok(await api('POST', `/api/rooms/${room2}/gifts/send`, { token: U.c.token, body: { giftId: heart.id, quantity: 2, distribution: 'single', recipientId: U.c.id } }));
  st = await api('GET', `/api/rooms/${roomId}/pk`, { token: U.b.token });
  assert.equal(st.body.pk.b.score, '200', 'koltuktaki konuğa (kendine) gelen hediye sayılır');
  assert.equal(st.body.pk.status, 'active');
  ok(await api('POST', `/api/pk/${pkId}/cancel`, { token: U.a.token }));
  const fin = await sql(`SELECT status, winner_room FROM pk_battles WHERE id = $1`, [pkId]);
  assert.equal(fin.rows[0].status, 'finished');
  assert.equal(fin.rows[0].winner_room, room2, 'yüksek skor kazanır');
  await sql(`UPDATE rooms SET room_type = 'audio' WHERE id = $1`, [roomId]);
  ok(await api('POST', `/api/rooms/${room2}/close`, { token: U.h.token }));
});

test('Ludo: kurma, katılma, başlatma, zar/hamle yetkisi, ayrılma', { skip, timeout: 60000 }, async () => {
  status(await api('POST', `/api/rooms/${roomId}/games`, { token: U.b.token, body: {} }), 403, 'sıradan üye kuramaz');
  const g = await api('POST', `/api/rooms/${roomId}/games`, { token: U.a.token, body: { type: 'ludo' } });
  status(g, 201);
  const gid = g.body.game.id;
  status(await api('POST', `/api/rooms/${roomId}/games`, { token: U.a.token, body: {} }), 409, 'tek açık oyun');
  status(await api('POST', `/api/games/${gid}/start`, { token: U.a.token }), 409, 'tek kişiyle başlamaz');
  ok(await api('POST', `/api/games/${gid}/join`, { token: U.b.token }));
  status(await api('POST', `/api/games/${gid}/join`, { token: U.x.token }), 403, 'odada olmayan katılamaz');
  status(await api('POST', `/api/games/${gid}/start`, { token: U.b.token }), 403, 'yalnızca kurucu başlatır');
  ok(await api('POST', `/api/games/${gid}/start`, { token: U.a.token }));
  const view = await api('GET', `/api/rooms/${roomId}/game`, { token: U.b.token });
  assert.equal(view.body.game.status, 'playing');
  const turnUser = view.body.game.turnUserId;
  const other = turnUser === U.a.id ? U.b : U.a; const cur = turnUser === U.a.id ? U.a : U.b;
  status(await api('POST', `/api/games/${gid}/roll`, { token: other.token }), 409, 'sıra sizde değil');
  const roll = await api('POST', `/api/games/${gid}/roll`, { token: cur.token });
  ok(roll);
  assert.ok(roll.body.dice >= 1 && roll.body.dice <= 6);
  if (!roll.body.skipped) {
    status(await api('POST', `/api/games/${gid}/move`, { token: cur.token, body: { token: 9 } }), 409, 'geçersiz taş');
    ok(await api('POST', `/api/games/${gid}/move`, { token: cur.token, body: { token: roll.body.legal[0] } }));
  }
  // B ayrılırsa A kazanır
  ok(await api('POST', `/api/games/${gid}/leave`, { token: U.b.token }));
  const done = await sql(`SELECT status, winner_id FROM room_games WHERE id = $1`, [gid]);
  assert.equal(done.rows[0].status, 'finished');
  assert.equal(done.rows[0].winner_id, U.a.id);
});

test('Ludo modları: seri ve eşyalı oyun kurma, görünüm, oyun sayfası', { skip, timeout: 60000 }, async () => {
  // Seri mod: kurulurken seçilir, bekleyen oyunda ve başlayınca görünümde yer alır.
  let g = await api('POST', `/api/rooms/${roomId}/games`, { token: U.a.token, body: { type: 'ludo', mode: 'quick' } });
  status(g, 201);
  let gid = g.body.game.id;
  assert.equal(g.body.game.mode, 'quick');
  assert.equal(g.body.game.me.isCreator, true);
  assert.equal(g.body.game.items, null);
  const any = await api('GET', `/api/rooms/${roomId}/game?type=any`, { token: U.b.token });
  assert.equal(any.body.game.id, gid, 'type=any hangi oyun açıksa onu verir');
  assert.equal((await api('GET', `/api/rooms/${roomId}/game?type=tek`, { token: U.b.token })).body.otherGame, 'ludo');
  ok(await api('POST', `/api/games/${gid}/join`, { token: U.b.token }));
  const st = await api('POST', `/api/games/${gid}/start`, { token: U.a.token });
  ok(st);
  assert.equal(st.body.game.mode, 'quick');
  assert.deepEqual(st.body.game.kills, { 0: 0, 2: 0 });
  assert.ok(st.body.game.seq >= 1 && st.body.game.turnMsLeft > 20000);
  const cur = st.body.game.turnUserId === U.a.id ? U.a : U.b;
  const roll = await api('POST', `/api/games/${gid}/roll`, { token: cur.token });
  ok(roll);
  assert.equal(roll.body.game.me.joined, true, 'zar yanıtında kendi görünümüm');
  assert.ok(roll.body.game.seq > st.body.game.seq);
  ok(await api('POST', `/api/games/${gid}/cancel`, { token: U.a.token }));
  // Eşyalı mod: eşya kareleri görünümde. (Oyun kurma dakikada 10 ile sınırlı; bu yüzden az oyun kurulur.)
  g = await api('POST', `/api/rooms/${roomId}/games`, { token: U.a.token, body: { type: 'ludo', mode: 'items' } });
  status(g, 201);
  gid = g.body.game.id;
  assert.equal(g.body.game.mode, 'items');
  assert.equal(Object.keys(g.body.game.items).length, 12);
  assert.equal(g.body.game.items[5], 'portal');
  ok(await api('POST', `/api/games/${gid}/cancel`, { token: U.a.token }));
  // Ludo sayfası (WebView) ve bilinmeyen oyun adı.
  const page = await fetch(`${BASE}/room-game/ludo?roomId=${roomId}&lang=en`, { headers: { Authorization: `Bearer ${U.a.token}` } });
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.ok(html.includes('<title>Ludo</title>') && html.includes(`data-room="${roomId}"`) && !html.includes('__NONCE__'));
  assert.equal((await fetch(`${BASE}/room-game/satranc?roomId=${roomId}`, { headers: { Authorization: `Bearer ${U.a.token}` } })).status, 404);
  assert.equal((await fetch(`${BASE}/room-game/ludo?roomId=${roomId}`)).status, 401);
});

test('TEK kart oyunu: kurma, katılma, gizli eller, hamleler, ayrılma, oyun sayfası', { skip, timeout: 90000 }, async () => {
  const view = async (u, id) => (await api('GET', `/api/games/${id}`, { token: u.token })).body.game;
  status(await api('POST', `/api/rooms/${roomId}/games`, { token: U.b.token, body: { type: 'tek' } }), 403, 'sıradan üye kuramaz');
  status(await api('POST', `/api/rooms/${roomId}/games`, { token: U.a.token, body: { type: 'satranc' } }), 400, 'bilinmeyen oyun');
  const made = await api('POST', `/api/rooms/${roomId}/games`, { token: U.a.token, body: { type: 'tek' } });
  status(made, 201);
  const gid = made.body.game.id;
  assert.equal(made.body.game.type, 'tek');
  assert.equal(made.body.game.maxPlayers, 9);
  assert.equal(made.body.game.me.joined, true);
  assert.equal(made.body.game.me.isCreator, true);
  // Tür verilmeyen sorgu (eski Ludo ekranı) TEK oyununu görmez; tür verilince görünür.
  let r = await api('GET', `/api/rooms/${roomId}/game`, { token: U.b.token });
  assert.equal(r.body.game, null);
  assert.equal(r.body.otherGame, 'tek');
  r = await api('GET', `/api/rooms/${roomId}/game?type=tek`, { token: U.b.token });
  assert.equal(r.body.game.id, gid);
  assert.equal(r.body.game.me.joined, false);
  assert.equal(r.body.canManage, false);
  const dup = await api('POST', `/api/rooms/${roomId}/games`, { token: U.a.token, body: { type: 'ludo' } });
  status(dup, 409, 'tek açık oyun');
  assert.match(dup.body.message, /TEK/);
  status(await api('POST', `/api/games/${gid}/join`, { token: U.x.token }), 403, 'odada olmayan katılamaz');
  status(await api('GET', `/api/games/${gid}`, { token: U.x.token }), 403, 'odada olmayan göremez');
  status(await api('POST', `/api/games/${gid}/start`, { token: U.a.token }), 409, 'tek kişiyle başlamaz');
  ok(await api('POST', `/api/games/${gid}/join`, { token: U.b.token }));
  status(await api('POST', `/api/games/${gid}/start`, { token: U.b.token }), 403, 'yalnızca kurucu başlatır');
  status(await api('POST', `/api/games/${gid}/tek/draw`, { token: U.a.token }), 409, 'başlamadan hamle yok');
  const started = await api('POST', `/api/games/${gid}/start`, { token: U.a.token });
  ok(started);
  let g = started.body.game;
  assert.equal(g.status, 'playing');
  assert.equal(g.me.hand.length, 7);
  assert.equal(g.drawCount, 108 - 14 - 1);
  assert.deepEqual(g.players.map((p) => p.cards), [7, 7]);
  assert.ok(g.turnMsLeft > 10000 && g.roundMsLeft > 14 * 60e3);
  // Odadaki başka bir üye (oyuncu değil) el göremez; oyuncular yalnızca kendi elini görür.
  const mineA = (await view(U.a, gid)).me.hand.map((c) => c.id);
  const mineB = (await view(U.b, gid)).me.hand.map((c) => c.id);
  assert.equal(mineA.length, 7);
  assert.ok(!mineA.some((id) => mineB.includes(id)), 'eller ayrı');
  // Ludo uçları bu oyunda çalışmaz (durumu bozmasın); oyuncu olmayan hamle yapamaz.
  status(await api('POST', `/api/games/${gid}/roll`, { token: U.a.token }), 409, 'ludo ucu TEK oyununda geçersiz');
  status(await api('POST', `/api/games/${gid}/tek/draw`, { token: U.x.token }), 403, 'odada olmayan');
  const who = (v) => (v.turnUserId === U.a.id ? U.a : U.b);
  const other = (v) => (v.turnUserId === U.a.id ? U.b : U.a);
  status(await api('POST', `/api/games/${gid}/tek/draw`, { token: other(g).token }), 409, 'sıra sizde değil');
  status(await api('POST', `/api/games/${gid}/tek/play`, { token: who(g).token, body: { card: 999 } }), 409, 'elde olmayan kart');
  status(await api('POST', `/api/games/${gid}/tek/pass`, { token: who(g).token }), 409, 'çekmeden geçilmez');
  status(await api('POST', `/api/games/${gid}/tek/challenge`, { token: who(g).token, body: { challenge: true } }), 409, '+4 yokken itiraz yok');
  // Birkaç tur gerçek hamle: her adımda sırası gelen oyuncu sunucunun izin verdiği hamleyi yapar.
  let moves = 0;
  for (let i = 0; i < 24; i++) {
    g = await view(U.a, gid);
    if (g.status !== 'playing') break;
    const u = who(g);
    const me = (await view(u, gid)).me;
    let res;
    if (me.mustAnswer) res = await api('POST', `/api/games/${gid}/tek/challenge`, { token: u.token, body: { challenge: i % 2 === 0 } });
    else if (me.playable.length) {
      const card = me.hand.find((c) => c.id === me.playable[0]);
      if (card.code[0] === 'w') status(await api('POST', `/api/games/${gid}/tek/play`, { token: u.token, body: { card: card.id } }), 409, 'jokerde renk zorunlu');
      res = await api('POST', `/api/games/${gid}/tek/play`, { token: u.token, body: { card: card.id, color: card.code[0] === 'w' ? 'g' : undefined } });
    } else if (me.canPass) res = await api('POST', `/api/games/${gid}/tek/pass`, { token: u.token });
    else res = await api('POST', `/api/games/${gid}/tek/draw`, { token: u.token });
    ok(res, `hamle ${i}`);
    assert.ok(Array.isArray(res.body.game.me.hand), 'yanıtta kendi elim');
    moves += 1;
  }
  assert.ok(moves > 0);
  const st = (await sql(`SELECT state, status FROM room_games WHERE id = $1`, [gid])).rows[0];
  if (st.status === 'playing') {
    const total = st.state.draw.length + st.state.discard.length + st.state.players.reduce((n, p) => n + p.hand.length, 0);
    assert.equal(total, 108, 'kart sayısı korunur');
    // B ayrılırsa A kazanır; ayrılan sıralamada sondadır.
    const left = await api('POST', `/api/games/${gid}/leave`, { token: U.b.token });
    ok(left);
    assert.equal(left.body.game.status, 'finished');
    assert.equal(left.body.game.winnerId, U.a.id);
    assert.deepEqual(left.body.game.result.map((x) => [x.userId, x.left]), [[U.a.id, false], [U.b.id, true]]);
  }
  g = await view(U.a, gid);
  assert.equal(g.status, 'finished');
  assert.equal(g.result.length, 2);
  assert.equal(g.result[0].rank, 1);
  assert.ok(g.result[0].user.displayName);
  r = await api('GET', `/api/rooms/${roomId}/game?type=tek`, { token: U.a.token });
  assert.equal(r.body.game, null, 'biten oyun açık oyun değildir');
  // Kurucu oyuncu listesinden çıkıp izleyebilir; iptal yalnızca kurucu / oda sahibi.
  const again = await api('POST', `/api/rooms/${roomId}/games`, { token: U.a.token, body: { type: 'tek' } });
  status(again, 201);
  const gid2 = again.body.game.id;
  const lv = await api('POST', `/api/games/${gid2}/leave`, { token: U.a.token });
  ok(lv, 'TEK kurucusu listeden çıkabilir');
  assert.equal(lv.body.game.players.length, 0);
  assert.equal(lv.body.game.me.isCreator, true);
  status(await api('POST', `/api/games/${gid2}/cancel`, { token: U.b.token }), 403, 'üye iptal edemez');
  const cancelled = await api('POST', `/api/games/${gid2}/cancel`, { token: U.a.token });
  ok(cancelled);
  assert.equal(cancelled.body.game.status, 'cancelled');
  // Genel anahtar kapalıyken yeni oyun açılamaz ve sayfa verilmez.
  ok(await api('PUT', '/api/admin/app-config', { token: U.d.token, body: { cardGameEnabled: false } }));
  status(await api('POST', `/api/rooms/${roomId}/games`, { token: U.a.token, body: { type: 'tek' } }), 403, 'oyun kapalı');
  assert.equal((await api('GET', '/api/app/config')).body.cardGameEnabled, false);
  let page = await fetch(`${BASE}/room-game/tek?roomId=${roomId}`, { headers: { Authorization: `Bearer ${U.a.token}` } });
  assert.equal(page.status, 404);
  ok(await api('PUT', '/api/admin/app-config', { token: U.d.token, body: { cardGameEnabled: true } }));
  // Oyun sayfası (WebView): yalnızca oturumu olan oda üyesine; sıkı içerik güvenlik ilkesiyle.
  page = await fetch(`${BASE}/room-game/tek?roomId=${roomId}&lang=ar`, { headers: { Authorization: `Bearer ${U.a.token}`, 'X-App-Version': '2.107.0' } });
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.ok(html.includes(`data-room="${roomId}"`) && html.includes('data-lang="ar"') && html.includes('data-ver="2.107.0"'));
  assert.ok(!html.includes('__NONCE__') && !html.includes('__ROOM_ID__'), 'yer tutucu kalmadı');
  const csp = page.headers.get('content-security-policy');
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /script-src 'nonce-[A-Za-z0-9+/=]+'/);
  assert.ok(!csp.includes('unsafe-inline'));
  assert.equal((await fetch(`${BASE}/room-game/tek?roomId=${roomId}&lang=<script>`, { headers: { Authorization: `Bearer ${U.a.token}` } }).then((x) => x.text())).includes('data-lang="tr"'), true, 'bilinmeyen dil → tr');
  assert.equal((await fetch(`${BASE}/room-game/tek?roomId=${roomId}`)).status, 401);
  assert.equal((await fetch(`${BASE}/room-game/tek?roomId=${roomId}`, { headers: { Authorization: `Bearer ${U.x.token}` } })).status, 403);
  assert.equal((await fetch(`${BASE}/room-game/tek?roomId=abc`, { headers: { Authorization: `Bearer ${U.a.token}` } })).status, 400);
});

test('özel mesaj, gizlilik, engelleme', { skip, timeout: 60000 }, async () => {
  // Özel mesaj yalnızca arkadaşlar arasında (v2.27+)
  status(await api('POST', `/api/messages/with/${U.c.id}`, { token: U.b.token, body: { text: 'selam C' } }), 403, 'arkadaş değil');
  ok(await api('POST', `/api/friends/request/${U.c.id}`, { token: U.b.token }));
  ok(await api('POST', `/api/friends/accept/${U.b.id}`, { token: U.c.token }));
  const send = await api('POST', `/api/messages/with/${U.c.id}`, { token: U.b.token, body: { text: 'selam C' } });
  status(send, 201);
  assert.equal((await api('GET', '/api/messages/unread-count', { token: U.c.token })).body.unread, 1);
  const conv = await api('GET', '/api/messages/conversations', { token: U.c.token });
  ok(conv);
  assert.equal(conv.body.conversations[0].unread, 1);
  assert.equal(conv.body.conversations[0].peer.id, U.b.id);
  const th = await api('GET', `/api/messages/with/${U.b.id}`, { token: U.c.token });
  assert.equal(th.body.messages.length, 1);
  assert.equal((await api('GET', '/api/messages/unread-count', { token: U.c.token })).body.unread, 0, 'okundu işaretlendi');
  status(await api('POST', `/api/messages/with/${U.c.id}`, { token: U.c.token, body: { text: 'x' } }), 400, 'kendine mesaj');
  ok(await api('PATCH', '/api/me', { token: U.c.token, body: { whoCanDm: 'nobody' } }));
  status(await api('POST', `/api/messages/with/${U.c.id}`, { token: U.b.token, body: { text: 'tekrar' } }), 403, 'kimse');
  ok(await api('PATCH', '/api/me', { token: U.c.token, body: { whoCanDm: 'everyone' } }));
  status(await api('POST', `/api/messages/with/${U.c.id}`, { token: U.b.token, body: { text: 'artık olur' } }), 201);
  // fotoğraf mesajı: önce yüklenir; başkasının yüklediği / dış adres / boş mesaj reddedilir
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const up = await api('PUT', '/api/messages/image', { token: U.b.token, raw: png, headers: { 'Content-Type': 'image/png' } });
  ok(up, 'sohbet fotoğrafı yükleme');
  const pic = await api('POST', `/api/messages/with/${U.c.id}`, { token: U.b.token, body: { imageUrl: up.body.url } });
  status(pic, 201);
  assert.equal(pic.body.message.imageUrl, up.body.url);
  assert.equal(pic.body.message.text, '');
  status(await api('POST', `/api/messages/with/${U.b.id}`, { token: U.c.token, body: { imageUrl: up.body.url } }), 403, 'başkasının fotoğrafı');
  status(await api('POST', `/api/messages/with/${U.c.id}`, { token: U.b.token, body: { imageUrl: 'https://evil.test/a.png' } }), 400, 'dış adres');
  status(await api('POST', `/api/messages/with/${U.c.id}`, { token: U.b.token, body: {} }), 400, 'boş mesaj');
  const conv2 = await api('GET', '/api/messages/conversations', { token: U.c.token });
  assert.equal(conv2.body.conversations.find((x) => x.peer.id === U.b.id).lastMessage, '📷 Fotoğraf');
  const th2 = await api('GET', `/api/messages/with/${U.b.id}`, { token: U.c.token });
  assert.equal(th2.body.messages.at(-1).imageUrl, up.body.url);
  // arkadaşlık isteği 7×24 saat geçerli; süresi dolunca listede/rozette görünmez, yeniden gönderilince tazelenir
  const fr1 = await register('fr1'); const fr2 = await register('fr2');
  ok(await api('POST', `/api/friends/request/${fr2.id}`, { token: fr1.token }));
  assert.equal((await api('GET', '/api/friends/requests', { token: fr2.token })).body.requests.length, 1);
  await sql(`UPDATE friend_requests SET created_at = NOW() - INTERVAL '8 days' WHERE requester_id = $1 AND target_id = $2`, [fr1.id, fr2.id]);
  assert.equal((await api('GET', '/api/friends/requests', { token: fr2.token })).body.requests.length, 0, 'süresi dolan istek');
  assert.equal((await api('GET', '/api/me/badges', { token: fr2.token })).body.friends, 0);
  ok(await api('POST', `/api/friends/request/${fr2.id}`, { token: fr1.token }));
  assert.equal((await api('GET', '/api/friends/requests', { token: fr2.token })).body.requests.length, 1, 'yeniden gönderilince geçerli');
  assert.equal((await api('GET', '/api/me/badges', { token: fr2.token })).body.friends, 1);
  ok(await api('POST', `/api/users/${U.b.id}/follow`, { token: U.c.token }));
  // engelleme: takip kalkar, mesaj/arama kapanır
  ok(await api('POST', `/api/blocks/${U.b.id}`, { token: U.c.token }));
  status(await api('POST', `/api/messages/with/${U.c.id}`, { token: U.b.token, body: { text: 'engelli' } }), 403);
  status(await api('POST', `/api/messages/with/${U.b.id}`, { token: U.c.token, body: { text: 'ben engelledim' } }), 403);
  const prof = await api('GET', `/api/users/${U.b.id}`, { token: U.a.token });
  assert.equal(prof.body.profile.following !== undefined, true);
  const s = await api('GET', `/api/users/search?q=${encodeURIComponent(`e2e_${tag}_c`)}`, { token: U.b.token });
  assert.ok(!s.body.users.some((u) => u.id === U.c.id), 'engelleyen kullanıcı aramada görünmemeli');
  status(await api('POST', `/api/users/${U.c.id}/follow`, { token: U.b.token }), 403);
  const bl = await api('GET', '/api/blocks', { token: U.c.token });
  assert.ok(bl.body.users.some((u) => u.id === U.b.id));
  ok(await api('DELETE', `/api/blocks/${U.b.id}`, { token: U.c.token }));
});

test('şikâyet ve yönetim', { skip, timeout: 60000 }, async () => {
  status(await api('POST', '/api/reports', { token: U.b.token, body: { kind: 'user', targetUserId: U.c.id, reason: 'spam', details: 'test' } }), 201);
  const dup = await api('POST', '/api/reports', { token: U.b.token, body: { kind: 'user', targetUserId: U.c.id, reason: 'spam' } });
  ok(dup);
  assert.equal(dup.body.duplicate, true);
  status(await api('POST', '/api/reports', { token: U.b.token, body: { kind: 'user', reason: 'spam' } }), 400, 'hedef gerekli');
  status(await api('POST', '/api/reports', { token: U.b.token, body: { kind: 'user', targetUserId: U.c.id, reason: 'uydurma' } }), 400);
  status(await api('GET', '/api/admin/reports', { token: U.b.token }), 403, 'yetkisiz');
  const rep = await api('GET', '/api/admin/reports', { token: U.d.token });
  ok(rep);
  assert.equal(rep.body.reports.length, 1);
  ok(await api('POST', `/api/admin/reports/${rep.body.reports[0].id}/resolve`, { token: U.d.token, body: { status: 'resolved', note: 'ok' } }));
  // yasaklama oturumu anında geçersiz kılar
  ok(await api('POST', `/api/admin/users/${U.g.id}/ban`, { token: U.d.token, body: { reason: 'e2e' } }));
  status(await api('GET', '/api/me', { token: U.g.token }), 401, 'yasaklı token geçersiz');
  // coin düzenleme yalnızca admin; negatif bakiye olmaz
  const c0 = await coins(U.b);
  ok(await api('POST', `/api/admin/users/${U.b.id}/coins`, { token: U.d.token, body: { amount: 500, reason: 'test' } }));
  assert.equal(await coins(U.b), c0 + 500n);
  status(await api('POST', `/api/admin/users/${U.b.id}/coins`, { token: U.d.token, body: { amount: '0x10' } }), 400, 'onaltılık reddedilir');
  status(await api('POST', `/api/admin/users/${U.b.id}/coins`, { token: U.d.token, body: { amount: -99999999999 } }), 400, 'bakiye negatife düşemez');
  // güvenlik uç noktaları
  ok(await api('GET', '/api/admin/security/events', { token: U.d.token }));
  status(await api('POST', '/api/admin/security/blocks', { token: U.d.token, body: { ip: '203.0.113.9', minutes: 5, reason: 'e2e' } }), 201);
  const bl = await api('GET', '/api/admin/security/blocks', { token: U.d.token });
  assert.ok(bl.body.blocks.some((b) => b.ip === '203.0.113.9'));
  ok(await api('DELETE', '/api/admin/security/blocks/203.0.113.9', { token: U.d.token }));
  status(await api('POST', '/api/admin/security/blocks', { token: U.d.token, body: { ip: 'abc' } }), 400);
  const row = await sql(`SELECT 1 FROM firewall_blocks WHERE ip = '203.0.113.9'`);
  assert.equal(row.rowCount, 0, 'kalıcı yasak kaydı silinmeli');
});

test('roller: yardımcı admin (dar yetki, süreli ban) ve oda moderatörü', { skip, timeout: 90000 }, async () => {
  const sup = await register('sup'); const v = await register('victim'); const v2 = await register('victim2');
  // yardımcı admini yalnızca yönetici atar
  status(await api('POST', `/api/admin/users/${sup.id}/staff-role`, { token: U.a.token, body: { role: 'support' } }), 403, 'normal kullanıcı atayamaz');
  ok(await api('POST', `/api/admin/users/${sup.id}/staff-role`, { token: U.d.token, body: { role: 'support' } }));
  // dar yetki: nick, fotoğraf, ban serbest
  ok(await api('GET', `/api/admin/users?q=${v.username}`, { token: sup.token }), 'arama');
  ok(await api('POST', `/api/admin/users/${v.id}/display-name`, { token: sup.token, body: { displayName: 'Yeni Nick' } }));
  assert.equal((await sql('SELECT display_name FROM users WHERE id=$1', [v.id])).rows[0].display_name, 'Yeni Nick');
  await sql(`UPDATE users SET avatar_url = 'https://x.test/a.png' WHERE id = $1`, [v.id]);
  ok(await api('POST', `/api/admin/users/${v.id}/avatar`, { token: sup.token, body: { avatarUrl: null } }));
  assert.equal((await sql('SELECT avatar_url FROM users WHERE id=$1', [v.id])).rows[0].avatar_url, null);
  // Coin: yalnızca yükleme, tek seferde en fazla 100.000 (v2.71); WIP verebilir.
  ok(await api('POST', `/api/admin/users/${v.id}/coins`, { token: sup.token, body: { amount: 100 } }), 'coin yükleme');
  status(await api('POST', `/api/admin/users/${v.id}/coins`, { token: sup.token, body: { amount: 100001 } }), 403, 'coin sınırı');
  status(await api('POST', `/api/admin/users/${v.id}/coins`, { token: sup.token, body: { amount: -50 } }), 403, 'coin düşemez');
  ok(await api('POST', `/api/admin/users/${v.id}/wip`, { token: sup.token, body: { level: 1, days: 1 } }), 'wip');
  status(await api('POST', `/api/admin/users/${U.d.id}/wip`, { token: sup.token, body: { level: 1, days: 1 } }), 403, 'yöneticiye wip veremez');
  // yasak alanlar
  status(await api('POST', `/api/admin/users/${v.id}/staff-role`, { token: sup.token, body: { role: 'support' } }), 403, 'yetki dağıtamaz');
  status(await api('GET', '/api/admin/staff', { token: sup.token }), 403);
  status(await api('GET', '/api/admin/reports', { token: sup.token }), 403);
  status(await api('POST', `/api/admin/users/${U.d.id}/ban`, { token: sup.token, body: {} }), 403, 'yöneticiyi banlayamaz');
  // süreli ban: giriş reddedilir, süre dolunca otomatik açılır
  ok(await api('POST', `/api/admin/users/${v.id}/ban`, { token: sup.token, body: { hours: 2, reason: 'spam' } }));
  const lg = await api('POST', '/api/auth/login', { body: { username: v.username, password: 'sifre123' } });
  status(lg, 403, 'banlı giriş');
  assert.match(lg.body.error || lg.body.message || '', /spam/);
  status(await api('GET', '/api/me', { token: v.token }), 401, 'banlı token');
  await sql(`UPDATE users SET banned_until = NOW() - INTERVAL '1 minute' WHERE id = $1`, [v.id]);
  const lg2 = await api('POST', '/api/auth/login', { body: { username: v.username, password: 'sifre123' } });
  ok(lg2, 'süre dolunca giriş açılır');
  assert.equal((await sql('SELECT account_status FROM users WHERE id=$1', [v.id])).rows[0].account_status, 'active');
  // süresiz ban + kaldırma
  ok(await api('POST', `/api/admin/users/${v2.id}/ban`, { token: sup.token, body: {} }));
  assert.equal((await sql('SELECT banned_until FROM users WHERE id=$1', [v2.id])).rows[0].banned_until, null);
  ok(await api('POST', `/api/admin/users/${v2.id}/unban`, { token: sup.token, body: {} }));
  status(await api('POST', `/api/admin/users/${v2.id}/ban`, { token: sup.token, body: { hours: -5 } }), 400);
  // yetkiyi geri alınca panel kapanır
  ok(await api('POST', `/api/admin/users/${sup.id}/staff-role`, { token: U.d.token, body: { role: 'user' } }));
  status(await api('GET', `/api/admin/users?q=${v.username}`, { token: sup.token }), 403);

  // ---- Oda moderatörü ----
  const own = await register('own'); const mod = await register('mod'); const u1 = await register('u1'); const u2 = await register('u2');
  const room = (await api('POST', '/api/rooms', { token: own.token, body: { name: 'Rol Odası', seatCount: 8 } })).body.room;
  for (const x of [mod, u1, u2]) ok(await api('POST', `/api/rooms/${room.id}/join`, { token: x.token, body: {} }));
  status(await api('POST', `/api/rooms/${room.id}/members/${mod.id}/role`, { token: u1.token, body: { role: 'moderator' } }), 403, 'normal üye moderatör atayamaz');
  ok(await api('POST', `/api/rooms/${room.id}/members/${mod.id}/role`, { token: own.token, body: { role: 'moderator' } }));
  status(await api('POST', `/api/rooms/${room.id}/members/${u1.id}/role`, { token: mod.token, body: { role: 'moderator' } }), 403, 'moderatör yetki dağıtamaz');
  // koltuk kilidi
  status(await api('POST', `/api/rooms/${room.id}/seats/3/lock`, { token: u1.token, body: { locked: true } }), 403, 'normal üye kilitleyemez');
  ok(await api('POST', `/api/rooms/${room.id}/seats/3/lock`, { token: mod.token, body: { locked: true } }));
  status(await api('POST', `/api/rooms/${room.id}/mic/take`, { token: u1.token, body: { seatIndex: 3 } }), 403, 'kilitli koltuk');
  status(await api('POST', `/api/rooms/${room.id}/seats/0/lock`, { token: mod.token, body: { locked: true } }), 400, 'sahip koltuğu kilitlenmez');
  ok(await api('POST', `/api/rooms/${room.id}/seats/3/lock`, { token: mod.token, body: { locked: false } }));
  // davet, indirme, susturma, atma
  status(await api('POST', `/api/rooms/${room.id}/members/${u1.id}/mic-invite`, { token: u2.token, body: {} }), 403, 'üye davet edemez');
  ok(await api('POST', `/api/rooms/${room.id}/members/${u1.id}/mic-invite`, { token: mod.token, body: { seatIndex: 2 } }));
  ok(await api('POST', `/api/rooms/${room.id}/mic/take`, { token: u1.token, body: { seatIndex: 2 } }));
  status(await api('POST', `/api/rooms/${room.id}/members/${u1.id}/mic-invite`, { token: mod.token, body: {} }), 409, 'zaten mikrofonda');
  ok(await api('POST', `/api/rooms/${room.id}/members/${u1.id}/mic-off`, { token: mod.token }), 'koltuktan kaldır');
  ok(await api('POST', `/api/rooms/${room.id}/members/${u2.id}/chat-mute`, { token: mod.token, body: { minutes: 5 } }), 'sustur');
  ok(await api('DELETE', `/api/rooms/${room.id}/messages`, { token: mod.token }), 'sohbet temizle');
  status(await api('POST', `/api/rooms/${room.id}/members/${own.id}/kick`, { token: mod.token }), 403, 'sahibi atamaz');
  ok(await api('POST', `/api/rooms/${room.id}/members/${u2.id}/kick`, { token: mod.token }), 'normal üyeyi at');
  status(await api('POST', `/api/rooms/${room.id}/leave`, { token: u1.token }), 200);
  ok(await api('POST', `/api/rooms/${room.id}/leave`, { token: own.token }));
});

test('favori yayıncı, son girilen odalar, oda arama, mikrofon sırası', { skip, timeout: 90000 }, async () => {
  const host = await register('fh'); const fan = await register('fan'); const w1 = await register('w1'); const w2 = await register('w2');
  const room = (await api('POST', '/api/rooms', { token: host.token, body: { name: 'Karaoke Gecesi', seatCount: 2, tags: ['karaoke'] } })).body.room;
  // arama: ad, etiket, yayıncı adı; LIKE joker karakteri etkisiz
  for (const q of ['karaoke', 'GECESI', 'Kişi fh']) {
    const r = await api('GET', `/api/rooms?q=${encodeURIComponent(q)}`, { token: fan.token });
    ok(r, q);
    assert.ok(r.body.rooms.some((x) => x.id === room.id), `arama bulmalı: ${q}`);
  }
  const wild = await api('GET', `/api/rooms?q=${encodeURIComponent('%')}`, { token: fan.token });
  assert.ok(!wild.body.rooms.some((x) => x.id === room.id), '% joker değil');
  assert.ok(!(await api('GET', '/api/rooms?q=yokboylebiroda', { token: fan.token })).body.rooms.length);
  // favori
  status(await api('POST', `/api/rooms/hosts/${fan.id}/favorite`, { token: fan.token }), 400, 'kendini ekleyemez');
  ok(await api('POST', `/api/rooms/hosts/${host.id}/favorite`, { token: fan.token }));
  ok(await api('POST', `/api/rooms/hosts/${host.id}/favorite`, { token: fan.token }), 'tekrar ekleme zararsız');
  assert.equal((await api('GET', `/api/rooms/hosts/${host.id}/favorite`, { token: fan.token })).body.favorite, true);
  const fav = await api('GET', '/api/rooms/favorites', { token: fan.token });
  ok(fav);
  assert.equal(fav.body.hosts.length, 1);
  assert.equal(fav.body.hosts[0].room.id, room.id, 'yayıncı açıkken oda görünür');
  // son girilen
  ok(await api('POST', `/api/rooms/${room.id}/join`, { token: fan.token, body: {} }));
  const rec = await api('GET', '/api/rooms/recent', { token: fan.token });
  assert.equal(rec.body.recent[0].user.id, host.id);
  // mikrofon sırası: 2 koltuklu odada 0. koltuk sahibin, tek boş koltuk 1
  for (const x of [w1, w2]) ok(await api('POST', `/api/rooms/${room.id}/join`, { token: x.token, body: {} }));
  ok(await api('POST', `/api/rooms/${room.id}/mic/take`, { token: fan.token, body: {} }));
  status(await api('POST', `/api/rooms/${room.id}/mic/take`, { token: w1.token, body: {} }), 409, 'koltuk dolu');
  ok(await api('POST', `/api/rooms/${room.id}/mic/queue`, { token: w1.token }));
  const qr = await api('POST', `/api/rooms/${room.id}/mic/queue`, { token: w2.token });
  assert.deepEqual(qr.body.queue, [w1.id, w2.id], 'sıra eskiden yeniye');
  ok(await api('POST', `/api/rooms/${room.id}/mic/queue`, { token: w1.token }), 'çift kayıt olmaz');
  assert.equal((await api('GET', `/api/rooms/${room.id}/mic/queue`, { token: w1.token })).body.queue.length, 2);
  // koltuk boşalınca ilk kişi sıradan düşer (davet gider), diğeri kalır
  ok(await api('POST', `/api/rooms/${room.id}/mic/leave`, { token: fan.token }));
  assert.deepEqual((await api('GET', `/api/rooms/${room.id}/mic/queue`, { token: w2.token })).body.queue, [w2.id]);
  ok(await api('POST', `/api/rooms/${room.id}/mic/take`, { token: w1.token, body: {} }));
  ok(await api('DELETE', `/api/rooms/${room.id}/mic/queue`, { token: w2.token }));
  assert.equal((await api('GET', `/api/rooms/${room.id}/mic/queue`, { token: w2.token })).body.queue.length, 0);
  ok(await api('DELETE', `/api/rooms/hosts/${host.id}/favorite`, { token: fan.token }));
  assert.equal((await api('GET', '/api/rooms/favorites', { token: fan.token })).body.hosts.length, 0);
  ok(await api('POST', `/api/rooms/${room.id}/leave`, { token: host.token }));
});

test('Keşfet akışı, banner ve duyurular', { skip, timeout: 90000 }, async () => {
  const a = await register('fa'); const b = await register('fb');
  // gönderi: boş olamaz, yazı ile açılır, beğeni tekrar sayılmaz, yorum sayacı artar
  status(await api('POST', '/api/posts', { token: a.token, body: { text: '   ' } }), 400, 'boş gönderi');
  const post = (await api('POST', '/api/posts', { token: a.token, body: { text: 'Merhaba dünya' } })).body.post;
  assert.equal(post.mine, true);
  ok(await api('POST', `/api/posts/${post.id}/like`, { token: b.token }));
  const again = await api('POST', `/api/posts/${post.id}/like`, { token: b.token });
  assert.equal(again.body.likeCount, 1, 'çifte beğeni sayılmaz');
  ok(await api('POST', `/api/posts/${post.id}/comments`, { token: b.token, body: { text: 'Güzel!' } }));
  assert.equal((await api('GET', `/api/posts/${post.id}/comments`, { token: b.token })).body.comments.length, 1);
  // akış: genel herkese, takip yalnızca takip edilenlere
  const all = await api('GET', '/api/posts?scope=all', { token: b.token });
  const row = all.body.posts.find((x) => x.id === post.id);
  assert.ok(row && row.liked === true && row.commentCount === 1);
  assert.ok(!(await api('GET', '/api/posts?scope=following', { token: b.token })).body.posts.some((x) => x.id === post.id));
  ok(await api('POST', `/api/users/${a.id}/follow`, { token: b.token }));
  assert.ok((await api('GET', '/api/posts?scope=following', { token: b.token })).body.posts.some((x) => x.id === post.id));
  // silme: başkası silemez, sahibi siler
  status(await api('DELETE', `/api/posts/${post.id}`, { token: b.token }), 403, 'başkası silemez');
  ok(await api('DELETE', `/api/posts/${post.id}`, { token: a.token }));
  assert.ok(!(await api('GET', '/api/posts?scope=all', { token: b.token })).body.posts.some((x) => x.id === post.id));
  // görsel adresi yalnızca yüklenen dosya biçiminde olabilir
  status(await api('POST', '/api/posts', { token: a.token, body: { text: 'x', imageUrl: 'https://evil.test/a.png' } }), 400, 'dış adres');
  // banner ve duyuru yalnızca yönetici
  status(await api('POST', '/api/admin/announcements', { token: a.token, body: { kind: 'event', title: 'Test', text: 'Merhaba' } }), 403);
  ok(await api('POST', '/api/admin/announcements', { token: U.d.token, body: { kind: 'event', title: 'Etkinlik', text: 'Hafta sonu yarışma' } }));
  const ann = await api('GET', '/api/announcements?kind=event', { token: a.token });
  assert.equal(ann.body.announcements[0].title, 'Etkinlik');
  const sum = await api('GET', '/api/inbox-summary', { token: a.token });
  assert.ok(sum.body.event >= 1);
  // görselli/bağlantılı duyuru kartı; rozetler türe göre ayrı sıfırlanır
  const apng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const aimg = await api('PUT', '/api/admin/announcements/image', { token: U.d.token, raw: apng, headers: { 'Content-Type': 'image/png' } });
  ok(aimg, 'duyuru görseli');
  ok(await api('POST', '/api/admin/announcements', { token: U.d.token, body: { kind: 'reward', title: 'Ödül transferi', text: 'Ödülün gönderildi', imageUrl: aimg.body.url, linkUrl: 'https://example.com/odul' } }));
  status(await api('POST', '/api/admin/announcements', { token: U.d.token, body: { kind: 'reward', title: 'Kötü', text: 'x', imageUrl: 'https://evil.test/a.png' } }), 400, 'dış görsel');
  const rw = (await api('GET', '/api/announcements?kind=reward', { token: a.token })).body.announcements[0];
  assert.equal(rw.imageUrl, aimg.body.url);
  assert.equal(rw.linkUrl, 'https://example.com/odul');
  const sumBefore = (await api('GET', '/api/inbox-summary', { token: a.token })).body;
  assert.ok(sumBefore.reward >= 1 && sumBefore.event >= 1);
  ok(await api('POST', '/api/inbox-summary/seen', { token: a.token, body: { kind: 'reward' } }));
  const after2 = (await api('GET', '/api/inbox-summary', { token: a.token })).body;
  assert.equal(after2.reward, 0, 'ödül kartı okundu');
  assert.equal(after2.event, sumBefore.event, 'etkinlik rozeti korunur');
  ok(await api('POST', '/api/inbox-summary/seen', { token: a.token, body: {} }));
  assert.equal((await api('GET', '/api/inbox-summary', { token: a.token })).body.event, 0, 'türsüz istek hepsini sıfırlar');
  assert.deepEqual((await api('GET', '/api/banners')).body.banners, []);
  // oda bölgesi / şehir filtresi ve yeni koltuk düzeni
  const fc = await register('fc');
  status(await api('POST', '/api/rooms', { token: fc.token, body: { name: 'Yedi', seatCount: 7 } }), 400, 'desteklenmeyen düzen');
  const six = await api('POST', '/api/rooms', { token: fc.token, body: { name: 'Altı koltuk', seatCount: 6 } });
  status(six, 201);
  assert.equal(six.body.room.seatCount, 6);
  status(await api('GET', '/api/rooms?region=near'), 401, 'yakındakiler giriş ister');
});

test('kalıcı oda: bir kez kur, tek adımda aç, ad/etiket sabit, yöneticiler korunur', { skip, timeout: 90000 }, async () => {
  const own = await register('po'); const mod = await register('pm');
  assert.deepEqual((await api('GET', '/api/rooms/mine', { token: own.token })).body.rooms, { audio: null, video: null });
  status(await api('POST', '/api/rooms', { token: own.token, body: {} }), 400, 'ilk kurulumda ad zorunlu');
  const first = await api('POST', '/api/rooms', { token: own.token, body: { name: 'Benim Odam', tags: ['sohbet', 'müzik'], seatCount: 9 } });
  status(first, 201);
  const roomId1 = first.body.room.id;
  // yönetici ata
  ok(await api('POST', `/api/rooms/${roomId1}/join`, { token: mod.token }));
  ok(await api('POST', `/api/rooms/${roomId1}/members/${mod.id}/role`, { token: own.token, body: { role: 'moderator' } }));
  const mgr = (await api('GET', `/api/rooms/${roomId1}/managers`, { token: mod.token })).body.managers;
  assert.equal(mgr[0].role, 'owner');
  assert.ok(mgr.some((m) => m.user.id === mod.id && m.role === 'moderator'));
  // oda içinden ad/etiket değişir ve kalıcı olur
  ok(await api('PATCH', `/api/rooms/${roomId1}`, { token: own.token, body: { name: 'Yeni Ad', tags: ['karaoke'] } }));
  status(await api('PATCH', `/api/rooms/${roomId1}`, { token: mod.token, body: { name: 'Hack' } }), 403, 'moderatör adı değiştiremez');
  // mikrofon modu: koltuk sayısı değişir, taşan koltuktakiler iner, oda sahibi 0. koltuğa geri dönebilir
  ok(await api('PATCH', `/api/rooms/${roomId1}`, { token: own.token, body: { seatCount: 12 } }));
  ok(await api('POST', `/api/rooms/${roomId1}/mic/take`, { token: mod.token, body: { seatIndex: 10 } }));
  ok(await api('POST', `/api/rooms/${roomId1}/mic/take`, { token: own.token, body: { seatIndex: 3 } }));
  ok(await api('POST', `/api/rooms/${roomId1}/mic/take`, { token: own.token, body: { seatIndex: 0 } }));
  ok(await api('PATCH', `/api/rooms/${roomId1}`, { token: own.token, body: { seatCount: 5 } }));
  const after = (await api('GET', `/api/rooms/${roomId1}/members`, { token: own.token })).body.members;
  assert.equal(after.find((x) => x.userId === mod.id).seatIndex, null, 'taşan koltuk boşalır');
  assert.equal(after.find((x) => x.userId === own.id).seatIndex, 0);
  status(await api('PATCH', `/api/rooms/${roomId1}`, { token: own.token, body: { seatCount: 7 } }), 400, 'desteklenmeyen koltuk sayısı');
  status(await api('PATCH', `/api/rooms/${roomId1}`, { token: mod.token, body: { seatCount: 8 } }), 403, 'moderatör modu değiştiremez');
  ok(await api('PATCH', `/api/rooms/${roomId1}`, { token: own.token, body: { seatCount: 9 } }));
  // kapat ve tek adımda yeniden aç
  ok(await api('POST', `/api/rooms/${roomId1}/close`, { token: own.token }));
  const mine = (await api('GET', '/api/rooms/mine', { token: own.token })).body.rooms.audio;
  assert.equal(mine.name, 'Yeni Ad'); assert.deepEqual(mine.tags, ['karaoke']); assert.equal(mine.seatCount, 9); assert.equal(mine.activeRoomId, null);
  const reopen = await api('POST', '/api/rooms', { token: own.token, body: { name: 'Yok Sayılır' } });
  status(reopen, 201);
  assert.equal(reopen.body.room.name, 'Yeni Ad'); assert.equal(reopen.body.room.seatCount, 9);
  // heartbeat: üye canlı tutulur, üye olmayan 403, kapalı oda 404
  ok(await api('POST', `/api/rooms/${reopen.body.room.id}/heartbeat`, { token: own.token }));
  status(await api('POST', `/api/rooms/${reopen.body.room.id}/heartbeat`, { token: mod.token }), 403, 'üye olmayan');
  // yönetici yeni oturumda rolünü geri alır
  const j = await api('POST', `/api/rooms/${reopen.body.room.id}/join`, { token: mod.token });
  assert.equal(j.body.me.role, 'moderator');
  // görüntülü oda ayrı kurulur
  const video = await api('POST', '/api/rooms', { token: own.token, body: { name: 'Kamera', roomType: 'video', seatCount: 4 } });
  status(video, 201);
  assert.equal(video.body.room.roomType, 'video');
  assert.equal(video.body.room.layout, 'grid', 'eski istek: çoklu (ızgara) düzen');
  // "Yayın başlat" (setup: true): kayıtlı bilgiler güncellenir; canlı yayında koltuk sayısı 4'e sabitlenir
  ok(await api('POST', `/api/rooms/${video.body.room.id}/close`, { token: own.token }));
  const live = await api('POST', '/api/rooms', { token: own.token, body: { setup: true, roomType: 'video', layout: 'live', name: 'Canlı Ben', tags: ['Sohbet'], seatCount: 12 } });
  status(live, 201);
  assert.equal(live.body.room.layout, 'live');
  assert.equal(live.body.room.seatCount, 4);
  assert.equal(live.body.room.name, 'Canlı Ben');
  assert.deepEqual(live.body.room.tags, ['sohbet']);
  status(await api('PATCH', `/api/rooms/${live.body.room.id}`, { token: own.token, body: { seatCount: 9 } }), 400, 'canlı yayında koltuk sabit');
  const listed = (await api('GET', '/api/rooms?type=video', { token: own.token })).body.rooms.find((x) => x.id === live.body.room.id);
  assert.equal(listed.layout, 'live');
  ok(await api('POST', `/api/rooms/${live.body.room.id}/close`, { token: own.token }));
  const grid = await api('POST', '/api/rooms', { token: own.token, body: { setup: true, roomType: 'video', layout: 'grid', name: 'Çoklu Ben', tags: ['eğlence'], seatCount: 6 } });
  status(grid, 201);
  assert.equal(grid.body.room.layout, 'grid');
  assert.equal(grid.body.room.seatCount, 6);
  assert.deepEqual(grid.body.room.tags, ['eğlence']);
  const vm = (await api('GET', '/api/rooms/mine', { token: own.token })).body.rooms.video;
  assert.equal(vm.layout, 'grid');
  assert.equal(vm.name, 'Çoklu Ben');
  assert.equal(vm.activeRoomId, grid.body.room.id);
  // sesli: kapak/duyuru/etiket/mikrofon modu ilk kurulumda kaydedilir; sonraki açılışlar setup olmadan aynı bilgilerle açar
  const an = await register('pa');
  const setupA = await api('POST', '/api/rooms', { token: an.token, body: { setup: true, roomType: 'audio', name: 'Duyurulu', tags: ['müzik'], seatCount: 15, announcement: 'Hoş geldiniz!' } });
  status(setupA, 201);
  assert.equal(setupA.body.room.announcement, 'Hoş geldiniz!');
  assert.equal(setupA.body.room.layout, 'grid');
  assert.equal(setupA.body.room.seatCount, 15);
  status(await api('POST', '/api/rooms', { token: an.token, body: { setup: true, roomType: 'audio', name: 'X', seatCount: 15 } }), 400, 'kısa ad');
  status(await api('POST', '/api/rooms', { token: an.token, body: { setup: true, roomType: 'audio', name: 'Yedi', seatCount: 7 } }), 400, 'desteklenmeyen düzen');
  ok(await api('POST', `/api/rooms/${setupA.body.room.id}/close`, { token: an.token }));
  const again = await api('POST', '/api/rooms', { token: an.token, body: { roomType: 'audio' } });
  status(again, 201);
  assert.equal(again.body.room.name, 'Duyurulu');
  assert.equal(again.body.room.announcement, 'Hoş geldiniz!');
  assert.deepEqual(again.body.room.tags, ['müzik']);
  // atılma yasağı kalıcı odaya bağlıdır: oda kapatılıp yeniden açılınca da sürer; kayıtlar da görünür
  const guest = await register('pg');
  ok(await api('POST', `/api/rooms/${again.body.room.id}/join`, { token: guest.token }));
  ok(await api('POST', `/api/rooms/${again.body.room.id}/members/${guest.id}/kick`, { token: an.token }));
  ok(await api('POST', `/api/rooms/${again.body.room.id}/close`, { token: an.token }));
  const third = await api('POST', '/api/rooms', { token: an.token, body: { roomType: 'audio' } });
  status(third, 201);
  assert.notEqual(third.body.room.id, again.body.room.id, 'yeni açılış yeni oda kimliği');
  status(await api('POST', `/api/rooms/${third.body.room.id}/join`, { token: guest.token }), 403, 'yasak yeni açılışta da sürer');
  const modv = (await api('GET', `/api/rooms/${third.body.room.id}/moderation`, { token: an.token })).body;
  assert.ok(modv.bans.some((x) => x.userId === guest.id) && modv.logs.some((x) => x.action === 'kick' && x.targetId === guest.id));
  ok(await api('DELETE', `/api/rooms/${third.body.room.id}/blocks/${guest.id}`, { token: an.token }));
  ok(await api('POST', `/api/rooms/${third.body.room.id}/join`, { token: guest.token }), 'yasak kalkınca yeni açılışa girer');
});

test('liderlik tablosu, cüzdan geçmişi ve hesap silme', { skip, timeout: 60000 }, async () => {
  const lb = await api('GET', '/api/leaderboards?type=senders&period=weekly', { token: U.b.token });
  ok(lb);
  assert.ok(lb.body.entries.some((e) => e.user.id === U.a.id), 'A en çok gönderenler arasında');
  const rc = await api('GET', '/api/leaderboards?type=receivers&period=all', { token: U.b.token });
  ok(rc);
  ok(await api('GET', '/api/leaderboards?type=families&period=daily', { token: U.b.token }));
  status(await api('GET', '/api/leaderboards?type=zzz', { token: U.b.token }), 400);
  const w = await api('GET', '/api/me/wallet', { token: U.a.token });
  ok(w);
  assert.ok(w.body.transactions.length > 5);
  status(await api('DELETE', '/api/me', { token: U.x.token, body: { password: 'yanlis' } }), 403);
  const y = await register('y');
  ok(await api('DELETE', '/api/me', { token: y.token, body: { password: 'sifre123' } }));
  status(await api('GET', '/api/me', { token: y.token }), 401, 'silinen hesabın tokeni geçersiz');
  status(await api('POST', '/api/auth/login', { body: { username: y.username, password: 'sifre123' } }), 401, 'eski kullanıcı adı artık yok');
});

test('tek oda kuralı: başka odaya giren önceki odadan çıkar, sahibi çıkan oda kapanır', { skip, timeout: 60000 }, async () => {
  const p = await register('one1'); const q = await register('one2'); const s = await register('one3');
  const ra = (await api('POST', '/api/rooms', { token: q.token, body: { name: 'Q Oda' } })).body.room.id;
  ok(await api('POST', `/api/rooms/${ra}/join`, { token: p.token, body: {} }));
  const own = await api('POST', '/api/rooms', { token: p.token, body: { name: 'P Oda' } });
  status(own, 201);
  const rb = own.body.room.id;
  let m = await sql(`SELECT room_id FROM room_members WHERE user_id = $1`, [p.id]);
  assert.deepEqual(m.rows.map((x) => x.room_id), [rb], 'kendi odasını açınca önceki odadan çıkar');
  const rc = (await api('POST', '/api/rooms', { token: s.token, body: { name: 'S Oda' } })).body.room.id;
  ok(await api('POST', `/api/rooms/${rc}/join`, { token: p.token, body: {} }));
  m = await sql(`SELECT room_id FROM room_members WHERE user_id = $1`, [p.id]);
  assert.deepEqual(m.rows.map((x) => x.room_id), [rc], 'başka odaya girince kendi odasından çıkar');
  status(await api('GET', `/api/rooms/${rb}`, { token: q.token }), 404, 'sahibi çıkan (yardımcısız) oda kapanır');
  status(await api('POST', `/api/rooms/${ra}/join`, { token: p.token, body: { rejoin: true } }), 409, 'kendiliğinden yeniden bağlanma geri çekmez');
  status(await api('POST', `/api/rooms/${ra}/heartbeat`, { token: p.token }), 409, 'eski odanın sinyali: başka odaya geçti');
  ok(await api('POST', `/api/rooms/${rc}/heartbeat`, { token: p.token }));
  await sql(`UPDATE room_members SET joined_at = NOW() - INTERVAL '5 minutes', last_seen_at = NOW() - INTERVAL '5 minutes' WHERE user_id = $1`, [p.id]);
  const st = await api('POST', '/api/rooms/leave-stale', { token: p.token });
  ok(st);
  assert.equal(st.body.left, 1, 'uygulama açılışında asılı kalan üyelik temizlenir');
  for (const [t, id] of [[q, ra], [s, rc]]) await api('POST', `/api/rooms/${id}/close`, { token: t.token });
});

test('oda sahibi çıkınca oda kapanır', { skip, timeout: 60000 }, async () => {
  ok(await api('POST', `/api/rooms/${roomId}/leave`, { token: U.a.token }));
  const r = await api('GET', `/api/rooms/${roomId}`, { token: U.b.token });
  status(r, 404, 'kapanan oda bulunamaz');
  const left = await sql(`SELECT COUNT(*)::int AS n FROM room_members WHERE room_id = $1`, [roomId]);
  assert.equal(left.rows[0].n, 0);
  const sess = await sql(`SELECT COUNT(*)::int AS n FROM broadcast_sessions WHERE ended_at IS NULL AND room_id = $1`, [roomId]);
  assert.equal(sess.rows[0].n, 0);
  const ms = await sql(`SELECT COUNT(*)::int AS n FROM room_music WHERE room_id = $1`, [roomId]);
  assert.equal(ms.rows[0].n, 0, 'oda kapanınca müzik durumu temizlenir');
});

test('kimlik: kullanıcı ID, oda numarası, elmas bozdurma 5/1', { skip, timeout: 60000 }, async () => {
  const me = await api('GET', '/api/me', { token: U.a.token });
  ok(me, 'me');
  assert.match(String(me.body.user?.publicId ?? me.body.publicId), /^\d{8}$/);
  const rm = await api('POST', '/api/rooms', { token: U.a.token, body: { name: 'Kimlik Oda', seatCount: 8 } });
  assert.match(String(rm.body.room.roomNumber), /^\d{7}$/);
  const ex = await register(`ex${Date.now() % 100000}`);
  await sql('UPDATE users SET diamonds = 23 WHERE id=$1', [ex.id]);
  status(await api('POST', '/api/me/diamonds/exchange', { token: ex.token, body: { diamonds: 7 } }), 400, '5 katı değil');
  status(await api('POST', '/api/me/diamonds/exchange', { token: ex.token, body: { diamonds: 25 } }), 409, 'yetersiz');
  const r = await api('POST', '/api/me/diamonds/exchange', { token: ex.token, body: { diamonds: 20 } });
  ok(r, 'bozdur');
  assert.equal(await diamonds(ex), 3n);
  assert.equal(r.body.exchangedCoins, '4');
  const c0 = await coins(ex);
  assert.ok(c0 >= 4n);
});

test('şanslı çanta ve günlük görev', { skip, timeout: 60000 }, async () => {
  const s = await register(`bs${Date.now() % 100000}`);
  const c1 = await register(`bc${Date.now() % 100000}`);
  const rm = await api('POST', '/api/rooms', { token: s.token, body: { name: 'Çanta Odası', seatCount: 8, roomType: 'audio' } });
  ok(rm, 'oda');
  const room = rm.body.room.id;
  ok(await api('POST', `/api/rooms/${room}/join`, { token: c1.token, body: {} }), 'katıl');
  await sql('UPDATE users SET coins = 100000 WHERE id=$1', [s.id]);
  // normal çanta: 3000 coin, 10 kişilik
  const bag = await api('POST', `/api/rooms/${room}/lucky-bags`, { token: s.token, body: { tier: 'n3' } });
  ok(bag, 'çanta');
  assert.equal(await coins(s), 97000n);
  ok(await api('POST', `/api/lucky-bags/${bag.body.bag.id}/claim`, { token: s.token }), 'gönderen de kendi çantasından alabilir');
  status(await api('POST', `/api/lucky-bags/${bag.body.bag.id}/claim`, { token: s.token }), 409, 'gönderen ikinci kez alamaz');
  const cl = await api('POST', `/api/lucky-bags/${bag.body.bag.id}/claim`, { token: c1.token });
  ok(cl, 'aç');
  assert.ok(BigInt(cl.body.amount) > 0n);
  status(await api('POST', `/api/lucky-bags/${bag.body.bag.id}/claim`, { token: c1.token }), 409, 'ikinci kez');
  // süre dolunca kalan iade edilir
  await sql(`UPDATE lucky_bags SET expires_at = NOW() - INTERVAL '1 second' WHERE id=$1`, [bag.body.bag.id]);
  for (let i = 0; i < 30 && (await coins(s)) + BigInt(cl.body.amount) !== 100000n; i += 1) await new Promise((r) => setTimeout(r, 1000)); // sunucu zamanlayıcısı (10 sn) iade eder
  assert.equal((await coins(s)) + BigInt(cl.body.amount), 100000n);
  // süper çanta: not yazmadan açılamaz
  await sql('UPDATE users SET coins = 100000 WHERE id=$1', [s.id]);
  const sb = await api('POST', `/api/rooms/${room}/lucky-bags`, { token: s.token, body: { tier: 's30', note: 'merhaba herkese' } });
  ok(sb, 'süper');
  status(await api('POST', `/api/lucky-bags/${sb.body.bag.id}/claim`, { token: c1.token }), 425, 'geri sayım bitmeden açılmaz');
  await sql(`UPDATE lucky_bags SET opens_at = NOW() - INTERVAL '1 second' WHERE id=$1`, [sb.body.bag.id]);
  status(await api('POST', `/api/lucky-bags/${sb.body.bag.id}/claim`, { token: c1.token }), 403, 'not yok');
  ok(await api('POST', `/api/rooms/${room}/messages`, { token: c1.token, body: { text: 'merhaba herkese' } }), 'not');
  ok(await api('POST', `/api/lucky-bags/${sb.body.bag.id}/claim`, { token: c1.token }), 'süper aç');
  // günlük görev: sohbet + odaya giriş ilerlemesi
  const d = await api('GET', '/api/me/daily', { token: c1.token });
  ok(d, 'görev');
  assert.ok(d.body.tasks.find((t) => t.key === 'join_room').done);
  assert.equal(d.body.tasks.length, 4);
  // günlük giriş: ilk gün 1. günün ödülü, aynı gün ikinci kez alınamaz; görev serisi artık Coin vermez
  const ci0 = await api('GET', '/api/checkin', { token: c1.token });
  ok(ci0, 'günlük giriş durumu');
  assert.equal(ci0.body.days.length, 7);
  assert.equal(ci0.body.signedToday, false);
  const before = await coins(c1);
  const ci = await api('POST', '/api/checkin', { token: c1.token });
  ok(ci, 'günlük giriş');
  assert.equal(ci.body.streak, 1);
  assert.equal((await coins(c1)) - before, BigInt(ci0.body.days[0].coins));
  assert.equal(ci.body.state.signedToday, true);
  status(await api('POST', '/api/checkin', { token: c1.token }), 409, 'aynı gün ikinci giriş');
  // kayıt ekranı: yeni hesap setupDone=false; kayıt bitince true, ülke kodu kaydedilir
  const meNew = await api('GET', '/api/me', { token: c1.token });
  assert.equal(meNew.body.user.setupDone, false);
  ok(await api('PATCH', '/api/me', { token: c1.token, body: { countryCode: 'TR', country: 'Türkiye', setupDone: true } }), 'kurulum');
  const meDone = await api('GET', '/api/me', { token: c1.token });
  assert.equal(meDone.body.user.setupDone, true);
  assert.equal(meDone.body.user.countryCode, 'TR');
  assert.equal(meDone.body.user.region, 'uz', 'Türkiye → Uzbekistan sekmesi');
  ok(await api('PATCH', '/api/me', { token: c1.token, body: { region: 'eu' } }), 'bölge değiştir');
  status(await api('PATCH', '/api/me', { token: c1.token, body: { region: 'tr' } }), 400, 'geçersiz bölge');
  ok(await api('GET', '/api/rooms?region=eu', { token: c1.token }), 'bölge listesi');
  // oda kartı: duyuru, katkı listesi, yönetici silme
  const up = await api('PATCH', `/api/rooms/${room}`, { token: s.token, body: { announcement: 'Hoş geldiniz' } });
  ok(up, 'duyuru');
  assert.equal(up.body.room.announcement, 'Hoş geldiniz');
  const ct = await api('GET', `/api/rooms/${room}/contributions?range=total`, { token: c1.token });
  ok(ct, 'katkı');
  assert.ok(Array.isArray(ct.body.contributions));
  status(await api('DELETE', `/api/rooms/${room}/staff/${c1.id}`, { token: c1.token }), 403, 'yalnız sahip yönetici siler');
  ok(await api('DELETE', `/api/rooms/${room}/staff/${c1.id}`, { token: s.token }), 'yönetici sil');
});

// ---------------------------------------------------------------- v2.36
test('cihaz oturumu: giriş, token yenileme (rotasyon), çalıntı tespiti, uzaktan çıkış, eski token yükseltme', { skip, timeout: 60000 }, async () => {
  const name = `e2e_${tag}_ss`;
  const reg = await api('POST', '/api/auth/register', { body: { username: name, password: 'sifre123', displayName: 'Oturum' } });
  ok(reg, 'kayıt (cihaz bilgisi yok → eski tip token)');
  assert.equal(reg.body.refreshToken, undefined);
  const uid = reg.body.user.id;
  const dev = (id) => ({ id, name: 'Test Telefon', platform: 'android', appVersion: '2.36.0' });
  const login = (id) => api('POST', '/api/auth/login', { body: { username: name, password: 'sifre123', device: dev(id) } });

  const l1 = await login('device_one_123');
  ok(l1, 'cihazlı giriş');
  assert.ok(l1.body.refreshToken && l1.body.expiresIn === 3600);
  ok(await api('GET', '/api/me', { token: l1.body.token }));
  const r1 = await api('POST', '/api/auth/refresh', { body: { refreshToken: l1.body.refreshToken } });
  ok(r1, 'yenileme');
  assert.notEqual(r1.body.refreshToken, l1.body.refreshToken, 'yenileme token\'ı her seferinde değişir');
  ok(await api('GET', '/api/me', { token: r1.body.token }));
  // Yanıtı ağda kaybolan istek: kabul süresi içinde eski token tekrar gelirse çalışır.
  const r2 = await api('POST', '/api/auth/refresh', { body: { refreshToken: l1.body.refreshToken } });
  ok(r2, 'ağ kopması toleransı');
  // Kabul süresi geçtikten sonra eski token = çalıntı → oturum kapanır.
  await sql(`UPDATE user_sessions SET rotated_at = NOW() - INTERVAL '20 minutes' WHERE user_id = $1`, [uid]);
  status(await api('POST', '/api/auth/refresh', { body: { refreshToken: r1.body.refreshToken } }), 401, 'eski token tekrar kullanıldı');
  status(await api('POST', '/api/auth/refresh', { body: { refreshToken: r2.body.refreshToken } }), 401, 'oturum kapandı');
  status(await api('GET', '/api/me', { token: r2.body.token }), 401, 'kapalı oturumun erişim token\'ı da geçersiz');
  status(await api('POST', '/api/auth/refresh', { body: { refreshToken: 'rt_bozuk' } }), 401, 'bozuk token');

  // Oturum listesi ve uzaktan çıkış
  const a = await login('device_aaa_111');
  const b = await login('device_bbb_222');
  const list = await api('GET', '/api/me/sessions', { token: a.body.token });
  ok(list);
  assert.equal(list.body.sessions.length, 2);
  assert.equal(list.body.sessions.filter((s) => s.current).length, 1);
  const other = list.body.sessions.find((s) => !s.current);
  status(await api('DELETE', `/api/me/sessions/${other.id}`, { token: U.a.token }), 404, 'başkasının oturumu kapatılamaz');
  ok(await api('DELETE', `/api/me/sessions/${other.id}`, { token: a.body.token }), 'uzaktan çıkış');
  status(await api('GET', '/api/me', { token: b.body.token }), 401, 'çıkış yapılan cihaz');
  status(await api('POST', '/api/auth/refresh', { body: { refreshToken: b.body.refreshToken } }), 401);
  // Aynı cihazdan yeniden giriş eski oturumun yerini alır.
  const a2 = await login('device_aaa_111');
  status(await api('GET', '/api/me', { token: a.body.token }), 401, 'aynı cihazın eski oturumu');
  // Diğer tüm cihazlardan çıkış: bu cihaz yeni token alır.
  const c = await login('device_ccc_333');
  const ro = await api('POST', '/api/me/sessions/revoke-others', { token: a2.body.token });
  ok(ro, 'diğerlerinden çıkış');
  assert.ok(ro.body.token);
  status(await api('GET', '/api/me', { token: c.body.token }), 401);
  status(await api('GET', '/api/me', { token: reg.body.token }), 401, 'eski tip 30 günlük token da geçersiz');
  ok(await api('GET', '/api/me', { token: ro.body.token }), 'bu cihazın yeni token\'ı');
  ok(await api('POST', '/api/auth/refresh', { body: { refreshToken: a2.body.refreshToken } }), 'bu cihazın yenileme token\'ı sürüyor');

  // Eski tip token → cihaz oturumuna geçiş, çıkış
  const legacy = await api('POST', '/api/auth/login', { body: { username: name, password: 'sifre123' } });
  ok(legacy);
  const up = await api('POST', '/api/auth/session', { token: legacy.body.token, body: { device: dev('device_ddd_444') } });
  ok(up, 'yükseltme');
  ok(await api('GET', '/api/me', { token: up.body.token }));
  status(await api('POST', '/api/auth/session', { token: up.body.token, body: {} }), 409, 'zaten oturum var');
  ok(await api('POST', '/api/auth/logout', { body: { refreshToken: up.body.refreshToken } }), 'çıkış');
  status(await api('GET', '/api/me', { token: up.body.token }), 401, 'çıkıştan sonra');
});

test('otomatik moderasyon: link/telefon engeli, tekrarında süreli kısıt, yönetici kaldırır', { skip, timeout: 60000 }, async () => {
  const m = await register('mod1');
  const own = await register('mod2');
  const created = await api('POST', '/api/rooms', { token: own.token, body: { name: 'Moderasyon Odası' } });
  status(created, 201);
  const room = created.body.room.id;
  ok(await api('POST', `/api/rooms/${room}/join`, { token: m.token, body: {} }));
  const say = (text) => api('POST', `/api/rooms/${room}/messages`, { token: m.token, body: { text } });
  ok(await say('merhaba arkadaşlar'), 'normal mesaj');
  ok(await say('saat 10.30 da buluşalım, tamam.biz de geliyoruz'), 'link olmayan noktalı cümle');
  status(await say('www.site.com gelin'), 422, 'link');
  status(await say('numaram 0532 123 45 67'), 422, 'telefon');
  const third = await say('insta: @hesabim123');
  status(third, 422, 'yönlendirme');
  assert.match(third.body.message, /dakika/, 'üçüncü ihlalde süreli kısıt');
  status(await say('merhaba'), 403, 'kısıt sürerken temiz mesaj da gitmez');
  const me = await api('GET', '/api/me', { token: m.token });
  assert.ok(me.body.user.chatRestrictedUntil, 'kısıt profilde görünür');
  const strikes = await api('GET', '/api/admin/moderation/strikes', { token: U.d.token });
  ok(strikes);
  assert.ok(strikes.body.strikes.filter((s) => s.user.id === m.id).length >= 4, 'ihlaller + otomatik kısıt kaydı');
  status(await api('POST', `/api/admin/users/${m.id}/chat-restriction`, { token: U.a.token, body: { minutes: 0 } }), 403, 'normal kullanıcı');
  ok(await api('POST', `/api/admin/users/${m.id}/chat-restriction`, { token: U.d.token, body: { minutes: 0 } }), 'yönetici kaldırır');
  ok(await say('tekrar merhaba'), 'kısıt kalkınca');
  status(await api('PATCH', '/api/me', { token: m.token, body: { bio: 'beni ekleyin instagram.com/hesabim' } }), 422, 'biyografide link');
  status(await api('PATCH', '/api/me', { token: m.token, body: { avatarUrl: 'https://x.test/a.png' } }), 400, 'dış adresli fotoğraf');
});

test('çevrimiçi durumu: soket bağlıyken çevrimiçi, gizleyince görünmez', { skip, timeout: 60000 }, async () => {
  const { WebSocket } = await import('ws');
  const p1 = await register('pr1');
  const p2 = await register('pr2');
  // header: true → yeni uygulamalar gibi token'ı Authorization başlığında yollar (adres satırında görünmez);
  // header: false → eski uygulamalar gibi ?token= ile. İkisi de kabul edilir.
  const open = (token, header = false) => new Promise((resolve, reject) => {
    const ws = header
      ? new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { Authorization: `Bearer ${token}` } })
      : new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${encodeURIComponent(token)}`);
    const t = setTimeout(() => reject(new Error('soket bağlanmadı')), 10000);
    ws.on('message', (raw) => { if (JSON.parse(String(raw)).type === 'connected') { clearTimeout(t); resolve(ws); } });
    ws.on('error', reject);
  });
  // Token'sız bağlantı kabul edilmez (1008).
  await new Promise((resolve, reject) => {
    const bad = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    const t = setTimeout(() => reject(new Error('token\'sız soket kapatılmadı')), 10000);
    bad.on('close', (code) => { clearTimeout(t); try { assert.equal(code, 1008); resolve(); } catch (e) { reject(e); } });
    bad.on('error', () => {});
  });
  const next = (ws, type) => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${type} gelmedi`)), 10000);
    const on = (raw) => { const m = JSON.parse(String(raw)); if (m.type === type) { clearTimeout(t); ws.off('message', on); resolve(m); } };
    ws.on('message', on);
  });
  const w1 = await open(p1.token, true);
  const w2 = await open(p2.token);
  const prof = await api('GET', `/api/users/${p1.id}`, { token: p2.token });
  ok(prof);
  assert.equal(prof.body.profile.presence?.online, true, 'profilde çevrimiçi');
  const snap = next(w2, 'presence_state');
  w2.send(JSON.stringify({ type: 'presence_watch', userIds: [p1.id] }));
  const st = await snap;
  assert.ok(st.users.some((u) => u.userId === p1.id && u.online === true), 'izleme anlık görüntüsü');
  const hidden = next(w2, 'presence');
  // Çevrimiçi saati gizleme WIP 4 ayrıcalığı.
  assert.equal((await api('PATCH', '/api/me', { token: p1.token, body: { showPresence: false } })).status, 403, 'çevrimiçi gizleme WIP 4 ister');
  await giveWip(p1, 4);
  ok(await api('PATCH', '/api/me', { token: p1.token, body: { showPresence: false } }));
  const ev = await hidden;
  assert.equal(ev.userId, p1.id);
  assert.equal(ev.online, false, 'gizleyince izleyen çevrimdışı görür');
  assert.equal((await api('GET', `/api/users/${p1.id}`, { token: p2.token })).body.profile.presence, null);
  w1.close(); w2.close();
});

test('yönetim paneli: canlı durum, hata kayıtları, işlem kaydı, zorunlu güncelleme', { skip, timeout: 60000 }, async () => {
  const dash = await api('GET', '/api/admin/dashboard', { token: U.d.token });
  ok(dash, 'panel');
  assert.equal(dash.body.db.ok, true);
  assert.ok(dash.body.today.newUsers >= 1);
  assert.ok(typeof dash.body.realtime.sockets === 'number');
  status(await api('GET', '/api/admin/dashboard', { token: U.a.token }), 403, 'normal kullanıcı');
  ok(await api('POST', '/api/client-errors', {
    token: U.a.token,
    body: { appVersion: '2.36.0', device: 'Test', errors: [{ source: 'test', message: 'Örnek hata', stack: '#0 main', at: new Date().toISOString() }] },
  }), 'hata kaydı gönder');
  const errs = await api('GET', '/api/admin/client-errors', { token: U.d.token });
  ok(errs);
  assert.ok(errs.body.errors.some((e) => e.message === 'Örnek hata' && e.user?.id === U.a.id));
  const acts = await api('GET', '/api/admin/actions?scope=staff', { token: U.d.token });
  ok(acts);
  assert.ok(acts.body.actions.some((x) => x.action === 'chat_restriction'), 'işlem kaydında sohbet kısıtı');
  // Zorunlu güncelleme
  const hdr = { 'X-App-Version': '2.36.0' };
  status(await api('PUT', '/api/admin/app-config', { token: U.d.token, headers: hdr, body: { minAppVersion: '9.0.0' } }), 400, 'kendi sürümünden yüksek olamaz');
  status(await api('PUT', '/api/admin/app-config', { token: U.d.token, headers: hdr, body: { bilinmeyen: 1 } }), 400);
  ok(await api('PUT', '/api/admin/app-config', { token: U.d.token, headers: hdr, body: { minAppVersion: '2.36.0', updateUrl: 'https://example.com/app.apk' } }));
  const old = await api('GET', '/api/me', { token: U.a.token });
  status(old, 426, 'sürüm göndermeyen eski uygulama');
  assert.equal(old.body.code, 'update_required');
  ok(await api('GET', '/api/me', { token: U.a.token, headers: hdr }), 'güncel sürüm');
  const cfg = await api('GET', '/api/app/config');
  ok(cfg, 'sürüm bilgisi herkese açık');
  assert.equal(cfg.body.minAppVersion, '2.36.0');
  ok(await api('PUT', '/api/admin/app-config', { token: U.d.token, headers: hdr, body: { minAppVersion: '0.0.0' } }), 'kapat');
  ok(await api('GET', '/api/me', { token: U.a.token }), 'kapatınca eski sürümler de girer');

  // v2.100.0: doğrulama ayarları — varsayılan kapalı; SMTP şifresi panelde maskeli; telefonla kayıtta SMS zorunluluğu.
  assert.equal(cfg.body.phoneVerify, null, 'Firebase ayarlanmadan telefon doğrulaması kapalı');
  assert.equal(cfg.body.emailVerify, false);
  status(await api('POST', '/api/verify/email/send', { token: U.a.token, body: { email: 'a@ornek.com' } }), 503, 'SMTP yokken e-posta kodu gönderilmez');
  status(await api('PUT', '/api/admin/app-config', { token: U.d.token, body: { firebaseAppId: 'yanlis' } }), 400);
  ok(await api('PUT', '/api/admin/app-config', { token: U.d.token, body: {
    firebaseProjectId: 'trlive-e2e', firebaseApiKey: 'AIzaSyA1234567890abcdefghijklmnopqrstu', firebaseAppId: '1:123456789:android:abcdef123456',
    smtpHost: 'smtp.ornek.com', smtpPort: 465, smtpUser: 'u@ornek.com', smtpPass: 'gizli-sifre', smtpFrom: 'TR Live <no-reply@ornek.com>',
  } }));
  const panel = await api('GET', '/api/admin/app-config', { token: U.d.token });
  ok(panel);
  assert.notEqual(panel.body.config.smtpPass, 'gizli-sifre', 'SMTP şifresi panele açık gönderilmez');
  ok(await api('PUT', '/api/admin/app-config', { token: U.d.token, body: { smtpPass: panel.body.config.smtpPass, smtpPort: 587 } }), 'maskeli şifre geri gelince değişmez');
  const cfg2 = await api('GET', '/api/app/config');
  assert.equal(cfg2.body.phoneVerify?.projectId, 'trlive-e2e');
  assert.equal(cfg2.body.emailVerify, true);
  assert.equal(cfg2.body.smtpPass, undefined, 'SMTP bilgisi herkese açık ayarlarda yok');
  const noSms = await api('POST', '/api/auth/register-phone', { body: { phone: '05559998877', password: 'secret123', displayName: 'Kodsuz' } });
  status(noSms, 428, 'Firebase açıkken SMS doğrulaması zorunlu');
  status(await api('POST', '/api/auth/register-phone', { body: { phone: '05559998877', password: 'secret123', displayName: 'Sahte', idToken: 'x'.repeat(200) } }), 401, 'sahte doğrulama');
  status(await api('POST', '/api/verify/reset/phone', { body: { password: 'yenisifre1', idToken: 'x'.repeat(200) } }), 401);
  const rs = await api('POST', '/api/verify/reset/email/send', { body: { email: 'kimse@ornek.com' } });
  ok(rs, 'kayıtlı olmayan adres de aynı yanıtı alır');
  ok(await api('PUT', '/api/admin/app-config', { token: U.d.token, body: { firebaseProjectId: '', smtpHost: '' } }), 'doğrulamayı kapat');
  ok(await api('POST', '/api/auth/register-phone', { body: { phone: '05559998877', password: 'secret123', displayName: 'Kodsuz' } }), 'kapalıyken eskisi gibi');
});

// ---------------------------------------------------------------- v2.37
test('para işlemi tekrar koruması, hediye combo, coin geçmişi süzme', { skip, timeout: 60000 }, async () => {
  const s = await register('idem1');
  const r = await register('idem2');
  await sql('UPDATE users SET coins = 1000 WHERE id = $1', [s.id]);
  const created = await api('POST', '/api/rooms', { token: s.token, body: { name: 'Combo Odası' } });
  status(created, 201);
  const room = created.body.room.id;
  ok(await api('POST', `/api/rooms/${room}/join`, { token: r.token, body: {} }));
  const body = { giftId: rose.id, quantity: 1, distribution: 'single', recipientId: r.id };
  const send = (key, b = body) => api('POST', `/api/rooms/${room}/gifts/send`, { token: s.token, body: b, headers: key ? { 'Idempotency-Key': key } : {} });

  const k1 = `e2eIdem_${tag}_0001`;
  const first = await send(k1);
  ok(first, 'ilk gönderim');
  assert.equal(first.body.combo, 1);
  const again = await send(k1);
  ok(again, 'aynı anahtarla tekrar');
  assert.equal(again.body.balance, first.body.balance, 'ilk yanıt aynen döner');
  assert.equal(await coins(s), 990n, 'bir kez ödendi');
  status(await api('POST', '/api/me/diamonds/exchange', { token: s.token, body: { diamonds: '5' }, headers: { 'Idempotency-Key': k1 } }), 422, 'anahtar başka işlemde');
  status(await send('kisa'), 400, 'geçersiz anahtar');

  // Hatalı istek anahtarı tüketmez; düzeltilip aynı anahtarla gönderilebilir.
  const k2 = `e2eIdem_${tag}_0002`;
  status(await send(k2, { ...body, quantity: 0 }), 400);
  const second = await send(k2);
  ok(second, 'hata sonrası aynı anahtar');
  assert.equal(second.body.combo, 2, 'birkaç saniye içinde tekrar: combo 2');
  const third = await send(null);
  ok(third, 'anahtarsız (eski uygulama)');
  assert.equal(third.body.combo, 3);
  assert.equal(await coins(s), 970n);

  // Coin geçmişi: türe göre süzme ve geriye doğru sayfalama
  const p1 = await api('GET', '/api/me/wallet?group=gift&limit=2', { token: s.token });
  ok(p1);
  assert.equal(p1.body.transactions.length, 2);
  assert.ok(p1.body.transactions.every((t) => t.type === 'gift_sent'));
  assert.ok(p1.body.nextBefore, 'devamı var');
  const p2 = await api('GET', `/api/me/wallet?group=gift&limit=2&before=${encodeURIComponent(p1.body.nextBefore)}`, { token: s.token });
  ok(p2);
  assert.equal(p2.body.transactions.length, 1);
  assert.equal(p2.body.nextBefore, null);
  status(await api('GET', '/api/me/wallet?group=yok', { token: s.token }), 400);
  assert.equal((await api('GET', '/api/me/wallet?group=exchange', { token: s.token })).body.transactions.length, 0);
});

// ---------------------------------------------------------------- v2.38
test('WIP 10 + SWIP: kademeler, Vip hediye kilidi, hayalet mod', { skip, timeout: 60000 }, async () => {
  const owner = await register('swipO');
  const ghost = await register('swipG');
  const plain = await register('swipP');
  const tiers = (await api('GET', '/api/wip/tiers', { token: plain.token })).body.tiers;
  assert.equal(tiers.at(-1).level, 11);
  assert.equal(tiers.at(-1).features.ghostMode, true, 'yalnızca SWIP hayalet');
  assert.ok(tiers.filter((x) => x.level <= 10).every((x) => x.features.ghostMode !== true));

  const created = await api('POST', '/api/rooms', { token: owner.token, body: { name: 'Hayalet Odası' } });
  status(created, 201);
  const room = created.body.room.id;
  await sql('UPDATE users SET coins = 100000 WHERE id = ANY($1::uuid[])', [[owner.id, ghost.id, plain.id]]);
  ok(await api('POST', `/api/rooms/${room}/join`, { token: plain.token, body: {} }));

  // Vip sekmesi: WIP 3 ve üzeri
  const crown = (await api('GET', '/api/gifts', { token: plain.token })).body.gifts.find((g) => g.category === 'vip');
  if (crown) {
    const vipBody = { giftId: crown.id, quantity: 1, distribution: 'single', recipientId: owner.id };
    status(await api('POST', `/api/rooms/${room}/gifts/send`, { token: plain.token, body: vipBody }), 403, 'WIP yok → Vip hediye yok');
    await giveWip(plain, 3);
    ok(await api('POST', `/api/rooms/${room}/gifts/send`, { token: plain.token, body: vipBody }), 'WIP 3 Vip hediye');
  }

  // Hayalet mod yalnızca SWIP
  status(await api('PATCH', '/api/me', { token: ghost.token, body: { ghostMode: true } }), 403, 'SWIP değil');
  await giveWip(ghost, 10);
  status(await api('PATCH', '/api/me', { token: ghost.token, body: { ghostMode: true } }), 403, 'WIP 10 da hayalet olamaz');
  await giveWip(ghost, 11);
  ok(await api('PATCH', '/api/me', { token: ghost.token, body: { ghostMode: true } }), 'SWIP hayalet açar');
  assert.equal((await api('GET', '/api/me', { token: ghost.token })).body.user.ghostMode, true);

  ok(await api('POST', `/api/rooms/${room}/join`, { token: ghost.token, body: {} }));
  const seen = (u) => api('GET', `/api/rooms/${room}/members`, { token: u.token }).then((r) => r.body.members.map((m) => m.userId));
  assert.ok(!(await seen(owner)).includes(ghost.id), 'hayalet üye listesinde görünmez');
  assert.ok((await seen(ghost)).includes(ghost.id), 'kendisi görür');
  const listed = (await api('GET', '/api/rooms', { token: owner.token })).body.rooms?.find((r) => r.id === room);
  if (listed) assert.equal(listed.memberCount, 2, 'hayalet sayılmaz');
  // Toplu hediyede hayalet dinleyici alıcı olmaz
  const bulk = await api('POST', `/api/rooms/${room}/gifts/send`, { token: owner.token, body: { giftId: rose.id, quantity: 1, distribution: 'all_room' } });
  ok(bulk, 'all_room');
  assert.ok(!bulk.body.transactions.some((t) => t.receiverId === ghost.id));
  // Mikrofona çıkınca görünür
  ok(await api('POST', `/api/rooms/${room}/mic/take`, { token: ghost.token, body: {} }));
  assert.ok((await seen(owner)).includes(ghost.id), 'mikrofondaki hayalet görünür');
  // Üyelik bitince hayalet mod kendiliğinden etkisiz
  ok(await api('POST', `/api/rooms/${room}/mic/leave`, { token: ghost.token, body: {} }));
  await sql('UPDATE user_wip SET expires_at = NOW() - INTERVAL \'1 second\' WHERE user_id = $1', [ghost.id]);
  assert.ok((await seen(owner)).includes(ghost.id), 'SWIP bitince görünür');
});

test('şanslı hediye: alıcı payı, kazanç, ayar sınırları', { skip, timeout: 60000 }, async () => {
  const s = await register('luckS');
  const r = await register('luckR');
  const created = await api('POST', '/api/rooms', { token: s.token, body: { name: 'Çan Odası' } });
  status(created, 201);
  const room = created.body.room.id;
  ok(await api('POST', `/api/rooms/${room}/join`, { token: r.token, body: {} }));
  await sql('UPDATE users SET coins = 100000, diamonds = 0 WHERE id = ANY($1::uuid[])', [[s.id, r.id]]);
  const bell = (await api('GET', '/api/gifts', { token: s.token })).body.gifts.find((g) => g.category === 'lucky' && g.name === 'Şanslı Çan');
  assert.ok(bell, 'tohum şanslı hediye');
  const price = BigInt(bell.coinPrice);
  const send = (quantity) => api('POST', `/api/rooms/${room}/gifts/send`, { token: s.token, body: { giftId: bell.id, quantity, distribution: 'single', recipientId: r.id } });

  // Ayar sınırı: RTP + alıcı payı ≤ %95
  status(await api('PUT', '/api/admin/app-config', { token: U.d.token, body: { luckyRtpBps: 9000 } }), 400, 'toplam %100');
  // RTP 0 → kazanç yok; matematik kesin
  ok(await api('PUT', '/api/admin/app-config', { token: U.d.token, body: { luckyRtpBps: 0, luckyReceiverBps: 1000 } }));
  const a = await send(10);
  ok(a, 'şanslı gönderim');
  assert.equal(a.body.lucky.win, '0');
  assert.equal(await coins(s), 100000n - price * 10n);
  const rd = (await sql('SELECT diamonds FROM users WHERE id=$1', [r.id])).rows[0].diamonds;
  assert.equal(BigInt(rd), (price * 10n * 1000n) / 10000n, 'alıcıya %10 Elmas');
  const gt = (await sql('SELECT coin_amount, diamond_amount FROM gift_transactions WHERE id = $1', [a.body.transactions[0].id])).rows[0];
  assert.equal(BigInt(gt.coin_amount), price * 10n);
  assert.equal(BigInt(gt.diamond_amount), (price * 10n) / 10n);
  // Yoho / Bigo kuralı: şanslı hediye puan ve seviyede de değeri (alıcı payı) kadar sayılır.
  const st = (await sql('SELECT total_sent_coins FROM users WHERE id=$1', [s.id])).rows[0].total_sent_coins;
  assert.equal(BigInt(st), (price * 10n * 1000n) / 10000n, 'servet seviyesi alıcı payıyla');
  const seat = (await sql('SELECT total_coins FROM room_gift_totals WHERE room_id=$1 AND user_id=$2', [room, r.id])).rows[0];
  assert.equal(BigInt(seat.total_coins), (price * 10n * 1000n) / 10000n, 'koltuk puanı alıcı payıyla');

  // Yüksek RTP'de çok adet → kazanç bakiyeye eklenir ve geçmişte görünür
  ok(await api('PUT', '/api/admin/app-config', { token: U.d.token, body: { luckyRtpBps: 9000, luckyReceiverBps: 500 } }));
  const before = await coins(s);
  const b = await send(2000);
  ok(b);
  const win = BigInt(b.body.lucky.win);
  assert.ok(win > 0n, '2000 çekilişte kazanç çıkmalı');
  assert.equal(b.body.lucky.units, 2000);
  assert.ok(b.body.lucky.wins > 300, 'küçük kazançlar sık çıkar');
  // Havuz: giren = ödenen + kalan; kullanıcıya büyük ödül havuzu durumu döner.
  const pool = (await sql('SELECT base_balance, jackpot_balance, total_in, total_out, seeded FROM lucky_pools WHERE gift_id = $1', [bell.id])).rows[0];
  assert.ok(pool, 'havuz satırı');
  assert.equal(BigInt(pool.total_in) + BigInt(pool.seeded), BigInt(pool.total_out) + BigInt(pool.base_balance) + BigInt(pool.jackpot_balance));
  assert.ok(BigInt(pool.total_out) <= BigInt(pool.total_in), 'havuzdan girenden fazla ödenmez');
  assert.equal(b.body.lucky.pool.giftId, bell.id);
  const listed = (await api('GET', '/api/gifts', { token: s.token })).body.lucky;
  assert.ok(listed.pools.some((x) => x.giftId === bell.id && x.jackpot === b.body.lucky.pool.jackpot));
  // Yönetim havuza ekleyebilir; yalnızca süper yönetici.
  status(await api('POST', `/api/admin/lucky-pools/${bell.id}/seed`, { token: s.token, body: { pool: 'jackpot', coins: 1000 } }), 403);
  ok(await api('POST', `/api/admin/lucky-pools/${bell.id}/seed`, { token: U.d.token, body: { pool: 'jackpot', coins: 1000 } }));
  const pools = await api('GET', '/api/admin/lucky-pools', { token: U.d.token });
  ok(pools);
  const mine = pools.body.pools.find((x) => x.giftId === bell.id);
  assert.equal(mine.seeded, '1000');
  assert.equal(await coins(s), before - price * 2000n + win);
  assert.equal(BigInt(b.body.balance), before - price * 2000n + win);
  const hist = await api('GET', '/api/me/wallet?group=gift&limit=5', { token: s.token });
  assert.ok(hist.body.transactions.some((t) => t.type === 'lucky_gift_win' && BigInt(t.coinAmount) === win));

  // Kapatılınca gönderilemez
  ok(await api('PUT', '/api/admin/app-config', { token: U.d.token, body: { luckyEnabled: false } }));
  status(await send(1), 403, 'kapalı');
  ok(await api('PUT', '/api/admin/app-config', { token: U.d.token, body: { luckyEnabled: true, luckyRtpBps: 6000, luckyReceiverBps: 1000 } }));
});

test('sohbet temizleme: eski mesajlar geri gelmez, yeniler görünür', { skip, timeout: 30000 }, async () => {
  const o = await register('clrO');
  const v = await register('clrV');
  const created = await api('POST', '/api/rooms', { token: o.token, body: { name: 'Temizlik' } });
  status(created, 201);
  const room = created.body.room.id;
  ok(await api('POST', `/api/rooms/${room}/join`, { token: v.token, body: {} }));
  for (const t of ['bir', 'iki', 'üç']) status(await api('POST', `/api/rooms/${room}/messages`, { token: v.token, body: { text: t } }), 201);
  status(await api('DELETE', `/api/rooms/${room}/messages`, { token: v.token }), 403, 'yetkisiz temizleyemez');
  const c = await api('DELETE', `/api/rooms/${room}/messages`, { token: o.token });
  ok(c);
  assert.ok(c.body.clearedAt);
  for (const who of [o, v]) assert.equal((await api('GET', `/api/rooms/${room}/messages`, { token: who.token })).body.messages.length, 0);
  status(await api('POST', `/api/rooms/${room}/messages`, { token: v.token, body: { text: 'yeni' } }), 201);
  const after = (await api('GET', `/api/rooms/${room}/messages`, { token: o.token })).body.messages;
  assert.equal(after.length, 1);
});

test('ADMIN_USERNAMES: listedeki kullanıcı kayıtta yönetici olur, diğerleri olmaz', { skip, timeout: 30000 }, async () => {
  const boss = await api('POST', '/api/auth/register', { body: { username: `e2e_${tag}_boss`, password: 'sifre123' } });
  status(boss, 201);
  assert.equal(boss.body.user.systemRole, 'admin');
  ok(await api('GET', '/api/admin/app-config', { token: boss.body.token }), 'yönetici paneli açılır');
  const other = await register('notboss');
  status(await api('GET', '/api/admin/app-config', { token: other.token }), 403);
});

test('oda listesi: kart avatarları (gizli/hayalet hariç) ve "Yeni yayıncı" süzgeci', { skip, timeout: 30000 }, async () => {
  const o = await register('cardO');
  const v = await register('cardV');
  const created = await api('POST', '/api/rooms', { token: o.token, body: { name: 'Kart Odası' } });
  status(created, 201);
  const room = created.body.room.id;
  await sql(`UPDATE users SET avatar_url = '/media/00000000-0000-4000-8000-000000000001.png' WHERE id = ANY($1::uuid[])`, [[o.id, v.id]]);
  ok(await api('POST', `/api/rooms/${room}/join`, { token: v.token, body: {} }));
  const find = async (q = '') => (await api('GET', `/api/rooms?type=audio${q}`, { token: o.token })).body.rooms.find((r) => r.id === room);
  let r = await find();
  assert.ok(r, 'oda listede');
  assert.equal(r.avatars.length, 2, 'sahip + dinleyici');
  await sql('UPDATE users SET is_hidden = TRUE WHERE id = $1', [v.id]);
  r = await find();
  assert.equal(r.avatars.length, 1, 'gizli kullanıcının avatarı kartta yok');
  await sql('UPDATE users SET is_hidden = FALSE WHERE id = $1', [v.id]);
  assert.ok(await find('&fresh=1'), 'yeni hesabın odası "Yeni yayıncı"da');
  await sql(`UPDATE users SET created_at = NOW() - INTERVAL '90 days' WHERE id = $1`, [o.id]);
  assert.equal(await find('&fresh=1'), undefined, 'eski hesap "Yeni yayıncı"da değil');
  assert.ok(await find(), 'normal listede duruyor');
});

test('CP: mesaj/hediye puanı, kademe, ilişki isteği, tek CP, bitirme', { skip, timeout: 60000 }, async () => {
  const p = await register('cpP'); const q = await register('cpQ'); const r = await register('cpR');
  ok(await api('POST', `/api/friends/request/${q.id}`, { token: p.token }));
  ok(await api('POST', `/api/friends/accept/${p.id}`, { token: q.token }));
  status(await api('POST', `/api/messages/with/${q.id}`, { token: p.token, body: { text: 'merhaba' } }), 201);
  status(await api('POST', `/api/messages/with/${p.id}`, { token: q.token, body: { text: 'selam' } }), 201);
  await sleep(300); // mesaj puanı yanıttan sonra yazılır
  let st = (await api('GET', `/api/cp/with/${q.id}`, { token: p.token })).body;
  assert.equal(st.exp, '20', 'iki mesaj = 20 exp');
  assert.equal(st.level, 0);
  await sql(`UPDATE users SET coins = 0 WHERE id = $1`, [p.id]);
  status(await api('POST', `/api/cp/with/${q.id}/request`, { token: p.token, body: { kind: 'cp' } }), 400, 'Coin yoksa davet gönderilemez');
  await sql(`UPDATE users SET coins = 10000 WHERE id = ANY($1::uuid[])`, [[p.id, q.id, r.id]]);
  // Davet Coin alır; reddedilince iade edilir.
  ok(await api('POST', `/api/cp/with/${q.id}/request`, { token: p.token, body: { kind: 'kanka' } }));
  assert.equal((await sql(`SELECT coins FROM users WHERE id = $1`, [p.id])).rows[0].coins, '9000', 'kanka daveti 1000 Coin');
  ok(await api('POST', `/api/cp/with/${p.id}/decline`, { token: q.token }));
  assert.equal((await sql(`SELECT coins FROM users WHERE id = $1`, [p.id])).rows[0].coins, '10000', 'reddedilince iade');
  // Günlük sınır: 10 mesajdan sonrası puan getirmez
  await sql(`UPDATE cp_pairs SET msg_count = 10 WHERE user_a = LEAST($1::uuid, $2::uuid) AND user_b = GREATEST($1::uuid, $2::uuid)`, [p.id, q.id]);
  status(await api('POST', `/api/messages/with/${q.id}`, { token: p.token, body: { text: 'bir daha' } }), 201);
  await sleep(300);
  assert.equal((await api('GET', `/api/cp/with/${q.id}`, { token: p.token })).body.exp, '20', 'günlük 10 mesaj sınırı');
  await sql(`UPDATE cp_pairs SET exp = 1500000 WHERE user_a = LEAST($1::uuid, $2::uuid) AND user_b = GREATEST($1::uuid, $2::uuid)`, [p.id, q.id]);
  st = (await api('GET', `/api/cp/with/${p.id}`, { token: q.token })).body;
  assert.equal(st.level, 5); assert.equal(st.costs.cp, '2500');
  ok(await api('POST', `/api/cp/with/${q.id}/request`, { token: p.token, body: { kind: 'cp' } }));
  assert.equal((await sql(`SELECT coins FROM users WHERE id = $1`, [p.id])).rows[0].coins, '7500', 'CP daveti 2500 Coin');
  const inc = (await api('GET', '/api/cp/requests', { token: q.token })).body.requests;
  assert.equal(inc.length, 1); assert.equal(inc[0].kind, 'cp'); assert.equal(inc[0].user.id, p.id);
  assert.equal((await api('GET', '/api/me/badges', { token: q.token })).body.friends, 1, 'rozet CP isteğini sayar');
  st = (await api('POST', `/api/cp/with/${p.id}/accept`, { token: q.token })).body;
  assert.equal(st.relation, 'cp');
  const prof = (await api('GET', `/api/users/${p.id}`, { token: r.token })).body.profile;
  assert.equal(prof.cp.partner.id, q.id); assert.equal(prof.cp.level, 5);
  // Tek CP: başka biriyle CP olunamaz
  await sql(`INSERT INTO cp_pairs(user_a, user_b, exp) VALUES(LEAST($1::uuid, $2::uuid), GREATEST($1::uuid, $2::uuid), 300000)`, [p.id, r.id]);
  status(await api('POST', `/api/cp/with/${p.id}/request`, { token: r.token, body: { kind: 'cp' } }), 400, 'zaten CP var');
  ok(await api('POST', `/api/cp/with/${p.id}/request`, { token: r.token, body: { kind: 'friend' } }), 'arkadaş ilişkisi olur');
  ok(await api('POST', `/api/cp/with/${r.id}/accept`, { token: p.token }));
  assert.equal((await api('GET', `/api/cp/with/${p.id}`, { token: r.token })).body.relation, 'friend');
  // CP sıralaması (onaylı çiftler, exp)
  const lb = (await api('GET', '/api/leaderboards?type=cp', { token: p.token })).body.entries;
  assert.ok(lb.some((e) => [e.user.id, e.partner.id].includes(p.id) && e.level === 5), 'CP sıralaması');
  ok(await api('POST', `/api/cp/with/${q.id}/end`, { token: p.token }));
  const ids = (await sql(`SELECT cp_partner_id FROM users WHERE id = ANY($1::uuid[])`, [[p.id, q.id]])).rows;
  assert.ok(ids.every((x) => x.cp_partner_id === null), 'bitince CP bağı kalkar');
  assert.equal((await api('GET', `/api/cp/with/${q.id}`, { token: p.token })).body.exp, '1500000', 'puan korunur');
  // İlişki Duvarı
  const wall = (await api('GET', `/api/cp/wall/${p.id}`, { token: q.token })).body;
  assert.equal(wall.cp, null); assert.equal(wall.friend.count, 1); assert.equal(wall.friend.items[0].user.id, r.id);
  // Süresi dolan davet iade edilir
  ok(await api('POST', `/api/cp/with/${q.id}/request`, { token: r.token, body: { kind: 'friend' } }));
  await sql(`UPDATE cp_pairs SET request_at = NOW() - INTERVAL '25 hours' WHERE request_from = $1`, [r.id]);
  // Süresi dolan davet yerine yenisi gönderilince eskisinin Coin'i iade edilir.
  ok(await api('POST', `/api/cp/with/${q.id}/request`, { token: r.token, body: { kind: 'friend' } }));
  const refunds = (await sql(`SELECT COUNT(*)::int AS n FROM wallet_transactions WHERE user_id = $1 AND transaction_type = 'relation_refund'`, [r.id])).rows[0].n;
  assert.equal(refunds, 1, 'süresi dolan davet iade edildi');
});

test('koruyucu: Coin ile koruyucu olunur, profilde görünür, kapatılabilir', { skip, timeout: 60000 }, async () => {
  const o = await register('gown'); const g = await register('gguard');
  await sql(`UPDATE users SET coins = 5000 WHERE id = $1`, [g.id]);
  status(await api('POST', `/api/guardians/of/${o.id}/join`, { token: o.token }), 400, 'kendine koruyucu olunmaz');
  const j = (await api('POST', `/api/guardians/of/${o.id}/join`, { token: g.token })).body;
  assert.equal(j.coins, '2000', 'koruyucu kartı 3000 Coin');
  status(await api('POST', `/api/guardians/of/${o.id}/join`, { token: g.token }), 400, 'iki kez olunmaz');
  let d = (await api('GET', `/api/guardians/of/${o.id}`, { token: g.token })).body;
  assert.equal(d.guardians.length, 1); assert.equal(d.myPoints, '0');
  const prof = (await api('GET', `/api/users/${o.id}`, { token: g.token })).body.profile;
  assert.equal(prof.guardian.user.id, g.id, 'profilde koruyucu');
  await sql(`UPDATE guardians SET points = 800 WHERE owner_id = $1`, [o.id]);
  d = (await api('GET', `/api/guardians/of/${o.id}`, { token: g.token })).body;
  assert.equal(d.myPoints, '800'); assert.equal(d.top.user.id, g.id);
  // Kapatılınca kimse koruyucu olamaz
  ok(await api('PUT', '/api/guardians/settings', { token: o.token, body: { enabled: false } }));
  ok(await api('POST', `/api/guardians/of/${o.id}/leave`, { token: g.token }));
  status(await api('POST', `/api/guardians/of/${o.id}/join`, { token: g.token }), 400, 'kapalıyken olunmaz');
});

test('dolar cüzdanı: bakiye, admin\'e gönderim (öde / reddet / vazgeç), bayiye gönderim, yetkiler', { skip, timeout: 60000 }, async () => {
  const h = await register('usdhost');
  const d = await register('usddealer');
  const cents = async (u) => (await api('GET', '/api/usd/me', { token: u.token })).body.balanceCents;
  // Boş cüzdan ve ayarlar
  let me = await api('GET', '/api/usd/me', { token: h.token });
  ok(me);
  assert.equal(me.body.balanceCents, '0');
  assert.deepEqual(me.body.settings, { enabled: true, withdrawMinCents: '1000', dealerMinCents: '1000', coinsPerUsd: '4000', exchangeCoinsPerUsd: '4000', exchangeMinCents: '100' });
  status(await api('POST', '/api/usd/withdrawals', { token: h.token, body: { amountCents: 1000, method: 'IBAN', account: 'TR00 1111' } }), 409, 'bakiye yok');
  // Yönetim uçları yalnızca tam yetkili admin'e açıktır
  status(await api('GET', '/api/admin/usd', { token: h.token }), 403, 'kullanıcı yönetim ucuna giremez');
  status(await api('POST', '/api/admin/usd/adjust', { token: h.token, body: { userId: h.id, amountCents: 100000, note: 'x' } }), 403, 'kullanıcı kendine dolar yazamaz');
  const adj = await api('POST', '/api/admin/usd/adjust', { token: U.d.token, body: { userId: h.id, amountCents: 10000, note: 'e2e' } });
  ok(adj);
  assert.equal(adj.body.balanceCents, '10000');
  status(await api('POST', '/api/admin/usd/adjust', { token: U.d.token, body: { userId: h.id, amountCents: -99999, note: 'fazla' } }), 409, 'eksiye düşmez');
  // Admin'e gönderim
  status(await api('POST', '/api/usd/withdrawals', { token: h.token, body: { amountCents: 999, method: 'IBAN', account: 'TR00 1111' } }), 400, 'alt sınır 10 dolar');
  status(await api('POST', '/api/usd/withdrawals', { token: h.token, body: { amountCents: '10.5', method: 'IBAN', account: 'TR00 1111' } }), 400, 'kesirli sent yok');
  status(await api('POST', '/api/usd/withdrawals', { token: h.token, body: { amountCents: 20000, method: 'IBAN', account: 'TR00 1111' } }), 409, 'bakiyeden fazla');
  const key = `usd-${Date.now()}`;
  const w1 = await api('POST', '/api/usd/withdrawals', { token: h.token, headers: { 'Idempotency-Key': key }, body: { amountCents: 3000, method: 'IBAN', account: 'TR00 1111' } });
  status(w1, 201);
  assert.equal(w1.body.wallet.balanceCents, '7000');
  // Aynı anahtarla yinelenen istek ikinci kez düşmez
  await api('POST', '/api/usd/withdrawals', { token: h.token, headers: { 'Idempotency-Key': key }, body: { amountCents: 3000, method: 'IBAN', account: 'TR00 1111' } });
  assert.equal(await cents(h), '7000', 'yinelenen istek bakiyeyi ikinci kez düşürmez');
  const w2 = await api('POST', '/api/usd/withdrawals', { token: h.token, body: { amountCents: 2000, method: 'USDT', account: 'T-adres-1' } });
  status(w2, 201);
  const w3 = await api('POST', '/api/usd/withdrawals', { token: h.token, body: { amountCents: 1000, method: 'USDT', account: 'T-adres-1' } });
  status(w3, 201);
  assert.equal(await cents(h), '4000');
  const list = await api('GET', '/api/admin/usd?status=pending', { token: U.d.token });
  ok(list);
  assert.ok(list.body.withdrawals.some((x) => x.id === w1.body.withdrawal.id && x.account === 'TR00 1111' && x.username));
  assert.ok(BigInt(list.body.totals.pendingCents) >= 6000n);
  status(await api('POST', `/api/usd/withdrawals/${w3.body.withdrawal.id}/cancel`, { token: d.token }), 404, 'başkasının talebi');
  const c3 = await api('POST', `/api/usd/withdrawals/${w3.body.withdrawal.id}/cancel`, { token: h.token });
  ok(c3);
  assert.equal(c3.body.wallet.balanceCents, '5000', 'vazgeçince tutar döner');
  const paid = await api('POST', `/api/admin/usd/withdrawals/${w1.body.withdrawal.id}/pay`, { token: U.d.token, body: { note: 'Havale' } });
  ok(paid);
  assert.equal(paid.body.withdrawal.status, 'paid');
  assert.equal(await cents(h), '5000', 'ödenince bakiye değişmez');
  status(await api('POST', `/api/admin/usd/withdrawals/${w1.body.withdrawal.id}/reject`, { token: U.d.token, body: { note: 'geç' } }), 409, 'ödenmiş talep reddedilemez');
  status(await api('POST', `/api/admin/usd/withdrawals/${w2.body.withdrawal.id}/reject`, { token: U.d.token, body: {} }), 400, 'ret nedeni zorunlu');
  const rej = await api('POST', `/api/admin/usd/withdrawals/${w2.body.withdrawal.id}/reject`, { token: U.d.token, body: { note: 'Adres hatalı' } });
  ok(rej);
  assert.equal(await cents(h), '7000', 'reddedilince tutar döner');
  // Bayiye gönderim: anında, Coin bayinin stokuna
  const mk = await api('POST', '/api/admin/dealers', { token: U.d.token, body: { name: `E2E Bayi ${Date.now()}`, ownerUserId: d.id } });
  status(mk, 201);
  const dealerId = mk.body.dealer.id;
  const dl = await api('GET', '/api/usd/dealers', { token: h.token });
  ok(dl);
  assert.ok(dl.body.dealers.some((x) => x.id === dealerId));
  status(await api('POST', '/api/usd/dealer-transfers', { token: h.token, body: { dealerId, amountCents: 500 } }), 400, 'alt sınır 10 dolar');
  status(await api('POST', '/api/usd/dealer-transfers', { token: h.token, body: { dealerId, amountCents: 50000 } }), 409, 'bakiyeden fazla');
  status(await api('POST', '/api/usd/dealer-transfers', { token: h.token, body: { dealerId: h.id, amountCents: 1000 } }), 404, 'bayi yok');
  const tr = await api('POST', '/api/usd/dealer-transfers', { token: h.token, body: { dealerId, amountCents: 2500 } });
  status(tr, 201);
  assert.equal(tr.body.transfer.coins, '100000');
  assert.equal(tr.body.wallet.balanceCents, '4500');
  const dm = await api('GET', '/api/dealers/me', { token: d.token });
  ok(dm);
  assert.equal(dm.body.dealer.coinBalance, '100000');
  assert.ok(dm.body.transactions.some((x) => x.type === 'usd_transfer' && x.coinAmount === '100000'));
  // Defter bakiyeyle tutarlı
  const led = await sql(`SELECT COALESCE(SUM(amount_cents),0)::text AS s, (SELECT usd_cents::text FROM users WHERE id = $1) AS b FROM usd_transactions WHERE user_id = $1`, [h.id]);
  assert.equal(led.rows[0].s, '4500');
  assert.equal(led.rows[0].b, '4500');
  // Genel anahtar kapalıyken gönderim yapılamaz
  ok(await api('PUT', '/api/admin/app-config', { token: U.d.token, body: { usdEnabled: false } }));
  status(await api('POST', '/api/usd/withdrawals', { token: h.token, body: { amountCents: 1000, method: 'IBAN', account: 'TR00 1111' } }), 403, 'kapalı');
  status(await api('POST', '/api/usd/dealer-transfers', { token: h.token, body: { dealerId, amountCents: 1000 } }), 403, 'kapalı');
  ok(await api('PUT', '/api/admin/app-config', { token: U.d.token, body: { usdEnabled: true, usdDealerCoinsPerUsd: 4000, usdWithdrawMinCents: 1000, usdDealerMinCents: 1000 } }));
  status(await api('PUT', '/api/admin/app-config', { token: U.d.token, body: { usdDealerCoinsPerUsd: 0 } }), 400, 'kur 0 olamaz');
});

test('Fasulye: Coin\'e çevirme (kendine) ve başka kullanıcıya Coin gönderme', { skip, timeout: 60000 }, async () => {
  const h = await register('beanhost');
  const r = await register('beanfriend');
  const usd = async (u) => (await api('GET', '/api/usd/me', { token: u.token })).body.balanceCents;
  ok(await api('POST', '/api/admin/usd/adjust', { token: U.d.token, body: { userId: h.id, amountCents: 5000, note: 'e2e fasulye' } }));
  const c0 = await coins(h); const r0 = await coins(r);
  status(await api('POST', '/api/usd/coin-exchanges', { token: h.token, body: { amountCents: 50 } }), 400, 'alt sınır 1 Fasulye');
  status(await api('POST', '/api/usd/coin-exchanges', { token: h.token, body: { amountCents: 999999 } }), 409, 'bakiyeden fazla');
  status(await api('POST', '/api/usd/coin-exchanges', { token: r.token, body: { amountCents: 100 } }), 409, 'Fasulyesi olmayan çeviremez');
  status(await api('POST', '/api/usd/coin-exchanges', { token: h.token, body: { amountCents: 100, targetUserId: '00000000-0000-4000-8000-000000000000' } }), 404, 'alıcı yok');
  // Kendine çevirme (aynı anahtarla yinelenen istek ikinci kez düşmez)
  const key = `bean-${Date.now()}`;
  const self = await api('POST', '/api/usd/coin-exchanges', { token: h.token, headers: { 'Idempotency-Key': key }, body: { amountCents: 1250 } });
  status(self, 201);
  assert.equal(self.body.exchange.coins, '50000');
  assert.equal(self.body.exchange.self, true);
  assert.equal(self.body.wallet.balanceCents, '3750');
  await api('POST', '/api/usd/coin-exchanges', { token: h.token, headers: { 'Idempotency-Key': key }, body: { amountCents: 1250 } });
  assert.equal(await usd(h), '3750', 'yinelenen istek ikinci kez düşmez');
  assert.equal(await coins(h), c0 + 50000n);
  // Başka kullanıcıya Coin gönderme
  const send = await api('POST', '/api/usd/coin-exchanges', { token: h.token, body: { amountCents: 2000, targetUserId: r.id } });
  status(send, 201);
  assert.equal(send.body.exchange.self, false);
  assert.equal(send.body.exchange.coins, '80000');
  assert.equal(send.body.exchange.target.id, r.id);
  assert.equal(await usd(h), '1750');
  assert.equal(await coins(r), r0 + 80000n, 'Coin alıcıya yüklendi');
  assert.equal(await coins(h), c0 + 50000n, 'gönderenin Coin bakiyesi değişmez');
  assert.equal(await usd(r), '0', 'alıcıya Fasulye geçmez');
  // Alıcının Coin geçmişinde ve bildirimlerinde görünür
  const hist = await api('GET', '/api/me/wallet?group=exchange', { token: r.token });
  ok(hist);
  assert.ok(JSON.stringify(hist.body).includes('bean_received'));
  // Engelleyen kullanıcıya gönderilemez
  ok(await api('POST', `/api/blocks/${h.id}`, { token: r.token }));
  status(await api('POST', '/api/usd/coin-exchanges', { token: h.token, body: { amountCents: 100, targetUserId: r.id } }), 403, 'engelli');
  // Defter bakiyeyle tutarlı; her çevirme bir kayıt
  const led = await sql(`SELECT COALESCE(SUM(amount_cents),0)::text AS s, (SELECT usd_cents::text FROM users WHERE id = $1) AS b,
    (SELECT COUNT(*)::int FROM usd_coin_exchanges WHERE user_id = $1) AS n FROM usd_transactions WHERE user_id = $1`, [h.id]);
  assert.equal(led.rows[0].s, '1750');
  assert.equal(led.rows[0].b, '1750');
  assert.equal(led.rows[0].n, 2);
  // Kur ve alt sınır panelden ayarlanır
  ok(await api('PUT', '/api/admin/app-config', { token: U.d.token, body: { usdCoinsPerUsd: 8000, usdExchangeMinCents: 500 } }));
  status(await api('POST', '/api/usd/coin-exchanges', { token: h.token, body: { amountCents: 400 } }), 400, 'yeni alt sınır');
  const again = await api('POST', '/api/usd/coin-exchanges', { token: h.token, body: { amountCents: 500 } });
  status(again, 201);
  assert.equal(again.body.exchange.coins, '40000');
  status(await api('PUT', '/api/admin/app-config', { token: U.d.token, body: { usdCoinsPerUsd: 0 } }), 400, 'kur 0 olamaz');
  ok(await api('PUT', '/api/admin/app-config', { token: U.d.token, body: { usdCoinsPerUsd: 4000, usdExchangeMinCents: 100 } }));
});

test('sesli / görüntülü ayrı maaş: ayarlar, görüntülü tablo ve maaş tablosu ucu', { skip, timeout: 60000 }, async () => {
  const get = async () => (await api('GET', '/api/admin/agency-config', { token: U.d.token })).body.config;
  let cfg = await get();
  assert.equal(cfg.settings.splitByRoomType, true, 'varsayılan: ayrı hesap açık');
  assert.equal(cfg.settings.videoDailyCapMinutes, 0);
  assert.equal(cfg.settings.videoShortfallCutBps, 0);
  assert.ok(cfg.payLevels.length >= 1);
  assert.equal(cfg.videoPayLevels.length, cfg.payLevels.length, 'görüntülü tablo başlangıçta sesli tablonun kopyası');
  // Görüntülü kuralları
  ok(await api('PUT', '/api/admin/agency-config', { token: U.d.token, body: { settings: { videoDailyCapMinutes: 120, videoMinSessionMinutes: 30, videoShortfallCutBps: 5000 } } }));
  status(await api('PUT', '/api/admin/agency-config', { token: U.d.token, body: { settings: { videoDailyCapMinutes: 5000 } } }), 400, 'sınır dışı');
  status(await api('PUT', '/api/admin/agency-config', { token: U.d.token, body: { settings: { splitByRoomType: 'evet' } } }), 400, 'boolean değil');
  cfg = await get();
  assert.deepEqual([cfg.settings.videoDailyCapMinutes, cfg.settings.videoMinSessionMinutes, cfg.settings.videoShortfallCutBps], [120, 30, 5000]);
  // Görüntülü tablo ayrı kaydedilir; sesli tablo değişmez
  const audioBefore = JSON.stringify(cfg.payLevels);
  const video = cfg.videoPayLevels.map((l, i) => (i === 0 ? { ...l, salary1Cents: String(BigInt(l.salary1Cents) + 500n) } : l));
  const saved = await api('PUT', '/api/admin/pay-levels', { token: U.d.token, body: { levels: video, kind: 'video' } });
  ok(saved);
  assert.equal(saved.body.config.videoPayLevels[0].salary1Cents, String(BigInt(cfg.payLevels[0].salary1Cents) + 500n));
  assert.equal(JSON.stringify(saved.body.config.payLevels), audioBefore, 'sesli tablo değişmedi');
  status(await api('PUT', '/api/admin/pay-levels', { token: U.a.token, body: { levels: video, kind: 'video' } }), 403, 'kullanıcı tablo değiştiremez');
  // Uygulamanın maaş tablosu ucu iki tabloyu ve kuralları verir
  const pt = await api('GET', '/api/agency-center/pay-table', { token: U.a.token });
  ok(pt);
  assert.equal(pt.body.split, true);
  assert.equal(pt.body.videoLevels[0].salary1Cents, saved.body.config.videoPayLevels[0].salary1Cents);
  assert.deepEqual(pt.body.video, { dailyCapMinutes: 120, minSessionMinutes: 30, shortfallCutBps: 5000 });
  // Eski hâline döndür
  ok(await api('POST', '/api/admin/pay-levels/reset', { token: U.d.token, body: { kind: 'video' } }));
  ok(await api('PUT', '/api/admin/pay-levels', { token: U.d.token, body: { levels: cfg.payLevels, kind: 'video' } }));
  ok(await api('PUT', '/api/admin/agency-config', { token: U.d.token, body: { settings: { videoDailyCapMinutes: 0, videoMinSessionMinutes: 0, videoShortfallCutBps: 0 } } }));
  cfg = await get();
  assert.equal(JSON.stringify(cfg.payLevels), audioBefore);
});
