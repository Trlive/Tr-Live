import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRoomTheme } from '../src/modules/rooms/room_themes.service.js';

// Birden çok özel tema: "custom:<id>" seçilen temanın görselini uygular; "custom" kayıtlı görseli korur.
const A = { id: '11111111-1111-1111-1111-111111111111', image_url: '/uploads/a.jpg' };
const B = { id: '22222222-2222-2222-2222-222222222222', image_url: '/uploads/b.jpg' };
const fakeQ = async (sql, params) => {
  if (/id::text = \$2/.test(sql)) return { rows: [A, B].filter((c) => c.id === params[1]) };
  if (/image_url = \$2/.test(sql)) return { rows: [A, B].filter((c) => c.image_url === params[1]) };
  if (/ORDER BY reviewed_at/.test(sql)) return { rows: [B] }; // en son onaylanan
  return { rows: [] };
};

test('özel tema: custom:<id> o temanın görselini seçer', async () => {
  assert.deepEqual(await resolveRoomTheme('u1', `custom:${A.id}`, fakeQ), { theme: 'custom', imageUrl: A.image_url });
  assert.deepEqual(await resolveRoomTheme('u1', `custom:${B.id}`, fakeQ), { theme: 'custom', imageUrl: B.image_url });
  await assert.rejects(resolveRoomTheme('u1', 'custom:33333333-3333-3333-3333-333333333333', fakeQ), (e) => e.status === 403);
  await assert.rejects(resolveRoomTheme('u1', "custom:1' OR '1'='1", fakeQ), (e) => e.status === 400);
});

test('özel tema: "custom" kayıtlı görseli korur, yoksa en son onaylananı alır', async () => {
  assert.equal((await resolveRoomTheme('u1', 'custom', fakeQ, { preferImage: A.image_url })).imageUrl, A.image_url);
  assert.equal((await resolveRoomTheme('u1', 'custom', fakeQ)).imageUrl, B.image_url);
});
