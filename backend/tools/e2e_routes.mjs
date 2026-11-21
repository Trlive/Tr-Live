#!/usr/bin/env node
// E2E testlerinin çağırdığı HER adresin sunucuda GERÇEKTEN var olduğunu denetler.
//
// NEDEN: route_map.mjs "taşımada adres kayboldu mu?" sorusuna bakar; adresin DOĞRU
// yazıldığına bakmaz. Bir test `/api/gifts/global` çağırıyordu, gerçek adres
// `/api/gifts/global/recent` idi. Sunucu 404 "Adres bulunamadı" döndü. Testi yazarken
// çalıştırmamıştım; hata ancak CI'da, hem de başka hatalar temizlendikten SONRA göründü.
// Node test koşucusu ilk hatada o testi bırakır, bu yüzden hatalar sırayla çıkar:
// her tur bir tane. Bu araç hepsini BİR KEREDE gösterir.
//
// Ne yapar: app.js'ten başlayıp router bağlamalarını (iç içe olanlar dahil) izleyerek
// TAM adres listesini çıkarır, sonra e2e'deki api(...) çağrılarını bu listeyle eşler.
//
// Ne yapamaz: yöntem/yol doğru ama gövde ya da yetki yanlışsa göremez. Yalnızca "böyle
// bir adres var mı?" sorusunu yanıtlar.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { blankNonCode } from './free_idents.mjs';

const SRC = new URL('../src/', import.meta.url).pathname;
const APP = resolve(SRC, 'app.js');
const E2E = new URL('../e2e/api.e2e.js', import.meta.url).pathname;

const METHODS = 'get|post|put|patch|delete|all';

/** Desen silinmiş metinde aranır, dize içeriği ham kaynaktan aynı konumdan okunur. */
function* withRaw(re, code, raw, groups) {
  for (const m of code.matchAll(re)) {
    const texts = {};
    for (const g of groups) { const s = m.indices[g]; texts[g] = s ? raw.slice(s[0], s[1]) : ''; }
    yield { m, texts };
  }
}

/** Bir dosyadaki `import { router as X } from './y.js'` eşlemesi.
 *
 * DIŞA VERİLEN AD da saklanır. Bir dosya birden çok router verebilir
 * (`export const router` uygulama için, `export const adminRouter` panel için);
 * hangisinin bağlandığını bilmezsek ikisinin de adreslerini aynı önekin altına
 * yazarız ve `/api/admin/sdui/v2/...` gibi var olmayan adresler üretiriz.
 */
function routerImports(code, raw, file) {
  const out = new Map();
  const re = /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]*)['"]/gd;
  for (const { m, texts } of withRaw(re, code, raw, [2])) {
    const spec = texts[2];
    if (!spec.startsWith('.')) continue;
    const target = resolve(dirname(file), spec);
    for (const part of m[1].split(',')) {
      const t = part.trim();
      const as = t.split(/\s+as\s+/);
      const local = (as[1] ?? as[0]).trim();
      const orig = as[0].trim();
      if (orig === 'router' || /router$/i.test(local)) out.set(local, { file: target, exportName: orig });
    }
  }
  return out;
}

const seen = new Set();
const routes = []; // { method, path }

