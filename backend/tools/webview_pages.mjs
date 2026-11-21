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
import { readFileSync, readdirSync, statSync } from 'node:fs';
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
console.log(bad
  ? `\n${bad} eksik. Bu, sayfanın telefonda "ekran görünümünü kaybetmesi" demektir.`
  : `WebView sayfaları ekranı doğru ölçüyor (${checked} sayfa denetlendi)`);
process.exit(bad ? 1 : 0);
