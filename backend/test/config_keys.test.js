import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

delete process.env.DATABASE_URL;
const { config } = await import('../src/config.js');
const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

function jsFiles(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) jsFiles(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

// Kodda kullanılan her config anahtarı config.js'te tanımlı olmalı. Tanımsız anahtar "undefined" döner ve hata ancak o
// satır çalışınca çıkar: supportCoinDailyLimit tanımsız kaldığı için yardımcı adminin Coin yüklemesi "Sunucu hatası"
// veriyordu (v2.106.1).
test('kodda kullanılan her config anahtarı tanımlı', () => {
  const missing = [];
  for (const file of jsFiles(SRC)) {
    if (file.endsWith('config.js')) continue;
    const s = fs.readFileSync(file, 'utf8');
    if (!/import\s*\{[^}]*\bconfig\b[^}]*\}\s*from\s*'[^']*config\.js'/.test(s)) continue;
    for (const m of s.matchAll(/(?<![\w.$'/])config\.([A-Za-z_]\w*)(?:\.([A-Za-z_]\w*))?/g)) {
      const [, a, b] = m;
      if (a === 'js') continue; // './config.js' yolu
      if (!(a in config)) { missing.push(`${a} (${path.basename(file)})`); continue; }
      const v = config[a];
      if (b && v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Set) && !(v instanceof Map) && !(b in v)) {
        missing.push(`${a}.${b} (${path.basename(file)})`);
      }
    }
  }
  assert.deepEqual([...new Set(missing)], []);
});

test('yardımcı admin günlük Coin sınırı: BigInt, varsayılan 1.000.000', () => {
  assert.equal(typeof config.supportCoinDailyLimit, 'bigint');
  assert.equal(config.supportCoinDailyLimit, 1000000n);
  // Yönetim rotasındaki hesap (sınır - bugün yüklenen) BigInt ile yapılır.
  assert.equal(config.supportCoinDailyLimit - BigInt('250000'), 750000n);
});
