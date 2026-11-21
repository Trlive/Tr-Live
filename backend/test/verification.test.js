import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import net from 'node:net';
import fs from 'node:fs';
import { sendMail, buildMessage } from '../src/modules/notifications/mailer.service.js';
import { verifyPhoneToken, setCertFetcher } from '../src/modules/notifications/firebase_verify.service.js';

// ---------- Firebase telefon token'ı ----------
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const pub = publicKey.export({ type: 'spki', format: 'pem' });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function makeToken(over = {}, { kid = 'k1', key = privateKey } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'RS256', kid, typ: 'JWT' });
  const body = b64({
    iss: 'https://securetoken.google.com/trlive-test', aud: 'trlive-test', sub: 'uid123', iat: now, exp: now + 3600,
    auth_time: now, phone_number: '+905551112233', firebase: { sign_in_provider: 'phone' }, ...over,
  });
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${head}.${body}`), key).toString('base64url');
  return `${head}.${body}.${sig}`;
}

test('Firebase token: geçerli token telefon numarasını döndürür, ikinci kullanım reddedilir', async () => {
  setCertFetcher(async () => ({ keys: { k1: pub }, maxAge: 3600 }));
  const t = makeToken();
  assert.equal(await verifyPhoneToken(t, 'trlive-test'), '+905551112233');
  await assert.rejects(verifyPhoneToken(t, 'trlive-test'), (e) => e.status === 409);
});

test('Firebase token: yanlış proje, eski doğrulama, yanlış sağlayıcı, sahte imza reddedilir', async () => {
  setCertFetcher(async () => ({ keys: { k1: pub }, maxAge: 3600 }));
  const now = Math.floor(Date.now() / 1000);
  await assert.rejects(verifyPhoneToken(makeToken({ aud: 'baska' }), 'trlive-test'), (e) => e.status === 401);
  await assert.rejects(verifyPhoneToken(makeToken({ auth_time: now - 3600 }), 'trlive-test'), (e) => e.status === 401);
  await assert.rejects(verifyPhoneToken(makeToken({ exp: now - 600 }), 'trlive-test'), (e) => e.status === 401);
  await assert.rejects(verifyPhoneToken(makeToken({ firebase: { sign_in_provider: 'password' } }), 'trlive-test'), (e) => e.status === 401);
  await assert.rejects(verifyPhoneToken(makeToken({ phone_number: undefined }), 'trlive-test'), (e) => e.status === 401);
  const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  await assert.rejects(verifyPhoneToken(makeToken({}, { key: other }), 'trlive-test'), (e) => e.status === 401);
  await assert.rejects(verifyPhoneToken(makeToken({}, { kid: 'yok' }), 'trlive-test'), (e) => e.status === 401);
  await assert.rejects(verifyPhoneToken('kisa', 'trlive-test'), (e) => e.status === 401);
  await assert.rejects(verifyPhoneToken(makeToken(), ''), (e) => e.status === 503);
});

test('Firebase token: Google anahtarlarına ulaşılamazsa 503', async () => {
  setCertFetcher(async () => { throw new Error('ağ yok'); });
  await assert.rejects(verifyPhoneToken(makeToken(), 'trlive-test'), (e) => e.status === 503);
  setCertFetcher(null);
});

// ---------- SMTP ----------
function fakeSmtp() {
  const got = { cmds: [], data: '' };
  const server = net.createServer((s) => {
    let buf = '';
    let inData = false;
    s.write('220 test ESMTP\r\n');
    s.on('data', (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (inData) {
          if (line === '.') { inData = false; s.write('250 queued\r\n'); } else got.data += `${line}\n`;
          continue;
        }
        got.cmds.push(line);
        if (line.startsWith('EHLO')) s.write('250-test\r\n250-AUTH LOGIN PLAIN\r\n250 OK\r\n');
        else if (line.startsWith('AUTH PLAIN')) s.write('235 ok\r\n');
        else if (line.startsWith('MAIL FROM') || line.startsWith('RCPT TO')) s.write('250 ok\r\n');
        else if (line === 'DATA') { inData = true; s.write('354 go\r\n'); }
        else if (line === 'QUIT') { s.write('221 bye\r\n'); s.end(); }
        else s.write('500 ?\r\n');
      }
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, got })));
}

test('SMTP: kimlik doğrulama ve UTF-8 ileti gönderimi', async () => {
  const { server, port, got } = await fakeSmtp();
  try {
    await sendMail({ host: '127.0.0.1', port, secure: false, user: 'u@x.com', pass: 'p', from: 'TR Live <no-reply@trlive.app>' },
      { to: 'alici@ornek.com', subject: 'Doğrulama kodun', text: 'Kodun: 123456', html: '<b>123456</b>' }, { allowPlain: true, timeoutMs: 5000 });
  } finally {
    server.close();
  }
  assert.ok(got.cmds.some((c) => c.startsWith('AUTH PLAIN ')));
  assert.equal(Buffer.from(got.cmds.find((c) => c.startsWith('AUTH PLAIN')).slice(11), 'base64').toString(), '\u0000u@x.com\u0000p');
  assert.ok(got.cmds.includes('MAIL FROM:<no-reply@trlive.app>'));
  assert.ok(got.cmds.includes('RCPT TO:<alici@ornek.com>'));
  assert.match(got.data, /Subject: =\?UTF-8\?B\?/);
  assert.match(got.data, /multipart\/alternative/);
});

test('SMTP: STARTTLS olmayan sunucuya şifresiz gönderilmez', async () => {
  const { server, port } = await fakeSmtp();
  try {
    await assert.rejects(sendMail({ host: '127.0.0.1', port, secure: false, user: 'u', pass: 'p', from: 'a@b.co' }, { to: 'c@d.co', subject: 's', text: 't' }, { timeoutMs: 5000 }),
      /STARTTLS/);
  } finally {
    server.close();
  }
});

test('İleti: gövde base64, satırlar nokta ile başlamaz', () => {
  const m = buildMessage({ from: 'a@b.co', to: 'c@d.co', subject: 'Merhaba', text: '.\n.başında nokta' });
  for (const line of m.split('\r\n')) assert.ok(!line.startsWith('.'));
  assert.match(m, /Content-Transfer-Encoding: base64/);
});

test('Migration 068: e-posta kodu amaçları ve benzersiz e-posta', () => {
  const sql = fs.readFileSync(new URL('../src/migrations/068_verification.sql', import.meta.url), 'utf8');
  assert.match(sql, /purpose IN \('verify', 'reset'\)/);
  assert.match(sql, /uq_users_email ON users\(lower\(email\)\)/);
  assert.match(sql, /phone_verified_at/);
});
