#!/usr/bin/env node
// Panel dosyasını modül klasörüne taşır ve "@/..." import'larını günceller. İÇERİĞE DOKUNMAZ.
//
//   node tools/move_ui.mjs components/admin/users.tsx modules/admin/users/users-table.tsx
//
// Panelde her import "@/" ile mutlak yazıldığı için taşıma, yol dizesinin değişmesinden ibaret:
// göreli derinlik hesabı yok, bu yüzden taşıma sırasında yanlış yol üretme riski de yok.
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';

const SRC = new URL('../src/', import.meta.url).pathname.replace(/\/$/, '');
const [from, to] = process.argv.slice(2);
if (!from || !to) { console.error('kullanim: node tools/move_ui.mjs <kaynak> <hedef>'); process.exit(1); }

const srcPath = join(SRC, from);
const dstPath = join(SRC, to);
mkdirSync(dirname(dstPath), { recursive: true });
writeFileSync(dstPath, readFileSync(srcPath, 'utf8'));
rmSync(srcPath);

const oldSpec = '@/' + from.replace(/\.tsx?$/, '');
const newSpec = '@/' + to.replace(/\.tsx?$/, '');

function walk(d, out = []) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

let touched = 0;
for (const f of walk(SRC)) {
  const before = readFileSync(f, 'utf8');
  // Tam eşleşme: "@/components/admin/users" -> "@/modules/admin/users/users-table"
  // Sondaki tırnak/karakter kontrolüyle "@/components/admin/user-detail" yanlışlıkla eşleşmez.
  const after = before.replace(new RegExp(oldSpec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=["\'])', 'g'), newSpec);
  if (after !== before) { writeFileSync(f, after); touched++; }
}
console.log(`${from} -> ${to}  (${touched} dosya)`);
