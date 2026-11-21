// O-01: Oyun paketi yükleme denetimi. Paket kodu sunucu sürecinde çalışır; kim hangi dosyayı
// yükledi sorusunun cevabı kayıt altında olmalı.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

// Küçük zip üretici (deflate).
function zip(files) {
  const parts = []; const central = []; let offset = 0;
  const crc32 = (buf) => { let c, crc = ~0; for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; crc = (crc >>> 8) ^ c; } return ~crc >>> 0; };
  for (const [name, data] of Object.entries(files)) {
    const nameB = Buffer.from(name); const raw = Buffer.from(data); const comp = zlib.deflateRawSync(raw);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(8, 8);
    h.writeUInt32LE(crc32(raw), 14); h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(nameB.length, 26);
    parts.push(h, nameB, comp);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10);
    c.writeUInt32LE(crc32(raw), 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(nameB.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, nameB);
    offset += 30 + nameB.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

test('paket özeti (sha256) dosyanın parmak izidir', async () => {
  const { packageHash } = await import('../src/modules/games/plugins.service.js');
  const buf = Buffer.from('merhaba');
  assert.equal(packageHash(buf), crypto.createHash('sha256').update(buf).digest('hex'));
  assert.notEqual(packageHash(buf), packageHash(Buffer.from('merhaba.')), 'tek karakter değişince özet değişmeli');
});

test('paket yüklemesi kim/ne/hangi dosya olarak kayda geçer',
  { skip: !process.env.DATABASE_URL && 'DATABASE_URL yok', timeout: 90000 }, async () => {
    const { query } = await import('../src/infrastructure/database/database.js');
    const P = await import('../src/modules/games/plugins.service.js');
    const id = 'audit' + Math.random().toString(36).slice(2, 6).replace(/[^a-z]/g, 'a');
    const admin = (await query(
      `INSERT INTO users(username, display_name, system_role) VALUES($1,$1,'admin') RETURNING id`,
      ['pa_' + Math.random().toString(36).slice(2, 8)],
    )).rows[0].id;
    const make = (version) => zip({
      'plugin.json': JSON.stringify({ id, name: 'Denetim Testi', version }),
      'client/index.html': `<!doctype html><title>v${version}</title>`,
    });
    try {
      const v1 = make('1.0.0');
      const r1 = await P.installPackage(v1, admin);
      assert.equal(r1.sha256, P.packageHash(v1), 'dönen özet dosyanın özeti olmalı');
      assert.equal(r1.sameAsPrevious, false, 'ilk yükleme');

      const row = (await query(`SELECT sha256, uploaded_by, version FROM game_plugins WHERE id = $1`, [id])).rows[0];
      assert.equal(row.sha256, r1.sha256, 'özet veritabanına yazılmalı');
      assert.equal(row.uploaded_by, admin, 'yükleyen yönetici yazılmalı');

      const a1 = (await query(`SELECT action, admin_id, sha256, version, detail FROM game_plugin_audit WHERE plugin_id = $1 ORDER BY id`, [id])).rows;
      assert.equal(a1.length, 1);
      assert.equal(a1[0].action, 'install');
      assert.equal(a1[0].admin_id, admin);
      assert.equal(a1[0].sha256, r1.sha256);
      assert.equal(a1[0].detail.hasServer, false, 'sunucu kodu olmayan paket işaretlenmeli');

      // Aynı dosya tekrar yüklenirse "aynı dosya" olarak işaretlenir (yanlışlıkla eski sürümü geri yükleme).
      const r1b = await P.installPackage(v1, admin);
      assert.equal(r1b.sameAsPrevious, true, 'aynı dosya tekrar yüklendi işareti');

      // Yeni sürüm: özet değişir, önceki sürüm denetim kaydında görünür.
      const v2 = make('1.1.0');
      const r2 = await P.installPackage(v2, admin);
      assert.notEqual(r2.sha256, r1.sha256);
      const last = (await query(`SELECT detail FROM game_plugin_audit WHERE plugin_id = $1 ORDER BY id DESC LIMIT 1`, [id])).rows[0];
      assert.equal(last.detail.replaced.version, '1.0.0', 'değiştirilen sürüm kayda geçmeli');
      assert.equal(last.detail.replaced.sameFile, false);

      // Kaldırma da kayda geçer.
      await P.removePackage(id, admin);
      const acts = (await query(`SELECT action FROM game_plugin_audit WHERE plugin_id = $1 ORDER BY id`, [id])).rows.map((x) => x.action);
      assert.deepEqual(acts, ['install', 'install', 'install', 'remove']);
    } finally {
      await query(`DELETE FROM game_plugin_audit WHERE plugin_id = $1`, [id]).catch(() => {});
      await query(`DELETE FROM game_plugins WHERE id = $1`, [id]).catch(() => {});
      await query(`DELETE FROM activity_items WHERE link_url LIKE $1`, [`%/g/${id}/%`]).catch(() => {});
      await query(`DELETE FROM wallet_recon_baseline WHERE user_id = $1`, [admin]).catch(() => {});
      await query(`DELETE FROM users WHERE id = $1`, [admin]).catch(() => {});
    }
  });
