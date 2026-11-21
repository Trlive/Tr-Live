// Serbest (tanımsız) ad denetimi — gerçek bir tarayıcı ile.
//
// NEDEN: Dosya bölme sırasında "kullanılıyor ama import edilmemiş" adlar kaldı
// (ör. rooms.routes.js içinde profileJson). Bunlar derlemede değil, O UCA İSTEK
// GELDİĞİNDE ReferenceError olarak patlar: kullanıcı "Sunucu hatası" görür.
// Birim testleri bu yolu çağırmadığı için sessiz kalır.
//
// ESKİ ARACIN HATASI (tools/unresolved_refs.mjs): dizeleri önce, yorumları sonra
// siliyordu. Türkçe yorumlardaki kesme işareti ("anahtarı'nın") dize başlangıcı
// sanılıp sonrasını bozuyordu; ayrıca tanımlayıcı deseni ASCII idi, "işlem" gibi
// adlar parçalanıyordu. Sonuç: 3591 yanlış alarm, yani kullanılmaz bir araç.
//
// BU ARAÇ NE YAPAMAZ (bilerek):
// - Kapsam (scope) takibi yok. Dosyanın HERHANGİ bir yerinde tanımlanan ad
//   "tanımlı" sayılır. Bu, hata KAÇIRMAYA yol açar, yanlış alarma değil.
//   Güvenlik ağında yanlış alarm, ağın kendisinden daha zararlıdır.
// - Çalışma zamanı davranışını (null, tip, SQL) görmez.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const GLOBALS = new Set([
  'console', 'process', 'JSON', 'Math', 'Date', 'Object', 'Array', 'String', 'Number', 'Boolean', 'BigInt',
  'Promise', 'Error', 'TypeError', 'RangeError', 'SyntaxError', 'Map', 'Set', 'WeakMap', 'WeakSet', 'RegExp',
  'Buffer', 'URL', 'URLSearchParams', 'TextEncoder', 'TextDecoder', 'globalThis', 'undefined', 'NaN', 'Infinity',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'setImmediate', 'queueMicrotask', 'fetch',
  'Headers', 'Request', 'Response', 'FormData', 'Blob', 'AbortController', 'AbortSignal', 'Symbol', 'Proxy',
  'Reflect', 'Intl', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent',
  'encodeURI', 'decodeURI', 'structuredClone', 'performance', 'crypto', 'require', 'module', 'exports',
  '__dirname', '__filename', 'arguments', 'EventTarget', 'Event', 'MessageChannel', 'Atomics', 'SharedArrayBuffer',
  'ArrayBuffer', 'DataView', 'Uint8Array', 'Int8Array', 'Uint16Array', 'Int16Array', 'Uint32Array', 'Int32Array',
  'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array', 'Function', 'eval', 'escape', 'unescape',
]);

const KEYWORDS = new Set([
  'await', 'async', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete',
  'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'from', 'function', 'get', 'if',
  'implements', 'import', 'in', 'instanceof', 'interface', 'let', 'new', 'null', 'of', 'package', 'private',
  'protected', 'public', 'return', 'set', 'static', 'super', 'switch', 'this', 'throw', 'true', 'try',
  'typeof', 'var', 'void', 'while', 'with', 'yield', 'as', 'satisfies',
]);

const ID = /[\p{L}_$][\p{L}\p{N}_$]*/u;
const ID_G = /[\p{L}_$][\p{L}\p{N}_$]*/gu;

/**
 * Tek geçişte yorum, dize, şablon dizesi ve düzenli ifadeleri boşlukla değiştirir.
 * Şablon dizesindeki ${...} içi KOD olduğu için korunur.
 * Düzenli ifade / bölme işareti ayrımı: bir önceki anlamlı simgeye bakılır.
 */
