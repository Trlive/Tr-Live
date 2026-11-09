import test from 'node:test';
import assert from 'node:assert/strict';
import { passwordRules } from '../src/auth.js';
import { redactSecrets } from '../src/redact.js';
import { bootstrapDecision } from '../src/staff_logic.js';
import { weakSecret, limitSetting } from '../src/config.js';

test('şifre kuralları: yaygın / tek karakter / kullanıcı adıyla aynı şifre reddedilir', () => {
  for (const p of ['123456', '12345678', 'qwerty', 'Sifre123', 'şifre123', 'ŞİFRE123', 'PASSWORD', 'BESIKTAS', '111111', 'aaaaaaaa', 'galatasaray']) {
    assert.throws(() => passwordRules(p), /yaygın/, p);
  }
  assert.throws(() => passwordRules('ali.veli', { username: 'Ali.Veli' }), /kullanıcı adıyla/);
  assert.throws(() => passwordRules('12345'), /en az 6/);
  assert.throws(() => passwordRules('ş'.repeat(40)), /72 bayt/);
  assert.doesNotThrow(() => passwordRules('Deniz-2026!', { username: 'deniz' }));
  assert.doesNotThrow(() => passwordRules('kirmizi7elma'));
});

test('kayıt süzgeci: şifre, anahtar ve token satırları gizlenir', () => {
  const log = [
    '[trlive] TR LIVE PANEL SIFRESI (cloud-init sifresi uygun degildi): Ab12Cd34Ef56Gh78',
    'token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 kullanıldı',
    'yeni anahtar github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz',
    'postgresql://trlive:SuperGizli123@postgres:5432/trlive',
    "JWT_SECRET='abcdef0123456789abcdef0123456789'",
    'POSTGRES_PASSWORD=xyz987',
    'AUTHORIZATION: basic eC1hY2Nlc3MtdG9rZW46Z2hw',
    'Servisler derleniyor ve başlatılıyor',
  ].join('\n');
  const out = redactSecrets(log);
  for (const secret of ['Ab12Cd34Ef56Gh78', 'ghp_ABCDEFGHIJ', 'github_pat_11', 'SuperGizli123', 'abcdef0123456789', 'xyz987', 'eC1hY2Nlc3MtdG9rZW46Z2hw']) {
    assert.ok(!out.includes(secret), `sızmamalı: ${secret}\n${out}`);
  }
  assert.match(out, /PANEL SIFRESI .*: \[gizlendi\]/);
  assert.match(out, /postgresql:\/\/trlive:\[gizlendi\]@postgres/);
  assert.match(out, /Servisler derleniyor ve başlatılıyor/, 'normal satırlar değişmez');
  assert.equal(redactSecrets(null), null);
  assert.equal(redactSecrets(''), '');
});

test('ADMIN_USERNAMES kararı: ad bir kez, o an var olan hesaba yetki verir', () => {
  const listed = new Date('2026-11-01T00:00:00Z');
  const old = new Date('2026-10-01T00:00:00Z');
  const late = new Date('2026-11-05T00:00:00Z');
  assert.equal(bootstrapDecision({ accountId: 'a', accountCreatedAt: old, firstListedAt: listed }), 'grant', 'listeden önce açılmış hesap');
  assert.equal(bootstrapDecision({ accountId: 'a', accountCreatedAt: late, firstListedAt: listed }), 'late', 'adı sonradan kapan');
  assert.equal(bootstrapDecision({ grantedTo: 'a', accountId: 'a', accountCreatedAt: late, firstListedAt: listed }), 'grant', 'aynı yönetici');
  assert.equal(bootstrapDecision({ grantedTo: 'a', accountId: 'b', accountCreatedAt: old, firstListedAt: listed }), 'other', 'eski yöneticinin adını alan');
});

test('zayıf gizli değer: kısa ya da örnek değer', () => {
  assert.equal(weakSecret(''), true);
  assert.equal(weakSecret('kisa'), true);
  assert.equal(weakSecret('CHANGE_ME_LONG_RANDOM_SECRET_CHANGE_ME_LONG'), true);
  assert.equal(weakSecret('dev-only-change-me-dev-only-change-me-123'), true);
  assert.equal(weakSecret('9fK2xQ7LmA4tR8vZ1cB6nH3jW5yE0pUs'), false);
});

test('sayı ayarı: binlik ayraçlı değer, 0 = kapalı, geçersizde varsayılan', () => {
  const d = 2_000_000n;
  assert.equal(limitSetting(undefined, d, 'X'), d);
  assert.equal(limitSetting('  ', d, 'X'), d);
  assert.equal(limitSetting('500.000', d, 'X'), 500_000n);
  assert.equal(limitSetting('1,500,000', d, 'X'), 1_500_000n);
  assert.equal(limitSetting('750 000', d, 'X'), 750_000n);
  assert.equal(limitSetting('0', d, 'X'), 0n);
  assert.equal(limitSetting('-5', d, 'X'), d);
  assert.equal(limitSetting('çok', d, 'X'), d);
});

test('kayıt süzgeci: tireli ad (x-access-token) satırın geri kalanını silmez', () => {
  const out = redactSecrets('fatal: https://x-access-token:ghs_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123@github.com/o/r.git erişilemedi');
  assert.ok(!out.includes('ghs_ABCDEFGHIJ'));
  assert.match(out, /@github\.com\/o\/r\.git erişilemedi/);
  for (const [line, secret] of [['--password=Hunter2xyz', 'Hunter2xyz'], ['client-secret: abc123def', 'abc123def'], ['X-Api-Token: tok123', 'tok123']]) {
    assert.ok(!redactSecrets(line).includes(secret), `tireli anahtar da gizlenir: ${line}`);
  }
});
