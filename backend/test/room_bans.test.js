import test from 'node:test';
import assert from 'node:assert/strict';

delete process.env.DATABASE_URL;
const rb = await import('../src/services/room_bans.js');

const room = { id: 'r-1', owner_id: 'o-1', room_type: 'audio' };

test('kalan süre yazısı', () => {
  assert.equal(rb.remainingText(1440), '24 saat');
  assert.equal(rb.remainingText(200), '3 saat 20 dakika');
  assert.equal(rb.remainingText(45), '45 dakika');
  assert.equal(rb.remainingText(0), '1 dakika', 'en az 1 dakika');
  assert.equal(rb.remainingText('60'), '1 saat');
});

test('yasak yazısı: atılma süreli, engelleme süresiz', () => {
  assert.equal(rb.banMessage({ kind: 'kick', until: new Date(), minutes_left: 1440 }), 'Bu odadan çıkarıldınız. 24 saat sonra tekrar girebilirsiniz.');
  assert.equal(rb.banMessage({ kind: 'kick', until: new Date(), minutes_left: 75 }), 'Bu odadan çıkarıldınız. 1 saat 15 dakika sonra tekrar girebilirsiniz.');
  assert.equal(rb.banMessage({ kind: 'block', until: null, minutes_left: null }), 'Bu odaya girişiniz engellenmiş.');
});

test('atılma 24 saat, engelleme süresiz; yasak kalıcı odaya (sahip + tür) yazılır', async () => {
  assert.equal(rb.KICK_BAN_HOURS, 24);
  const calls = [];
  const run = async (sql, params) => { calls.push({ sql, params }); return { rows: [{ kind: params[3], until: params[5] === null ? null : 'x' }], rowCount: 1 }; };
  await rb.banFromRoom(room, 'u-1', 'kick', 'm-1', run);
  await rb.banFromRoom(room, 'u-2', 'block', 'm-1', run);
  assert.deepEqual(calls[0].params, ['o-1', 'audio', 'u-1', 'kick', 'm-1', 24]);
  assert.deepEqual(calls[1].params, ['o-1', 'audio', 'u-2', 'block', 'm-1', null]);
  // Süresiz engel, sonradan gelen atılmayla kısaltılmaz.
  assert.match(calls[0].sql, /WHERE EXCLUDED\.kind = 'block' OR room_bans\.until IS NOT NULL/);
  assert.match(calls[0].sql, /ON CONFLICT \(owner_id, room_type, user_id\)/);
});

test('süren yasak sorgusu süresi dolanı saymaz; kaldırma ve kayıt', async () => {
  const calls = [];
  const run = async (sql, params) => { calls.push({ sql, params }); return { rows: [], rowCount: 0 }; };
  assert.equal(await rb.activeBan(room, 'u-1', run), null);
  assert.match(calls[0].sql, /until IS NULL OR until > NOW\(\)/);
  assert.deepEqual(calls[0].params, ['o-1', 'audio', 'u-1']);
  assert.equal(await rb.unbanFromRoom(room, 'u-1', run), null);
  assert.match(calls[1].sql, /^DELETE FROM room_bans/);
  await rb.logModeration(room, 'm-1', 'u-1', 'kick', { hours: 24 }, run);
  assert.deepEqual(calls[2].params, ['o-1', 'audio', 'r-1', 'm-1', 'u-1', 'kick', '{"hours":24}']);
  // Kayıt yazılamasa da işlem bozulmaz.
  await assert.doesNotReject(rb.logModeration(room, 'm-1', 'u-1', 'kick', {}, async () => { throw new Error('db yok'); }));
  const view = await rb.moderationRows(room, { limit: 9999 }, run);
  assert.deepEqual(view, { bans: [], logs: [] });
  assert.equal(calls.at(-1).params[2], 200, 'kayıt sayısı sınırlı');
});
