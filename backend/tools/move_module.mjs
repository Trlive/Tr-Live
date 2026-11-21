#!/usr/bin/env node
// Bir dosyayı modül klasörüne taşır ve import yollarını düzeltir. MANTIĞA DOKUNMAZ.
//
//   node tools/move_module.mjs <modul> <kaynak> <yeni-ad>
//   node tools/move_module.mjs chat routes/chat.js chat.routes.js
//
// Yaptığı tek şey: dosyayı src/modules/<modul>/<yeni-ad> altına almak, içindeki göreli import
// yollarını yeni derinliğe göre düzeltmek ve dosyaya dışarıdan gelen import'ları güncellemek.
// Kod satırlarına dokunulmaz — bu yüzden `route_map.test.js` taşımadan sonra aynı sonucu vermelidir.
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';

const SRC = new URL('../src/', import.meta.url).pathname.replace(/\/$/, '');
const ROOT = new URL('../', import.meta.url).pathname.replace(/\/$/, '');
const [mod, from, as] = process.argv.slice(2);
if (!mod || !from || !as) {
  console.error('kullanim: node tools/move_module.mjs <modul> <routes/x.js> <x.routes.js>');
  process.exit(1);
}

const srcPath = join(SRC, from);
const dstDir = join(SRC, 'modules', mod);
const dstPath = join(dstDir, as);
mkdirSync(dstDir, { recursive: true });

// 1) Dosyanın kendi göreli import'ları: eski konumdan çözülüp yeni konuma göre yeniden yazılır.
let code = readFileSync(srcPath, 'utf8');
code = code.replace(/(from\s+['"])(\.\.?\/[^'"]+)(['"])/g, (all, a, spec, b) => {
  const abs = resolve(dirname(srcPath), spec);
  let rel = relative(dirname(dstPath), abs);
  if (!rel.startsWith('.')) rel = './' + rel;
  return a + rel + b;
});
writeFileSync(dstPath, code);
rmSync(srcPath);

// 2) Bu dosyayı import eden HER dosya (src/ ve test/) yeni yola çevrilir.
function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === 'migrations' || n === 'samples') continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.js') || p.endsWith('.mjs')) out.push(p);
  }
  return out;
}

let touched = 0;
for (const f of [...walk(SRC), ...walk(join(ROOT, 'test')), ...walk(join(ROOT, 'e2e'))]) {
  if (f === dstPath) continue;
  const before = readFileSync(f, 'utf8');
  const after = before.replace(/(from\s+['"])(\.\.?\/[^'"]+)(['"])/g, (all, a, spec, b) => {
    if (resolve(dirname(f), spec) !== srcPath) return all;
    let rel = relative(dirname(f), dstPath);
    if (!rel.startsWith('.')) rel = './' + rel;
    return a + rel + b;
  });
  if (after !== before) { writeFileSync(f, after); touched++; }
}

console.log(`${from} -> modules/${mod}/${as}  (${touched} dosyadaki import guncellendi)`);
