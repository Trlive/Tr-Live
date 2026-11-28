import test from 'node:test';
import assert from 'node:assert/strict';
import { passwordRules, PASSWORD_MIN } from '../src/middleware/authentication/password_policy.js';

const rejects = (p, opts) => assert.throws(() => passwordRules(p, opts), (e) => e.status === 400);

test('şifre en az 8 karakter olmalı', () => {
  assert.equal(PASSWORD_MIN, 8);
  rejects('1234567');
  rejects('');
  rejects(undefined);
  rejects(12345678); // metin değil
  assert.doesNotThrow(() => passwordRules('sifre123'));
});

test('en yaygın şifreler ve tek karakterli şifreler reddedilir', () => {
  for (const p of ['12345678', 'password', 'Password123', 'QWERTY123', 'aaaaaaaa', '00000000']) rejects(p);
});

test('şifre kullanıcı adıyla aynı olamaz (büyük/küçük harf fark etmez)', () => {
  rejects('Kullanici1', { username: 'kullanici1' });
  assert.doesNotThrow(() => passwordRules('Kullanici1', { username: 'baskakisi' }));
});

test('72 bayttan uzun şifre reddedilir (bcrypt sınırı); çok baytlı karakterler bayt olarak sayılır', () => {
  rejects('a1'.repeat(37)); // 74 bayt
  rejects('ğ'.repeat(37)); // 37 karakter ama 74 bayt
  assert.doesNotThrow(() => passwordRules('ab1'.repeat(24))); // tam 72 bayt
});

test('karmaşıklık zorlaması yok: uzun, sıradan harfli şifre kabul edilir', () => {
  assert.doesNotThrow(() => passwordRules('kahvaltidasimitvarmi'));
});
