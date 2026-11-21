import test from 'node:test';
import assert from 'node:assert/strict';
import { resultAnnouncements, EVENT_GROUPS } from '../src/modules/events/weekly_events.service.js';

test('haftalık sonuç duyurusu: etkinlik grubu başına kürsü verisi', async () => {
  const rows = [
    { kind: 'couple', rank: 1, user_id: 'a', partner_id: 'b', score: '10', gift_name: null, gift_icon: null },
    { kind: 'king', rank: 1, user_id: 'c', partner_id: null, score: '9', gift_name: null, gift_icon: null },
    { kind: 'king', rank: 2, user_id: 'd', partner_id: null, score: '8', gift_name: null, gift_icon: null },
    { kind: 'queen', rank: 1, user_id: 'e', partner_id: null, score: '7', gift_name: null, gift_icon: null },
    { kind: 'star2', rank: 1, user_id: 'a', partner_id: null, score: '5', gift_name: 'Kılıç', gift_icon: '/uploads/k.png' },
  ];
  const names = { a: 'ARGEŞ', b: 'BEKES', c: 'Merdo21', d: 'AHTAPOT', e: 'Sarmaşık' };
  const run = async () => ({ rows });
  const load = async (ids) => ids.map((id) => ({ id, display_name: names[id], username: names[id], avatar_url: `/uploads/${id}.jpg` }));
  const list = await resultAnnouncements(new Date('2026-11-09T00:00:00+03:00'), run, load);
  assert.deepEqual(list.map((x) => x.group), ['couple', 'royal', 'star']);
  const royal = list.find((x) => x.group === 'royal');
  assert.equal(royal.meta.type, 'event_results');
  assert.deepEqual(royal.meta.sections.map((s) => s.kind), ['king', 'queen']);
  assert.equal(royal.meta.sections[0].entries[1].rank, 2);
  assert.ok(royal.title.length <= 80);
  const couple = list.find((x) => x.group === 'couple');
  assert.ok(couple.meta.sections[0].entries[0].partner);
  const star = list.find((x) => x.group === 'star');
  assert.equal(star.meta.sections[0].giftName, 'Kılıç');
  assert.equal(star.meta.sections[0].giftIcon, '/uploads/k.png');
  assert.match(star.body, /Kılıç/);
  assert.deepEqual(Object.keys(EVENT_GROUPS), ['couple', 'royal', 'star']);
  assert.deepEqual(await resultAnnouncements(new Date(), async () => ({ rows: [] }), load), []);
});
