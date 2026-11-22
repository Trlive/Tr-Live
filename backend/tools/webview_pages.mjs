#!/usr/bin/env node
// WebView'e sunulan her HTML sayfasının doctype ve viewport taşıdığını denetler.
//
// NEDEN — v2.148.2'de canlıda görülen hata tam buydu:
//
// `src/pages/tek.html` bir PARÇA olarak yazılmıştı: `<!doctype html>` ve
// `<meta name="viewport">` yoktu. Sonuçları:
//
//   1) Doctype yoksa tarayıcı QUIRKS kipine düşer. Orada yüzdeli yükseklikler
//      (`html,body{height:100%}`, `.box{max-height:100%}`) beklendiği gibi çözülmez.
//   2) Viewport etiketi yoksa Android WebView sayfayı ~980 CSS piksellik SANAL bir
//      ekrana çizip küçültür. Oda üstündeki küçük pencerede bu, "sayfa ekran görünümünü
//      kaybetti" demektir: her şey minicik, oranlar bozuk, dokunmalar kayık.
//
// Aynı klasördeki `ludo.html` doğruydu; fark yalnızca bu iki satırdı ve gözle
// karşılaştırmadıkça görünmüyordu.
//
// BU ARACIN GÖREMEDİĞİ: sayfanın içeriğinin dar/alçak pencerede güzel durup durmadığı.
// Yalnızca "ekranı doğru ölçüyor mu" sorusunu yanıtlar.
import { readFileSync, readdirSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { join, relative } from 'node:path';

const SRC = new URL('../src/', import.meta.url).pathname;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(SRC);
let bad = 0;
let checked = 0;

/** Bir metin parçasında tam sayfa HTML var mı? */
const looksLikePage = (s) => /<body[\s>]/i.test(s) && /<html[\s>]/i.test(s);

for (const f of files) {
  const rel = relative(SRC, f);
  const src = readFileSync(f, 'utf8');
  const isHtmlFile = f.endsWith('.html');
  // .js içinde üretilen sayfalar: `<html` ve `<body` birlikte geçiyorsa sayfa sayılır.
  if (!isHtmlFile && !looksLikePage(src)) continue;
  // Parça dosyalar da denetlenir: WebView'e parça göndermek zaten hatanın kendisiydi.
  checked++;

  if (!/^\s*<!doctype html>/i.test(src) && !/['"`]\s*<!doctype html>/i.test(src)) {
    console.log(`${rel}: <!doctype html> YOK → tarayıcı quirks kipine düşer, yüzdeli yükseklikler bozulur`);
    bad++;
  }
  if (!/name\s*=\s*["']viewport["']/i.test(src)) {
    console.log(`${rel}: viewport meta etiketi YOK → WebView sayfayı ~980px sanal ekrana çizip küçültür`);
    bad++;
  }
}

if (!checked) { console.error('HATA: hiçbir HTML sayfası bulunamadı — araç bozuk.'); process.exit(2); }

// ---------------------------------------------------------------------------
// Satır içi JavaScript sözdizimi
// ---------------------------------------------------------------------------
//
// Bu sayfaların içindeki script blokları 700-900 satır (ludo.html, tek.html) ve hiçbir
// araç onlara bakmıyordu: `npm run check` yalnızca src/**/*.js dosyalarını denetliyor.
// Oradaki bir sözdizimi hatası sunucuyu etkilemiyor, sayfa SESSİZCE boş açılıyor —
// oyuncu için oyun "açılmıyor" demek.
//
// Bloklar geçici dosyaya yazılıp `node --check` ile denetleniyor. Modül olarak
// denetlendiği için `import`/`export` da kabul edilir; tarayıcıda da öyle çalışıyorlar.
let scripts = 0;
let skipped = 0;
for (const f of files) {
  const rel = relative(SRC, f);
  const src = readFileSync(f, 'utf8');
  // src= taşıyan etiketler atlanıyor: içleri boş.
  const blocks = [...src.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  for (let i = 0; i < blocks.length; i++) {
    // Sunucu tarafı şablon değişkeni (`${...}`) içeren script tek başına DERLENEMEZ:
    // `.js` dosyalarının içinde HTML üretirken kullanılan bloklar böyle. İlk denememde
    // bunlar üç yanlış alarm verdi. Atlananların sayısı sonda yazılıyor.
    if (blocks[i][1].includes('${')) { skipped++; continue; }
    scripts++;
    const tmp = join(tmpdir(), `wv_${process.pid}_${scripts}.mjs`);
    writeFileSync(tmp, blocks[i][1]);
    const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
    unlinkSync(tmp);
    if (r.status !== 0) {
      // node'un hata çıktısındaki asıl satırı göster.
      const msg = (r.stderr || '').split('\n').find((l) => /SyntaxError|Error:/.test(l)) || 'sözdizimi hatası';
      const line = src.slice(0, blocks[i].index).split('\n').length;
      console.log(`${rel}:${line}: satır içi script ${i + 1} DERLENMİYOR → sayfa boş açılır\n    ${msg.trim()}`);
      bad++;
    }
  }
}

console.log(bad
  ? `\n${bad} eksik. Bu, sayfanın telefonda "ekran görünümünü kaybetmesi" ya da hiç açılmaması demektir.`
  : `WebView sayfaları ekranı doğru ölçüyor ve satır içi scriptleri derleniyor (${checked} sayfa, ${scripts} script`
    + `${skipped ? `, ${skipped} tanesi sunucu şablonu olduğu için atlandı` : ''})`);
process.exit(bad ? 1 : 0);
