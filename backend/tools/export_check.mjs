// İçe aktarılan her adın karşı dosyada gerçekten DIŞA VERİLDİĞİNİ denetler.
//
// NEDEN: ESM'de olmayan bir adı içe aktarmak sözdizimi hatası değildir; bağlama
// (link) anında patlar: "The requested module does not provide an export named X".
// Yani sunucu HİÇ AÇILMAZ. Birim testleri o dosyayı import etmiyorsa sessiz kalır;
// hata ancak CI'da ya da canlıda görülür. Bu araç onu açmadan bulur.
//
// Kapsam: yalnızca göreli (./ ../) yollar. Paketler (express, pg) denetlenmez.
// `export * from` zinciri izlenir.
//
// İKİ KEZ DÜŞTÜĞÜM TUZAK, buraya yazıyorum:
//  1) Yorumları kendi başıma silmeye kalktım; kaynakta geçen bir "/*" dizisi
//     blok yorum sanılıp gerçek `export` satırını yuttu → YANLIŞ ALARM.
//  2) Sınanmış tarayıcıyı kullanınca bu kez dize İÇLERİ de silindi; modül yolu
//     ('./x.js') dizenin içinde olduğu için hiçbir import görünmez oldu → SESSİZ KAÇIRMA.
// Çözüm: blankNonCode uzunluğu korur. Desen SİLİNMİŞ metinde aranır (yorumdaki
// "import" satırları sayılmasın diye), yol ise AYNI KONUMDAN ham kaynaktan okunur.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { blankNonCode } from './free_idents.mjs';

const cache = new Map();
const IMPORT_RE = /\bimport\s+([\s\S]*?)\s*from\s*['"]([^'"]*)['"]/gd;
const EXPORT_FROM_RE = /\bexport\s*\{([^}]*)\}\s*from\s*['"]([^'"]*)['"]/gd;
const EXPORT_STAR_RE = /\bexport\s*\*\s*from\s*['"]([^'"]*)['"]/gd;

/** Desen silinmiş metinde aranır; istenen grup ham kaynaktan aynı konumdan okunur. */
function* matchWithRaw(re, code, raw, group) {
  re.lastIndex = 0;
  for (const m of code.matchAll(re)) {
    const span = m.indices[group];
    yield { m, text: span ? raw.slice(span[0], span[1]) : '' };
  }
}

/** Bir dosyanın dışa verdiği adlar (export * zinciri dahil). */
function exportsOf(file, seen = new Set()) {
  if (cache.has(file)) return cache.get(file);
  if (seen.has(file) || !existsSync(file)) return new Set();
  seen.add(file);
  const raw = readFileSync(file, 'utf8');
  const code = blankNonCode(raw);
  const out = new Set();
  for (const m of code.matchAll(/\bexport\s+(?:async\s+)?(?:const|let|var|function\s*\*?|class)\s+([\p{L}_$][\p{L}\p{N}_$]*)/gu)) out.add(m[1]);
  for (const m of code.matchAll(/\bexport\s+(?:const|let|var)\s*[{[]([^}\]]*)[}\]]/g)) {
    for (const p of m[1].split(',')) { const t = p.trim().split(':').pop().split('=')[0].trim(); if (/^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(t)) out.add(t); }
  }
  for (const m of code.matchAll(/\bexport\s*\{([^}]*)\}(?!\s*from)/g)) {
    for (const p of m[1].split(',')) { const t = p.trim().split(/\s+as\s+/).pop().trim(); if (t) out.add(t); }
  }
  for (const { m } of matchWithRaw(EXPORT_FROM_RE, code, raw, 2)) {
    for (const p of m[1].split(',')) { const t = p.trim().split(/\s+as\s+/).pop().trim(); if (t) out.add(t); }
  }
  for (const { text: spec } of matchWithRaw(EXPORT_STAR_RE, code, raw, 1)) {
    if (spec.startsWith('.')) for (const n of exportsOf(resolve(dirname(file), spec), seen)) out.add(n);
    else out.add('*paket*'); // paketten yeniden dışa verme: denetlenemez
  }
  if (/\bexport\s+default\b/.test(code)) out.add('default');
  cache.set(file, out);
  return out;
}

let bad = 0;
let seenImports = 0;
const files = process.argv.slice(2);
if (!files.length) { console.error('kullanım: node tools/export_check.mjs <dosyalar>'); process.exit(2); }
for (const f of files) {
  const raw = readFileSync(f, 'utf8');
  const code = blankNonCode(raw);
  for (const { m, text: spec } of matchWithRaw(IMPORT_RE, code, raw, 2)) {
    seenImports++;
    if (!spec.startsWith('.')) continue;
    const target = resolve(dirname(f), spec);
    if (!existsSync(target)) { console.log(`${f}: EKSİK DOSYA "${spec}"`); bad++; continue; }
    const have = exportsOf(target);
    if (have.has('*paket*')) continue; // zincirde paket var, kesin konuşamayız
    const br = m[1].match(/\{([\s\S]*?)\}/);
    if (!br) continue;
    for (const p of br[1].split(',')) {
      const name = p.trim().split(/\s+as\s+/)[0].trim();
      if (!name || name === 'default') continue;
      if (!have.has(name)) { console.log(`${f}: "${name}" ${spec} içinde dışa verilmiyor → sunucu AÇILMAZ`); bad++; }
    }
  }
}
// Hiç import görmemek, "hata yok" değil "araç bozuk" demektir: sessiz kaçırmaya karşı.
if (!seenImports) { console.error('HATA: hiçbir import okunamadı — araç bozuk, sonucuna güvenmeyin.'); process.exit(2); }
console.log(bad ? `\n${bad} eksik dışa verim.` : `tüm içe aktarımlar karşılığını buluyor (${seenImports} import okundu)`);
process.exit(bad ? 1 : 0);