export function blankNonCode(src) {
  // DİKKAT: src[i] UTF-16 KOD BİRİMİ ile adresler. Array.from() ise kod NOKTASI
  // üretir; emoji (vekil çift) geçen her dosyada dizin kayması olur ve silme
  // yanlış yere düşer. Bu araç ilk yazıldığında hata tam buydu: 🃏 içeren bir
  // satırdan sonraki her şey 1 karakter kaymıştı.
  const out = src.split('');
  const blank = (a, b) => { for (let i = a; i < b; i++) if (out[i] !== '\n') out[i] = ' '; };
  let i = 0;
  let prev = ''; // bir önceki anlamlı karakter ya da sözcük
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === '/' && c2 === '/') { let j = i; while (j < n && src[j] !== '\n') j++; blank(i, j); i = j; continue; }
    if (c === '/' && c2 === '*') { let j = src.indexOf('*/', i + 2); j = j < 0 ? n : j + 2; blank(i, j); i = j; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c) { if (src[j] === '\\') j++; if (src[j] === '\n') break; j++; }
      // Tırnakların KENDİSİ korunur: export_check.mjs modül yolunu ('./x.js')
      // bu tırnaklardan bulup aynı konumdan ham kaynaktan okuyor. Tırnakları da
      // silince hiçbir import görünmez olmuştu.
      blank(i + 1, Math.min(j, n)); i = Math.min(j + 1, n); prev = 'x'; continue;
    }
    if (c === '`') {
      // Şablon dizesi: dize parçaları silinir, ${ } içi KOD olduğu için
      // ÖZYİNELEMELİ olarak aynı işlemden geçirilir. (İç içe dize ve şablonlar:
      // `... ${x ? 'ASC' : `${y}`} ...` — eskiden 'ASC' kod sanılıyordu.)
      let j = i + 1; let seg = i + 1;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '`') break;
        if (src[j] === '$' && src[j + 1] === '{') {
          blank(seg, j); // dize parçası
          const exprStart = j + 2;
          let k = exprStart; let brace = 1;
          while (k < n && brace > 0) {
            const ch = src[k];
            if (ch === '{') brace++;
            else if (ch === '}') brace--;
            else if (ch === '`' || ch === '"' || ch === "'") {
              // iç içe dize: özyinelemeli çağrı hallediyor, burada yalnızca atlanır
              const q = ch; k++;
              while (k < n && src[k] !== q) { if (src[k] === '\\') k++; k++; }
            }
            if (brace > 0) k++;
          }
          const inner = blankNonCode(src.slice(exprStart, k));
          for (let t = 0; t < inner.length; t++) out[exprStart + t] = inner[t];
          out[j] = ' '; out[j + 1] = ' '; // ${
          if (k < n) out[k] = ' ';        // }
          j = k + 1; seg = j; continue;
        }
        j++;
      }
      blank(seg, Math.min(j, n));
      if (i < n) out[i] = ' ';
      if (j < n) out[j] = ' ';
      i = Math.min(j + 1, n); prev = 'x'; continue;
    }
    if (c === '/') {
      // Düzenli ifade mi, bölme mi? Önceki anlamlı simge değer bitiriyorsa bölmedir.
      const isRegex = !(prev === 'x' || prev === ')' || prev === ']');
      if (isRegex) {
        let j = i + 1; let cls = false; let okEnd = false;
        while (j < n) {
          const k = src[j];
          if (k === '\\') { j += 2; continue; }
          if (k === '\n') break;
          if (k === '[') cls = true;
          else if (k === ']') cls = false;
          else if (k === '/' && !cls) { okEnd = true; break; }
          j++;
        }
        if (okEnd) { while (j + 1 < n && /[dgimsuvy]/.test(src[j + 1])) j++; blank(i, j + 1); i = j + 1; prev = 'x'; continue; }
      }
      i++; prev = '/'; continue;
    }
    if (/\s/.test(c)) { i++; continue; }
    if (ID.test(c)) {
      let j = i; while (j < n && ID.test(src[j])) j++;
      const word = src.slice(i, j);
      // `return /re/` gibi durumlar için anahtar sözcükler değer bitirmez.
      prev = KEYWORDS.has(word) && word !== 'this' && word !== 'super' && word !== 'true' && word !== 'false' && word !== 'null' ? word : 'x';
      i = j; continue;
    }
    prev = c; i++;
  }
  return out.join('');
}

/** Bir bağlama deseninden (destructuring dahil) tanımlanan adları toplar. */
function bindingNames(pattern, into) {
  // { a, b: c, d = 1, ...e } ve [a, , b] desenleri
  const s = pattern;
  // "x:" şeklindeki ANAHTARLARI at, değerleri al.
  const cleaned = s.replace(/([\p{L}_$][\p{L}\p{N}_$]*)\s*:/gu, ' ');
  for (const m of cleaned.matchAll(ID_G)) if (!KEYWORDS.has(m[0])) into.add(m[0]);
}

/** Tek bir bildirim parçasından ("x = 1", "{a, b} = o", "[p] = q") bağlanan adları alır. */
function takeDecl(seg, into) {
  const head = seg.split('=')[0].trim();
  if (!head) return;
  if (head[0] === '{' || head[0] === '[') bindingNames(head, into);
  else { const w = head.match(ID); if (w) into.add(w[0]); }
}

