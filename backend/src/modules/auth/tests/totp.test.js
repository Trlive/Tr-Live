import test from 'node:test';
import assert from 'node:assert/strict';
import { codeFor, verifyCode, newSecret, base32Decode, newRecoveryCodes, hashRecovery, otpauthUri } from '../totp.service.js';

// TOTP elle yazıldı (otplib/speakeasy eklememek için). Yanlış bir uygulama iki yönden de
// felaket: ya hiçbir kodu kabul etmez (yönetici kendi panelinden kilitlenir), ya her kodu
// kabul eder (2FA hiç yokmuş gibi olur). Bu yüzden RFC 6238'in kendi test vektörleriyle
// doğrulanıyor.

// RFC 6238 Appendix B: secret "12345678901234567890" (ASCII) = base32 GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

test('base32 çözme: RFC örneğindeki gizli anahtar doğru çözülüyor', () => {
  assert.equal(base32Decode(RFC_SECRET).toString('ascii'), '12345678901234567890');
});

test('RFC 6238 test vektörleri (SHA-1, 8 hane → son 6 hanesi)', () => {
  // RFC tablosundaki değerler 8 hane; bizim kodumuz 6 hane üretiyor (yaygın kullanım),
  // yani beklenen değer her vektörün son 6 hanesi.
  const vectors = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ];
  for (const [t, expected8] of vectors) {
    const counter = Math.floor(t / 30);
    assert.equal(codeFor(RFC_SECRET, counter), expected8.slice(-6), `t=${t}`);
  }
});

test('doğrulama: geçerli kod kabul edilir', () => {
  const now = 1111111109 * 1000;
  const code = codeFor(RFC_SECRET, Math.floor(now / 1000 / 30));
  assert.equal(verifyCode(RFC_SECRET, code, { now }), true);
});

test('doğrulama: yanlış kod reddedilir', () => {
  const now = 1111111109 * 1000;
  assert.equal(verifyCode(RFC_SECRET, '000000', { now }), false);
});

test('pencere: bir önceki ve bir sonraki adım kabul edilir (saat kayması)', () => {
  const now = 1111111109 * 1000;
  const c = Math.floor(now / 1000 / 30);
  assert.equal(verifyCode(RFC_SECRET, codeFor(RFC_SECRET, c - 1), { now }), true);
  assert.equal(verifyCode(RFC_SECRET, codeFor(RFC_SECRET, c + 1), { now }), true);
});

test('pencere dar: iki adım öncesi reddedilir (çalınan kodun ömrü uzamasın)', () => {
  const now = 1111111109 * 1000;
  const c = Math.floor(now / 1000 / 30);
  assert.equal(verifyCode(RFC_SECRET, codeFor(RFC_SECRET, c - 2), { now }), false);
  assert.equal(verifyCode(RFC_SECRET, codeFor(RFC_SECRET, c + 2), { now }), false);
});

test('biçim denetimi: 6 hane olmayan girdi reddedilir', () => {
  const now = Date.now();
  for (const bad of ['', '12345', '1234567', 'abcdef', null, undefined, '12 34 56 78']) {
    assert.equal(verifyCode(RFC_SECRET, bad, { now }), false, `kabul edilmemeliydi: ${bad}`);
  }
});

test('boşluk ve tire yazılan kod da kabul edilir (kullanıcı "123 456" yazar)', () => {
  const now = 1111111109 * 1000;
  const code = codeFor(RFC_SECRET, Math.floor(now / 1000 / 30));
  assert.equal(verifyCode(RFC_SECRET, `${code.slice(0, 3)} ${code.slice(3)}`, { now }), true);
});

test('üretilen gizli anahtar 32 karakter base32', () => {
  const s = newSecret();
  assert.match(s, /^[A-Z2-7]{32}$/);
  assert.equal(base32Decode(s).length, 20);
});

test('iki gizli anahtar aynı olmuyor', () => {
  const set = new Set(Array.from({ length: 50 }, () => newSecret()));
  assert.equal(set.size, 50);
});

test('otpauth adresi doğru biçimde', () => {
  const u = otpauthUri('ABC234', { account: 'admin@tr.live' });
  assert.match(u, /^otpauth:\/\/totp\/TR%20Live:admin%40tr\.live\?secret=ABC234&issuer=TR%20Live&algorithm=SHA1&digits=6&period=30$/);
});

test('kurtarma kodları: okunabilir, benzersiz, karışabilen harf yok', () => {
  const codes = newRecoveryCodes(8);
  assert.equal(codes.length, 8);
  assert.equal(new Set(codes).size, 8);
  for (const c of codes) {
    assert.match(c, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/, c);
    // I, O, 0, 1 karışır: elle yazılan kodda hataya yol açar.
    assert.ok(!/[IO01]/.test(c), `karışabilen karakter: ${c}`);
  }
});

test('kurtarma kodu özeti: biçim farkları aynı özeti verir', () => {
  // Kullanıcı tireyi unutabilir ya da küçük harf yazabilir; aynı kod sayılmalı.
  const a = hashRecovery('ABCD-2345');
  assert.equal(hashRecovery('abcd2345'), a);
  assert.equal(hashRecovery(' ABCD 2345 '), a);
  assert.notEqual(hashRecovery('ABCD-2346'), a);
});

test('kurtarma kodu düz metin saklanamaz (özet geri çevrilemez)', () => {
  const h = hashRecovery('ABCD-2345');
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.ok(!h.includes('ABCD'));
});
