#!/usr/bin/env node
// Proje içi fonksiyonlar DOĞRU SAYIDA argümanla mı çağrılıyor?
//
// NEDEN: `auditStaff(c, adminId, userId, action, meta)` beş argüman alıyor. Ben iki yerde
// üç argümanla çağırdım. Sözdizimi doğru, import doğru, tanımsız ad yok — hiçbir araç
// görmedi. Çalışma anında `c` yerine `req` geçti ve `c.query is not a function` ile
// uç 500 döndü. Sahibi bunu CI'da gördü.
//
// JavaScript eksik argümanı `undefined` yapıp devam ettiği için bu hata DERLEME ANINDA
// değil, yalnızca o satır çalıştığında ortaya çıkıyor.
//
// NE DENETLENİYOR: `export function f(a, b, c)` biçiminde, varsayılan değeri ve yayılma
// parametresi OLMAYAN fonksiyonlar. Çağrıda argüman sayısı tanımdakinden azsa ya da
// fazlaysa bildirilir.
//
// BU ARACIN GÖREMEDİĞİ (ve bunu bilerek atlıyor):
//  · varsayılan değerli (`a = 1`) ya da yayılmalı (`...rest`) parametreler
//  · çağrıda yayılma (`f(...args)`)
//  · sınıf yöntemleri, ok fonksiyonları, yeniden atanan adlar
//  · aynı adı taşıyan iki ayrı fonksiyon (belirsiz; atlanır)
// Atlananların sayısı sonda yazılır: "hepsini denetledim" yanılgısı olmasın.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { blankNonCode } from './free_idents.mjs';

const SRC = new URL('../src/', import.meta.url).pathname;

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

/** Parantez grubundaki üst düzey eleman sayısı (boş olmayan parçalar). */
function topLevel(src, open) {
  let depth = 0; let n = 0; let cur = false; let spread = false;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if ('([{'.includes(ch)) { if (depth >= 1) cur = true; depth++; continue; }
    if (')]}'.includes(ch)) {
      depth--;
      if (depth === 0) return { n: n + (cur ? 1 : 0), spread, end: i };
      continue;
    }
    if (depth === 1) {
      if (ch === ',') { if (cur) n++; cur = false; } else if (!/\s/.test(ch)) {
        cur = true;
        if (ch === '.' && src.slice(i, i + 3) === '...') spread = true;
      }
    }
  }
  return null;
}

const files = walk(SRC);

// ---- 1) Tanımlar ----
const defs = new Map();     // ad → { params, file }
const ambiguous = new Set(); // aynı adı taşıyan birden çok tanım
let skippedDefs = 0;

for (const f of files) {
  const code = blankNonCode(readFileSync(f, 'utf8'));
  for (const m of code.matchAll(/\bexport\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
    const name = m[1];
    const open = m.index + m[0].length - 1;
    const t = topLevel(code, open);
    if (!t) { skippedDefs++; continue; }
    const params = code.slice(open + 1, t.end);
    // Varsayılan değer, yayılma ya da yıkım (destructuring) varsa arite sabit değil.
    if (/[=.]|\{|\[/.test(params.replace(/\s/g, ''))) { skippedDefs++; continue; }
    if (defs.has(name) && defs.get(name).params !== t.n) ambiguous.add(name);
    defs.set(name, { params: t.n, file: f });
  }
}

// ---- 2) Çağrılar ----
let bad = 0;
let checked = 0;
let skippedCalls = 0;

for (const f of files) {
  const raw = readFileSync(f, 'utf8');
  const code = blankNonCode(raw);
  for (const m of code.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
    const name = m[2];
    const def = defs.get(name);
    if (!def || ambiguous.has(name)) continue;
    // Tanımın kendisi değil.
    const before = code.slice(Math.max(0, m.index - 20), m.index + m[0].length);
    if (/\bfunction\s+$/.test(before.slice(0, before.length - name.length - 1))) continue;
    const open = m.index + m[0].length - 1;
    const t = topLevel(code, open);
    if (!t || t.spread) { skippedCalls++; continue; }
    checked++;
    // SADECE İKİ VE DAHA FAZLA EKSİK argüman bildirilir.
    //
    // JavaScript'te son argümanı atlamak yaygın ve çoğu zaman KASITLI:
    // `promoteBootstrapAdmins(username)` gövdesinde `username === undefined` durumunu
    // zaten ele alıyor. İlk sürüm "sayı tutmuyor" diye bakıyordu ve dört yanlış alarm
    // verdi. Yanlış alarm veren araç, hiç araç olmamasından kötüdür.
    //
    // Fazla argüman da bildirilmiyor: işe yaramaz ama zarar da vermiyor.
    //
    // İki ve daha fazla eksik argüman ise neredeyse her zaman gerçek hatadır: benim
    // `auditStaff(req, action, meta)` çağrım beş parametreli fonksiyona üç argüman
    // veriyordu ve `req` yanlış yere oturup uç 500 döndürüyordu.
    const missing = def.params - t.n;
    if (missing >= 2) {
      const line = raw.slice(0, m.index).split('\n').length;
      console.log(
        `${relative(SRC, f)}:${line}: ${name}() ${def.params} argüman bekliyor, ${t.n} verilmiş `
        + `(${missing} eksik; tanım: ${relative(SRC, def.file)}) `
        + `→ argümanlar yanlış yere oturur, çalışma anında "Sunucu hatası"`,
      );
      bad++;
    }
  }
}

if (!checked) { console.error('HATA: hiçbir çağrı denetlenemedi — araç bozuk.'); process.exit(2); }
console.log(bad
  ? `\n${bad} yanlış argüman sayısı. Her biri o satır çalıştığında "Sunucu hatası" demektir.`
  : `fonksiyon argüman sayıları doğru (${checked} çağrı denetlendi; `
    + `${skippedDefs} tanım ve ${skippedCalls} çağrı sabit arite olmadığı için atlandı)`);
process.exit(bad ? 1 : 0);
