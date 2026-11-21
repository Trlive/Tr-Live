#!/usr/bin/env node
// Öneksiz bağlanan bir router'da `use(araKatman)` yazılmasını yakalar.
//
// NEDEN — v2.148.0'da canlıyı kilitleyecek hata tam buydu:
//
//   // sdui_v2.routes.js
//   export const adminRouter = Router();
//   adminRouter.use(requireSuperAdmin);   // ← tek satır
//
//   // admin.routes.js
//   router.use(sduiV2AdminRouter);        // ← YOL ÖNEKİ YOK
//
// Express'te öneksiz bağlanan router'ın `use()` ara katmanı, o router'ın kendi adreslerine
// değil ÜST router'a gelen HER isteğe uygulanır. Ara katman next(hata) derse istek öteki
// adreslere hiç ulaşamaz. Sonuç: yardımcı adminler panelin TAMAMINDAN kilitlendi; kullanıcı
// aramak bile 403 döndü. CI'da bu "arama → HTTP 403" diye göründü, sebebi SDUI'ydi — yani
// hatanın göründüğü yer ile olduğu yer alakasızdı. Bu tür hatayı elle bulmak çok pahalı.
//
// KURAL: Yol öneki olmadan bağlanan bir router, yol öneki olmayan `use()` ÇAĞIRAMAZ.
// Yetki her adrese ayrı ayrı yazılır. Önekle bağlanan router'lar (app.use('/api/admin', r))
// serbesttir — oradaki `use()` zaten o önekle sınırlıdır.
//
// BU ARACIN GÖREMEDİĞİ: ara katmanın ne yaptığı. next() çağıran zararsız bir ara katman da
// bildirilir; yanlış alarm değil, "burada yazma" kuralının kendisidir.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { blankNonCode } from './free_idents.mjs';

const SRC = new URL('../src/', import.meta.url).pathname;
const APP = resolve(SRC, 'app.js');

/** Desen silinmiş metinde aranır, dize içeriği ham kaynaktan aynı konumdan okunur. */
function* withRaw(re, code, raw, groups) {
  for (const m of code.matchAll(re)) {
    const texts = {};
    for (const g of groups) { const s = m.indices[g]; texts[g] = s ? raw.slice(s[0], s[1]) : ''; }
    yield { m, texts };
  }
}

function routerImports(code, raw, file) {
  const out = new Map();
  for (const { m, texts } of withRaw(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]*)['"]/gd, code, raw, [2])) {
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

const argsAt = (code, open) => {
  let d = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '(') d++;
    else if (code[i] === ')') { d--; if (d === 0) return [open + 1, i]; }
  }
  return [open + 1, code.length];
};

// (dosya, dışaVerilenAd) → öneksiz mi bağlandı?
const mountedBare = new Map();
const seen = new Set();

function walkMounts(file, holder, bare) {
  const key = `${file}|${holder}|${bare}`;
  if (seen.has(key) || !existsSync(file)) return;
  seen.add(key);
  if (bare) mountedBare.set(`${file}|${holder}`, true);
  else if (!mountedBare.has(`${file}|${holder}`)) mountedBare.set(`${file}|${holder}`, false);

  const raw = readFileSync(file, 'utf8');
  const code = blankNonCode(raw);
  const imports = routerImports(code, raw, file);
  for (const m of code.matchAll(/\b([A-Za-z_$][\w$]*)\.use\(/g)) {
    const owner = m[1];
    if (owner !== holder && owner !== 'app') continue;
    const [a, b] = argsAt(code, m.index + m[0].length - 1);
    const args = code.slice(a, b);
    const lead = args.match(/^\s*(['"`])([^'"`]*)\1/d);
    const prefix = lead ? raw.slice(a + lead.indices[2][0], a + lead.indices[2][1]) : null;
    for (const idm of args.matchAll(/[A-Za-z_$][\w$]*/g)) {
      const target = imports.get(idm[0]);
      // Önek varsa alt router o önekle sınırlanır: `use()` sızması olmaz.
      if (target) walkMounts(target.file, target.exportName, prefix === null || prefix === '/');
    }
  }
}

walkMounts(APP, 'router', false);

let bad = 0;
let checked = 0;
for (const [key, bare] of mountedBare) {
  checked++;
  if (!bare) continue;
  const [file, holder] = key.split('|');
  if (!existsSync(file)) continue;
  const raw = readFileSync(file, 'utf8');
  const code = blankNonCode(raw);
  for (const m of code.matchAll(new RegExp(String.raw`\b${holder}\.use\(`, 'g'))) {
    const [a, b] = argsAt(code, m.index + m[0].length - 1);
    const args = code.slice(a, b).trim();
    // Yol öneki varsa sorun yok: o `use()` zaten o yolla sınırlı.
    if (/^(['"`])/.test(args)) continue;
    const line = raw.slice(0, m.index).split('\n').length;
    console.log(
      `${relative(SRC, file)}:${line}: "${holder}.use(...)" — bu router ÖNEKSİZ bağlanıyor, `
      + 'bu ara katman ÜST router\'a gelen her isteğe uygulanır. Yetkiyi her adrese ayrı yazın.',
    );
    bad++;
  }
}

if (!checked) { console.error('HATA: hiçbir router bağlaması okunamadı — araç bozuk.'); process.exit(2); }
console.log(bad
  ? `\n${bad} sızan ara katman. Bu, alakasız uçlarda 403/500 olarak görünür.`
  : `router kapsamları doğru (${checked} bağlama denetlendi)`);
process.exit(bad ? 1 : 0);