/** Dengeli parantez içeriğini döndürür (açılış indeksinden). */
function balanced(src, start, open, close) {
  let d = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === open) d++;
    else if (src[i] === close) { d--; if (d === 0) return src.slice(start + 1, i); }
  }
  return '';
}

function definedNames(code, raw) {
  const def = new Set();
  // import bağlamaları — ham kaynaktan (kod içinde de duruyor ama güvence olsun)
  for (const m of raw.matchAll(/import\s+([\s\S]*?)\s+from\s*['"]/g)) {
    const spec = m[1];
    const br = spec.match(/\{([\s\S]*?)\}/);
    if (br) for (const p of br[1].split(',')) { const t = p.trim().split(/\s+as\s+/).pop().trim(); if (t) def.add(t); }
    const lead = spec.replace(/\{[\s\S]*?\}/, '').replace(/,/g, ' ').trim();
    const parts = lead.split(/\s+/).filter(Boolean);
    for (let k = 0; k < parts.length; k++) {
      if (parts[k] === '*' ) { if (parts[k + 1] === 'as' && parts[k + 2]) def.add(parts[k + 2]); k += 2; continue; }
      if (parts[k] === 'as') continue;
      def.add(parts[k]);
    }
  }
  // const/let/var: desen de olabilir ve VİRGÜLLE birden çok ad tanımlanabilir
  // (`const sets = [], vals = [key];` — eskiden yalnızca ilki alınıyordu).
  for (const m of code.matchAll(/\b(?:const|let|var)\s+/g)) {
    let at = m.index + m[0].length;
    let depth = 0;
    let segStart = at;
    for (let i = at; i <= code.length; i++) {
      const c = code[i];
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') { if (depth === 0) { takeDecl(code.slice(segStart, i), def); segStart = -1; break; } depth--; }
      if (depth === 0 && (c === ';' || c === undefined || (c === ',' ))) {
        takeDecl(code.slice(segStart, i), def);
        if (c !== ',') { segStart = -1; break; }
        segStart = i + 1;
      }
    }
  }
  // Sınıf ve nesne kısayol metotları: list() {} · async profile(a,b) {} · constructor() {}
  // Parametrelerde iç içe parantez olabilir (`hit(key, now = Date.now()) {`),
  // bu yüzden desenle değil dengeli parantezle okunur.
  for (const m of code.matchAll(/(?:^|[{};,]|\basync\b|\bstatic\b|\bget\b|\bset\b|\*)\s*(#?[\p{L}_$][\p{L}\p{N}_$]*)\s*\(/gmu)) {
    const open = m.index + m[0].length - 1;
    const args = balanced(code, open, '(', ')');
    const rest = code.slice(open + args.length + 2);
    if (!/^\s*\{/.test(rest)) continue;
    // `if (...) {`, `for (...) {`, `catch (...) {` metot değildir.
    if (KEYWORDS.has(m[1])) continue;
    def.add(m[1].replace(/^#/, ''));
    def.add(m[1]);
    bindingNames(args, def);
  }
  // function / class adları
  for (const m of code.matchAll(/\b(?:function\s*\*?|class)\s+([\p{L}_$][\p{L}\p{N}_$]*)/gu)) def.add(m[1]);
  // catch(e)
  for (const m of code.matchAll(/\bcatch\s*\(\s*([\p{L}_$][\p{L}\p{N}_$]*)/gu)) def.add(m[1]);
  // etiketli döngü / for-of-in değişkenleri zaten const/let ile yakalanıyor.
  // Parametre listeleri. YALNIZCA ok fonksiyonu "(...) =>" ve "function (...)".
  //
  // Eskiden ")" ardından "{" gelen HER parantez parametre listesi sayılıyordu.
  // Bu, `if (profileJson) {` gibi bir satırın profileJson'u "tanımlı" yapmasına
  // yol açıyordu: araç tam da aramaya çıktığı hatayı görmez oluyordu (yanlış
  // alarmın tersi, sessiz kaçırma — daha tehlikelisi).
  for (const m of code.matchAll(/\(/g)) {
    const inner = balanced(code, m.index, '(', ')');
    const after = code.slice(m.index + inner.length + 2);
    const before = code.slice(0, m.index);
    const isArrow = /^\s*=>/.test(after);
    const isFunction = /\bfunction\s*\*?\s*[\p{L}_$][\p{L}\p{N}_$]*\s*$|\bfunction\s*\*?\s*$/u.test(before);
    if (!isArrow && !isFunction) continue;
    bindingNames(inner, def);
  }
  // tek parametreli ok fonksiyonu: x => ...
  for (const m of code.matchAll(/([\p{L}_$][\p{L}\p{N}_$]*)\s*=>/gu)) def.add(m[1]);
  return def;
}

function usedNames(code) {
  const used = new Map(); // ad -> ilk satır
  const lines = code.split('\n');
  // Çok satırlı import/export bildirimi: devam satırları da atlanmalı
  // (auth.routes.js'de import listesi 5 satırdı; 2.–5. satırlar "kullanım" sanılıyordu).
  let inDecl = false;
  for (let ln = 0; ln < lines.length; ln++) {
    let line = lines[ln];
    if (inDecl) { if (/\bfrom\b|;|\}/.test(line)) inDecl = false; continue; }
    // Yalnızca BİLDİRİM atlanır: `import ... from`, `export { ... }`, `export * from`.
    // `export const x = f(y)` satırı KODDUR; eskiden tamamı atlanıyordu ve bu
    // dosyaların çoğu böyle yazıldığı için aracın en büyük kör noktasıydı.
    if (/^\s*import\b/.test(line)) {
      if (!/\bfrom\b/.test(line) && /\{/.test(line) && !/\}/.test(line)) inDecl = true;
      continue;
    }
    if (/^\s*export\s*(\{|\*)/.test(line)) {
      if (/\{/.test(line) && !/\}/.test(line)) inDecl = true;
      continue;
    }
    // `export const/let/function/class/default ...` → "export" sözcüğünü at, gerisini tara.
    line = line.replace(/^(\s*)export\s+(default\s+)?/, (s, sp) => sp + ' '.repeat(s.length - sp.length));
    for (const m of line.matchAll(ID_G)) {
      const name = m[0];
      const before = line.slice(0, m.index);
      // özellik erişimi: .ad  ya da  ?.ad
      // özellik erişimi (.ad, ?.ad, #özel) atlanır; ama YAYMA (...ad) bir KULLANIMDIR.
      // `{ ...profileJson(p) }` tam da aradığımız hatanın bulunduğu satırdı ve
      // "..." nokta sanıldığı için görünmüyordu.
      if (/\.\.\.\s*$/.test(before)) { /* yayma: kullanım */ }
      else if (/[.#]\s*$/.test(before)) continue;
      // sayı sonu: 3600e3 → "e3", 1_000_000 → "_000" diye okunmasın
      if (/[\p{N}]$/u.test(before)) continue;
      // tek başına $ veya _ (şablon ${} kalıntısı, yer tutucu)
      if (/^[_$]+$/.test(name)) continue;
      // nesne anahtarı: ad:  (kısayol { ad } değil)
      const after = line.slice(m.index + name.length);
      if (/^\s*:/.test(after) && !/[?]\s*$/.test(before)) continue;
      // import/export satırları
      if (/^\s*(import|export)\b/.test(line)) continue;
      if (KEYWORDS.has(name)) continue;
      if (!used.has(name)) used.set(name, ln + 1);
    }
  }
  return used;
}

// Doğrudan çalıştırıldıysa komut satırı aracı; import edilirse yalnızca tarayıcıyı verir
// (export_check.mjs aynı tarayıcıyı kullanır — iki ayrı yarım tarayıcı yazmak,
// ikisinin de aynı hatayı farklı yerde yapması demekti).
const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url !== entry) { /* kütüphane olarak kullanılıyor */ } else {
let bad = 0;
const files = process.argv.slice(2);
if (!files.length) { console.error('kullanım: node tools/free_idents.mjs <dosyalar>'); process.exit(2); }
for (const f of files) {
  const raw = readFileSync(f, 'utf8');
  // Şablon dizesinin ${...} içi özyinelemeli olarak taranır (blankNonCode içinde).
  const code = blankNonCode(raw);
  const def = definedNames(code, raw);
  for (const [name, line] of usedNames(code)) {
    if (def.has(name) || GLOBALS.has(name)) continue;
    console.log(`${f}:${line}: TANIMSIZ AD "${name}"`);
    bad++;
  }
}
console.log(bad ? `\n${bad} tanımsız ad. Bunlar o uç çağrıldığında "Sunucu hatası" verir.` : 'tanımsız ad yok');
process.exit(bad ? 1 : 0);
}