function collect(file, prefix, holder = 'router') {
  const key = `${file}|${prefix}|${holder}`;
  if (seen.has(key) || !existsSync(file)) return;
  seen.add(key);
  const raw = readFileSync(file, 'utf8');
  const code = blankNonCode(raw);
  const imports = routerImports(code, raw, file);

  // Argüman listesini dengeli parantezle al: bir çağrıda birden çok router olabilir
  // (`app.use('/api/auth', araKatman, authRouter, authSocialRouter)` — eskiden yalnızca
  // ilk ad bakılıyordu, o da ara katman olduğu için auth adreslerinin hiçbiri görülmüyordu).
  const argsAt = (open) => {
    let d = 0;
    for (let i = open; i < code.length; i++) {
      if (code[i] === '(') d++;
      else if (code[i] === ')') { d--; if (d === 0) return [open + 1, i]; }
    }
    return [open + 1, code.length];
  };
  /** Argüman aralığındaki dize sabitleri (içerik ham kaynaktan). */
  const strings = (a, b) => {
    const out = [];
    for (const mm of code.slice(a, b).matchAll(/(['"`])([^'"`]*)\1/gd)) {
      out.push(raw.slice(a + mm.indices[2][0], a + mm.indices[2][1]));
    }
    return out;
  };

  // router.use([ '<p>', ] handler..., subRouter...)
  for (const m of code.matchAll(/\b([A-Za-z_$][\w$]*)\.use\(/g)) {
    const owner = m[1];
    // Yalnızca BAĞLANAN router'ın kendi bağlamaları izlenir.
    if (owner !== holder && owner !== 'app') continue;
    const [a, b] = argsAt(m.index + m[0].length - 1);
    const args = code.slice(a, b);
    // Önek yalnızca İLK argüman dize ise geçerlidir.
    const lead = args.match(/^\s*(['"`])([^'"`]*)\1/d);
    const p = lead ? raw.slice(a + lead.indices[2][0], a + lead.indices[2][1]) : '';
    for (const idm of args.matchAll(/[A-Za-z_$][\w$]*/g)) {
      const target = imports.get(idm[0]);
      if (target) collect(target.file, prefix + p, target.exportName);
    }
  }

  // router.get('/yol', ...)  ·  app.get(['/health', '/api/health'], ...)
  const callRe = new RegExp(String.raw`\b([A-Za-z_$][\w$]*)\.(${METHODS})\(`, 'g');
  for (const m of code.matchAll(callRe)) {
    const owner = m[1];
    // Yalnızca BAĞLANAN router'a takılan adresler sayılır; aynı dosyadaki öteki
    // router'ın adresleri bu önekin altında DEĞİLDİR.
    if (owner !== holder && owner !== 'app') continue;
    const [a, b] = argsAt(m.index + m[0].length - 1);
    const args = code.slice(a, b);
    // İlk argüman dizi ise içindeki TÜM yollar; değilse yalnızca ilk dize.
    const arr = args.match(/^\s*\[[^\]]*\]/);
    const paths = arr ? strings(a + args.indexOf('['), a + args.indexOf('[') + arr[0].trim().length) : strings(a, b).slice(0, 1);
    for (const path of paths) {
      if (!path.startsWith('/')) continue;
      routes.push({ method: m[2].toUpperCase(), path: (prefix + path).replace(/\/+$/, '') || '/' });
    }
  }
}

collect(APP, '');

/** Adres desenini eşleştirici düzenli ifadeye çevirir (:param tek parça, * her şey). */
function toRe(path) {
  const body = path
    .split('/')
    .map((seg) => {
      if (seg.startsWith(':')) return '[^/]+';
      if (seg === '*' || seg === '{*splat}') return '.*';
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return new RegExp(`^${body}$`);
}
const compiled = routes.map((r) => ({ ...r, re: toRe(r.path) }));

// --dump: tüm adresleri yaz (hata ayıklama)
if (process.argv.includes('--dump')) {
  for (const r of compiled.sort((a, b) => a.path.localeCompare(b.path))) console.log(`${r.method} ${r.path}`);
  process.exit(0);
}

// ---- e2e çağrıları ----
const raw = readFileSync(E2E, 'utf8');
const code = blankNonCode(raw);
// api('GET', `/api/rooms/${id}/members`) · api('POST', '/api/auth/login', ...)
// DİKKAT: blankNonCode dize İÇERİĞİNİ siler, tırnakları bırakır. Bu yüzden desen
// içerikle değil YAPIYLA eşleşmeli ([^'"`]* ), içerik ham kaynaktan okunmalı.
// Önce ([A-Z]+) yazmıştım: silinmiş metinde hiçbir çağrı görünmedi ve araç
// "hata yok" değil "bozuğum" dedi — o korumanın tek işi buydu.
const apiRe = /\bapi\(\s*(['"`])([^'"`]*)\1\s*,\s*(['"`])([^'"`]*)\3/gd;
const calls = [];
for (const { m, texts } of withRaw(apiRe, code, raw, [2, 4])) {
  const line = raw.slice(0, m.index).split('\n').length;
  const method = texts[2].trim();
  if (!/^[A-Z]+$/.test(method)) continue;
  calls.push({ method, path: texts[4], line });
}

if (process.argv.includes('--calls')) {
  for (const c of calls) console.log(`${c.line}\t${c.method}\t${c.path}`);
  process.exit(0);
}

let bad = 0;
const reported = new Set();
for (const c of calls) {
  // `${...}` → tek parça yer tutucu; sorgu dizesi atılır
  const path = c.path.replace(/\$\{[^}]*\}/g, 'X').split('?')[0].replace(/\/+$/, '') || '/';
  if (!path.startsWith('/')) continue; // değişkenle başlayan adres: çözülemez, atlanır
  const hit = compiled.some((r) => r.method === c.method && r.re.test(path));
  if (hit) continue;
  const key = `${c.method} ${path}`;
  if (reported.has(key)) continue;
  reported.add(key);
  const near = compiled.filter((r) => r.path.startsWith(path.split('/').slice(0, 4).join('/'))).slice(0, 3);
  console.log(`e2e/api.e2e.js:${c.line}: ADRES YOK → ${c.method} ${c.path}`);
  if (near.length) console.log(`    yakın adresler: ${near.map((r) => `${r.method} ${r.path}`).join(' · ')}`);
  bad++;
}

// Hiç çağrı okunamadıysa araç bozuktur; "hata yok" demek yanıltıcı olur.
if (!calls.length) { console.error('HATA: e2e içinde hiçbir api(...) çağrısı okunamadı — araç bozuk.'); process.exit(2); }
console.log(bad
  ? `\n${bad} adres sunucuda yok. Bu testler HTTP 404 "Adres bulunamadı" ile kırılır.`
  : `tüm e2e adresleri karşılığını buluyor (${calls.length} çağrı, ${routes.length} adres)`);
process.exit(bad ? 1 : 0);
