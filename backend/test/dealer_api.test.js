import test from 'node:test';
import assert from 'node:assert/strict';
import { newApiKey, parseBearer, keyMatches, cleanAllowEntry, ipAllowed, CLIENT_ORDER_RE, KEY_RE } from '../src/modules/dealers/dealer_api.rules.js';

test('API anahtarı: biçim, önek, yalnızca özet saklanır', () => {
  const k = newApiKey();
  assert.match(k.key, KEY_RE);
  assert.ok(k.key.startsWith(`${k.prefix}_`));
  assert.equal(k.hash.length, 64);
  assert.notEqual(k.hash, k.key);
  assert.equal(keyMatches(k.key, k.hash), true);
  assert.equal(keyMatches(`${k.key.slice(0, -1)}${k.key.endsWith('x') ? 'y' : 'x'}`, k.hash), false);
  assert.equal(keyMatches(k.key, 'zz'), false);
  assert.notEqual(newApiKey().key, k.key);
});

test('Bearer çözümü', () => {
  const k = newApiKey();
  assert.deepEqual(parseBearer(`Bearer ${k.key}`), { key: k.key, prefix: k.prefix });
  assert.equal(parseBearer(`Basic ${k.key}`), null);
  assert.equal(parseBearer('Bearer trk_short_x'), null);
  assert.equal(parseBearer(undefined), null);
});

test('IP izin listesi: tek IP, IPv4 CIDR, IPv6, boş liste', () => {
  assert.equal(cleanAllowEntry(' 203.0.113.7 '), '203.0.113.7');
  assert.equal(cleanAllowEntry('203.0.113.0/24'), '203.0.113.0/24');
  assert.equal(cleanAllowEntry('10.0.0.0/4'), null, 'çok geniş blok');
  assert.equal(cleanAllowEntry('999.1.1.1'), null);
  assert.equal(cleanAllowEntry('2001:DB8::1'), '2001:db8::1');
  assert.equal(cleanAllowEntry('example.com'), null);
  assert.equal(ipAllowed([], '1.2.3.4'), true);
  assert.equal(ipAllowed(['203.0.113.7'], '203.0.113.7'), true);
  assert.equal(ipAllowed(['203.0.113.7'], '::ffff:203.0.113.7'), true);
  assert.equal(ipAllowed(['203.0.113.7'], '203.0.113.8'), false);
  assert.equal(ipAllowed(['203.0.113.0/24'], '203.0.113.200'), true);
  assert.equal(ipAllowed(['203.0.113.0/24'], '203.0.114.1'), false);
  assert.equal(ipAllowed(['2001:db8::1'], '2001:DB8::1'), true);
});

test('clientOrderId biçimi', () => {
  assert.ok(CLIENT_ORDER_RE.test('SIP-10045_a'));
  assert.ok(!CLIENT_ORDER_RE.test(''));
  assert.ok(!CLIENT_ORDER_RE.test('a b'));
  assert.ok(!CLIENT_ORDER_RE.test('x'.repeat(65)));
});
