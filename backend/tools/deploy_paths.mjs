#!/usr/bin/env node
// Dağıtım dosyalarındaki DOSYA YOLLARININ gerçekten var olduğunu doğrular.
//
// ## Niçin yazıldı
//
// Modüllere ayırma sırasında `src/migration_runner.js` taşındı. `backend/Dockerfile` açılışta
// hâlâ o yolu çağırıyordu:
//
//     CMD ["sh", "-c", "node src/migration_runner.js && exec node src/server.js"]
//
// Yani kapsayıcı bir sonraki dağıtımda **hiç açılmayacaktı** — sunucu düşecek, sebebi
// migration'da aranacaktı.
//
// Bunu hiçbir kontrol yakalamadı:
//
// * `imports.mjs` yalnızca ES `import` ifadelerine bakar, dizelerin içindeki yollara değil.
// * `route_map.mjs` kaynaktaki rotaları sayar, dosya varlığını denetlemez.
// * Birim testleri sunucuyu açmaz.
// * e2e sunucuyu açar ama Dockerfile'ı hiç çalıştırmaz.
//
// Kör nokta tam burasıydı: **kodun dışındaki dosyalarda yazan yollar.** Aynı kör nokta
// `src/pages/tek.html`'de de vardı (o, kodun içindeydi ama `new URL()` dizesiydi).
//
// `npm run check` içinden çalışır, yani her CI koşusunda.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../', import.meta.url).pathname.replace(/\/$/, '');
const REPO = join(ROOT, '..');

// Taranan dosyalar ve içlerinde yol aranacak desenler.
const TARGETS = [
  { file: join(ROOT, 'Dockerfile'), base: ROOT },
  { file: join(ROOT, 'package.json'), base: ROOT },
];

// node/sh komutlarında geçen .js/.mjs yolları ve new URL('...') içindeki varlık dosyaları.
const CMD_PATH = /(?:^|[\s"'`])((?:src|scripts|e2e|tools)\/[A-Za-z0-9_@./-]+\.(?:m?js|cjs))/g;
const URL_ASSET = /new URL\(\s*['"]([^'"]+\.(?:html|json|txt|svg|css))['"]\s*,\s*import\.meta\.url\s*\)/g;

const problems = [];

// 1) Dağıtım dosyalarındaki komut yolları
for (const { file, base } of TARGETS) {
  if (!existsSync(file)) continue;
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(CMD_PATH)) {
    const p = m[1];
    if (!existsSync(join(base, p))) problems.push(`${file.replace(REPO + '/', '')}: "${p}" yok`);
  }
}

// 2) Kaynaktaki new URL(...) varlık yolları — bunlar import değildir, derleyici de görmez.
//    Yalnızca dosya çalıştığında patlar; sunucu açılışındaysa sunucu hiç açılmaz.
import { readdirSync, statSync } from 'node:fs';
function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules') continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.m?js$/.test(p)) out.push(p);
  }
  return out;
}
for (const f of walk(join(ROOT, 'src'))) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(URL_ASSET)) {
    const abs = new URL(m[1], `file://${f}`).pathname;
    if (!existsSync(abs)) problems.push(`${f.replace(REPO + '/', '')}: new URL("${m[1]}") yok`);
  }
}

if (problems.length) {
  console.error('Dağıtım yolu hatası:\n' + problems.map((p) => '  - ' + p).join('\n'));
  console.error('\nBu yollar kodun dışında ya da dize içinde olduğu için import denetimine takılmaz;');
  console.error('düzeltilmezse sunucu açılışta durur.');
  process.exit(1);
}
console.log(`dağıtım yolları: tamam`);
