import test from 'node:test';
import assert from 'node:assert/strict';
import { cappedSelf, scaleSelfDays, segmentOf, SELF_GIFT_CAP_BPS } from '../src/modules/agencies/salary_rules.js';

test('sınır: sayılan kendine hediye, sayılan toplamın en çok %20si', () => {
  assert.equal(SELF_GIFT_CAP_BPS, 2000);
  assert.equal(cappedSelf(800n, 500n), 200n, '800 + 200 = 1000; 200 = %20');
  assert.equal(cappedSelf(800n, 100n), 100n, 'sınırın altındaysa tamamı');
  assert.equal(cappedSelf(0n, 500n), 0n, 'başkasından hediye yoksa hiç sayılmaz');
  assert.equal(cappedSelf(800n, 0n), 0n);
  assert.equal(cappedSelf(3n, 5n), 0n, 'aşağı yuvarlanır (3 × 0,25 = 0)');
  assert.equal(cappedSelf(800n, 500n, 10000), 500n, '%100 = sınırsız');
  assert.equal(cappedSelf(800n, 500n, 0), 0n, '%0 = hiç');
  const others = 123457n; const counted = cappedSelf(others, 10n ** 9n);
  assert.ok(counted * 10000n <= (others + counted) * 2000n, 'toplamın %20sini aşmaz');
});

test('günlere dağılım: toplam her zaman sayılan tutara eşit, gün sırası korunur', () => {
  const r = scaleSelfDays(400n, new Map([[3, 100n], [1, 50n], [2, 51n]]));
  assert.equal(r.counted, 100n);
  let sum = 0n; for (const v of r.days.values()) sum += v;
  assert.equal(sum, 100n);
  assert.equal(r.days.get(1), 24n); assert.equal(r.days.get(2), 25n); assert.equal(r.days.get(3), 51n, 'kalan son güne');
  const all = scaleSelfDays(10000n, new Map([[1, 7n]]));
  assert.deepEqual([...all.days], [[1, 7n]], 'sınır altında olduğu gibi');
  assert.equal(scaleSelfDays(0n, new Map([[1, 7n]])).days.size, 0);
});

test('dönem dilimi', () => {
  assert.equal(segmentOf(5, []), 0);
  assert.equal(segmentOf(5, [10]), 0);
  assert.equal(segmentOf(10, [10]), 1);
  assert.equal(segmentOf(25, [10, 20]), 2);
});
