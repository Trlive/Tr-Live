import test from 'node:test';
import assert from 'node:assert/strict';
import { redactSecrets } from '../src/redact.js';

test('şifre, token ve bağlantı bilgileri maskelenir; sıradan satırlar değişmez', () => {
  const log = [
    'DATABASE_URL=postgres://trlive:Gizli123@db:5432/trlive',
    'JWT_SECRET=abcdef1234567890',
    'git clone https://x-access-token:ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123@github.com/a/b',
    'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.abcdefghijklmnop',
    '"password": "hunter2"',
    'Sunucu 3000 portunda açıldı',
  ].join('\n');
  const r = redactSecrets(log);
  for (const s of ['Gizli123', 'abcdef1234567890', 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123', 'hunter2', 'eyJzdWIiOiIxMjM0NTYifQ']) assert.ok(!r.includes(s), s);
  assert.ok(r.includes('postgres://trlive:***@db:5432/trlive'));
  assert.ok(r.includes('Sunucu 3000 portunda açıldı'));
  assert.equal(redactSecrets(null), null);
  assert.equal(redactSecrets(''), '');
});
