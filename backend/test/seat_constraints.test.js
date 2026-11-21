import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Uygulamanın izin verdiği her koltuk sayısına veritabanı kısıtı da izin vermeli (yoksa "Değer kurallara uymuyor.").
const src = fs.readFileSync(new URL('../src/modules/rooms/rooms.service.js', import.meta.url), 'utf8');
const supported = JSON.parse(src.match(/SUPPORTED_SEATS = new Set\((\[[^\]]+\])\)/)[1]);
const dir = new URL('../src/migrations/', import.meta.url);
const sql = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => fs.readFileSync(new URL(f, dir), 'utf8')).join('\n');

for (const table of ['rooms', 'room_profiles']) {
  test(`${table}: son seat_count kısıtı tüm desteklenen koltuk sayılarını kapsar`, () => {
    const all = [...sql.matchAll(new RegExp(`ADD CONSTRAINT ${table}_seat_count_check CHECK \\(seat_count IN \\(([^)]*)\\)\\)`, 'g'))];
    assert.ok(all.length, 'kısıt bulunamadı');
    const allowed = all.at(-1)[1].split(',').map((x) => Number(x.trim()));
    for (const n of supported) assert.ok(allowed.includes(n), `${n} koltuk veritabanında yok`);
  });
}

test('mic_skins tasarımlarının koltuk sayısı desteklenenler arasında', () => {
  for (const m of sql.matchAll(/INSERT INTO mic_skins\([^)]*\)\s*VALUES\s*\('([a-z_]+)',\s*'[^']*',\s*(\d+)/g)) {
    assert.ok(supported.includes(Number(m[2])), `${m[1]}: ${m[2]} koltuk desteklenmiyor`);
  }
});
