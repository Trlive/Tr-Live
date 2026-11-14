import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCoins, nextStreak, progress } from '../src/checkin_rules.js';

test('günlük giriş: seri dün varsa sürer, 7. günden sonra ve ara verince 1', () => {
  assert.equal(nextStreak(null), 1);
  assert.equal(nextStreak({ streak: 3, gap: 1 }), 4);
  assert.equal(nextStreak({ streak: 7, gap: 1 }), 1);
  assert.equal(nextStreak({ streak: 5, gap: 2 }), 1);
});

test('günlük giriş: pencerede işaretli gün sayısı', () => {
  assert.deepEqual(progress(null), { signedDays: 0, signedToday: false });
  assert.deepEqual(progress({ streak: 2, gap: 0 }), { signedDays: 2, signedToday: true });
  assert.deepEqual(progress({ streak: 2, gap: 1 }), { signedDays: 2, signedToday: false });
  assert.deepEqual(progress({ streak: 7, gap: 1 }), { signedDays: 0, signedToday: false });
  assert.deepEqual(progress({ streak: 4, gap: 3 }), { signedDays: 0, signedToday: false });
});

test('günlük giriş: ödül listesi okunur, bozuksa varsayılan', () => {
  assert.deepEqual(parseCoins('1, 2,3,4,5,6,7'), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(parseCoins('abc'), [20, 20, 20, 20, 50, 50, 100]);
  assert.deepEqual(parseCoins('1,2,3'), [20, 20, 20, 20, 50, 50, 100]);
});

