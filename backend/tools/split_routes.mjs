#!/usr/bin/env node
// Büyük bir rota dosyasını konularına böler. KOD DEĞİŞTİRMEZ.
//
//   node tools/split_routes.mjs <dosya> <ad:ilkSatır> <ad:ilkSatır> ...
//   node tools/split_routes.mjs src/modules/rooms/rooms.routes.js mic:751 moderation:910 scoreboard:1120
//
// Ne yapar:
//   1. Dosyayı üst düzey bloklara ayırır: import'lar, bildirimler (const/function/...), rota kayıtları.
//   2. Tüm import'ları ve bildirimleri `<ad>.shared.js`'e alır ve hepsini dışa açar — böylece alt
//      dosyalar aynı paketi on ayrı yerden import etmez.
//   3. Rota kayıtlarını verilen satır sınırlarına göre alt dosyalara dağıtır; her alt dosya kendi
//      Router'ını kurar.
//   4. Ana dosya alt router'ları **ön ek olmadan** bağlar: API adresleri birebir aynı kalır.
//
// Bölmeden sonra `node tools/route_map.mjs` aynı sonucu vermelidir — vermezse bölme hatalıdır.
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const [file, ...specs] = process.argv.slice(2);
if (!file || !specs.length) {
  console.error('kullanim: node tools/split_routes.mjs <dosya> <ad:satir> [<ad:satir> ...]');
  process.exit(1);
}
const cuts = specs.map((s) => { const [n, l] = s.split(':'); return { name: n, line: Number(l) }; })
  .sort((a, b) => a.line - b.line);

const L = readFileSync(file, 'utf8').split('\n');
const START = /^(import\s|export\s+(const|let|var|function|async|class)\s|const\s|let\s|var\s|function\s|async\s+function\s|class\s|router\.|[A-Za-z_$][\w$]*Router\.)/;
const starts = L.map((l, i) => (START.test(l) ? i : -1)).filter((i) => i >= 0);

const imports = [];
const decls = [];
const routes = [];
for (let k = 0; k < starts.length; k++) {
  const i = starts[k];
  const j = k + 1 < starts.length ? starts[k + 1] : L.length;
  let b = i;
  while (b - 1 >= 0 && L[b - 1].trimStart().startsWith('//') && !starts.includes(b - 1)) b--;
  const txt = L.slice(b, j).join('\n').replace(/\s+$/, '');
  if (L[i].startsWith('import ')) imports.push(txt);
  else if (/^(router|[A-Za-z_$][\w$]*Router)\./.test(L[i])) routes.push({ line: i + 1, txt });
  else decls.push({ line: i + 1, txt });
}

// Bir isim listesi çıkar: import edilen + bildirilen her şey (alt dosyalar bunları shared'dan alır)
const importedNames = [];
for (const t of imports) {
  const m = t.replace(/\n/g, ' ').match(/^import\s+(.*?)\s+from/);
  if (!m) continue;
  const spec = m[1];
  const br = spec.match(/\{([^}]*)\}/);
  if (br) for (const p of br[1].split(',')) { const n = p.trim().split(/\s+as\s+/).pop().trim(); if (n) importedNames.push(n); }
  const lead = spec.replace(/\{[^}]*\}/, '').replace(/,/g, ' ').trim();
  for (const n of lead.split(/\s+/)) if (n && n !== '*' && n !== 'as') importedNames.push(n);
}

const declNames = [];
const sharedDecls = [];
for (const { txt } of decls) {
  const first = txt.split('\n').find((l) => /^(export\s|const\s|let\s|var\s|function\s|async\s|class\s)/.test(l));
  if (!first) { sharedDecls.push(txt); continue; }
  const m = first.match(/^(?:export\s+)?(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/)
         || first.match(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/);
  const name = m && m[1];
  if (name === 'router') continue; // alt dosyalar kendi Router'ını kurar
  if (name) {
    declNames.push(name);
    sharedDecls.push(first.startsWith('export') ? txt : txt.replace(first, 'export ' + first));
  } else sharedDecls.push(txt);
}

const dir = dirname(file);
const stem = basename(file).replace(/\.routes\.js$/, '');
const sharedFile = join(dir, `${stem}.shared.js`);
const allNames = [...new Set([...importedNames, ...declNames])].filter((n) => n !== 'Router' && n !== 'router');

writeFileSync(sharedFile, `// ${stem} modülünün ortak parçaları: import'lar, yardımcılar ve sabitler.
//
// ${basename(file)} konularına bölündü (${cuts.map((c) => c.name).join(', ')}). Bölme sırasında KOD
// DEĞİŞTİRİLMEDİ; ortak bildirimler buraya alınıp dışa açıldı. API yüzeyi aynı — adres haritası
// testi (test/route_map.test.js) bunu doğrular.
${imports.join('\n')}

${sharedDecls.join('\n\n')}

// Alt rota dosyaları tek elden import eder: aynı paketi her dosyada ayrı ayrı import etmek yerine
// ortak kapı. Adlar bölmeden önceki ile birebir aynı.
export { ${[...new Set(importedNames)].sort().join(', ')} };
`);

const pick = (line) => {
  let name = 'core';
  for (const c of cuts) if (line >= c.line) name = c.name;
  return name;
};
const groups = {};
for (const r of routes) (groups[pick(r.line)] ||= []).push(r.txt);

const sharedImport = (body) => {
  const used = allNames.filter((n) => new RegExp(`(?<![\\w$.])${n.replace(/\$/g, '\\$')}(?![\\w$])`).test(body)).sort();
  return used.length ? `import { ${used.join(', ')} } from './${stem}.shared.js';\n` : '';
};

const subs = [];
for (const [name, list] of Object.entries(groups)) {
  if (name === 'core') continue;
  const body = list.join('\n\n');
  writeFileSync(join(dir, `${stem}_${name}.routes.js`),
    `// ${stem} — ${name}. Ortak yardımcılar: ${stem}.shared.js\nimport { Router } from 'express';\n${sharedImport(body)}\nexport const router = Router();\n\n${body}\n`);
  subs.push(name);
}

const core = (groups.core || []).join('\n\n');
writeFileSync(file, `// ${stem} modülünün rota girişi.
//
// Dosya ${L.length} satırdı; konularına bölündü. Burada yalnızca ortak ara katmanlar ve alt
// router'ların bağlanması var. Alt router'lar **ön ek olmadan** bağlanır: adresler değişmez.
//
// Alt dosyalar: ${subs.map((s) => `${stem}_${s}.routes.js`).join(', ')}
import { Router } from 'express';
${sharedImport(core)}${subs.map((s) => `import { router as ${s}Router } from './${stem}_${s}.routes.js';`).join('\n')}

export const router = Router();

${core}

${subs.map((s) => `router.use(${s}Router);`).join('\n')}
`);

console.log(`${basename(file)}: ${routes.length} rota -> ${subs.length + 1} dosya (${subs.join(', ')}) + ${stem}.shared.js`);
