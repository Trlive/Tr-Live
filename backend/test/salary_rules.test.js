import test from 'node:test';
import assert from 'node:assert/strict';
import { giftCountsForSalary, salaryGiftSql } from '../src/modules/agencies/salary_rules.js';

test('başkasına gönderilen hediye her odada maaşa sayılır', () => {
  assert.equal(giftCountsForSalary({ senderId: 'a', receiverId: 'b', roomType: 'audio' }), true);
  assert.equal(giftCountsForSalary({ senderId: 'a', receiverId: 'b', roomType: 'video' }), true);
});

test('kendine hediye: sesli odada (ve odası silinmişse) sayılır, görüntülüde sayılmaz', () => {
  assert.equal(giftCountsForSalary({ senderId: 'a', receiverId: 'a', roomType: 'audio' }), true);
  assert.equal(giftCountsForSalary({ senderId: 'a', receiverId: 'a', roomType: null }), true);
  assert.equal(giftCountsForSalary({ senderId: 'a', receiverId: 'a', roomType: 'video' }), false);
});

test('SQL karşılığı aynı kuralı yazar ve verilen oda takma adını kullanır', () => {
  assert.equal(salaryGiftSql('rm'), "(g.sender_id <> g.receiver_id OR rm.room_type IS DISTINCT FROM 'video')");
  assert.match(salaryGiftSql(), /\br\.room_type IS DISTINCT FROM 'video'/);
});
