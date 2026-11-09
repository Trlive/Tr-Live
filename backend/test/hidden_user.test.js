import test from 'node:test';
import assert from 'node:assert/strict';
import { publicUser, roomUser, anonUser, HIDDEN_NAME } from '../src/views.js';

// Gizli moddaki örnek kullanıcı satırı (USER_PUBLIC_COLUMNS biçiminde).
const row = {
  id: 'u1', username: 'ali', public_id: '2147', display_name: 'Ali', avatar_url: '/media/a.png', is_hidden: true, hidden_alias: '483920',
  coin_level: 40, gift_level: 12, wip_level: 10, wip_features: { nameColor: 'gold' }, frame_url: '/media/f.webp', special_id: '777',
  host_badge: 'gold', id_color: 'altin', cosmetics: { chat_bubble: '/b.png' }, u_created_at: '2026-01-01T00:00:00Z', u_kyc_status: 'approved',
};

test('gizli kullanıcı oda dışında (mesaj, akış, profil listeleri) kendi kimliğiyle görünür', () => {
  const u = publicUser(row, 'viewer');
  assert.equal(u.displayName, 'Ali');
  assert.equal(u.username, 'ali');
  assert.equal(u.avatarUrl, '/media/a.png');
  assert.equal(u.publicId, '2147');
  assert.equal(u.coinLevel, 40);
  assert.equal(u.isHidden, false, 'gizli mod oda dışında bildirilmez');
  assert.equal('hiddenId' in u, false, 'gizli ID oda dışında hiç gönderilmez');
  assert.ok(!JSON.stringify(u).includes('483920'), 'gizli ID hiçbir alanda yok');
});

test('odada gizli kullanıcı "Gizli Kullanıcı" ve gizli ID ile görünür; gerçek kimlik bilgisi yok', () => {
  const u = roomUser(row, 'viewer');
  assert.equal(u.displayName, HIDDEN_NAME);
  assert.equal(u.username, HIDDEN_NAME);
  assert.equal(u.isHidden, true);
  assert.equal(u.hiddenId, '483920');
  for (const k of ['publicId', 'avatarUrl', 'coinLevel', 'giftLevel', 'wipLevel', 'frameUrl', 'specialId', 'hostBadge', 'idColor', 'chatBubbleUrl']) {
    assert.equal(u[k], null, `odada ${k} gizli`);
  }
  const s = JSON.stringify(u);
  for (const leak of ['Ali', 'ali', '2147', '/media/a.png', '777']) assert.ok(!s.includes(`"${leak}"`), `sızmamalı: ${leak}`);
});

test('sıralama / şerit: gizli kullanıcı "Gizli Kullanıcı", gizli ID de yok', () => {
  const u = anonUser(row, 'viewer');
  assert.equal(u.displayName, HIDDEN_NAME);
  assert.equal(u.hiddenId, null);
  assert.equal(u.publicId, null);
});

test('gizli olmayan kullanıcı her bağlamda aynı görünür', () => {
  const normal = { ...row, is_hidden: false };
  const a = publicUser(normal);
  assert.deepEqual(roomUser(normal), a);
  assert.deepEqual(anonUser(normal), a);
  assert.equal(a.displayName, 'Ali');
  assert.equal(publicUser(null), null);
  assert.equal(roomUser(null), null);
  assert.equal(anonUser(undefined), null);
});
