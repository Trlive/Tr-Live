#!/usr/bin/env node
// Uygulama İÇİNDE açılan panel sayfalarında tarayıcı kutusu (confirm/alert/prompt) yasak.
//
// NEDEN: Ajans ve Yayıncı Merkezi birer panel sayfası ve uygulama onları WebView'de açıyor.
// Orada `window.confirm(...)` çağırmak Android'in kendi kutusunu açıyor; kutunun başlığında
// sunucunun adresi yazıyor:
//
//     "https://130-61-222-48.sslip.io" adresindeki sayfada şunlar belirtiliyor:
//
// Sahibi bunu gördü ve haklı olarak "bu ne saçmalık" dedi. Kullanıcıya altyapı adresi
// gösterilmemeli. Üstüne, tarayıcı kutusu uygulamanın temasına benzemiyor ve WebView'de
// tüm olayları bloke ediyor.
//
// Yerine `useConfirm()` (web/panel/src/shared/components/confirm.tsx) kullanılacak.
//
// KAPSAM: yalnızca uygulamanın WebView'de açtığı yollardan ERİŞİLEBİLEN dosyalar. Masaüstü
// tarayıcıda kullanılan yönetim paneli bu denetimin dışında — orada tarayıcı kutusu sorun
// değil, çünkü adresi kullanıcı kendisi yazdı ve zaten adres çubuğunda görüyor.
//
// Erişilebilirlik, WebView giriş sayfalarından import zinciri izlenerek bulunuyor; yani
// yarın ajans sayfasına yeni bir bileşen eklenirse o da kendiliğinden kapsama giriyor.
//
// BU ARACIN GÖREMEDİĞİ: takma adla çağırma (`const c = window.confirm`), dinamik import,
// `eval`. Bunlar panelde kullanılmıyor.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const PANEL = new URL('../../web/panel/', import.meta.url).pathname;
const SRC = join(PANEL, 'src');

// Uygulamanın WebView'de açtığı yollar: mobile/lib/widgets/app_webview_modal.dart içindeki
// AppWebPage(path: ...) çağrıları. Yeni bir sayfa eklenirse buraya da eklenmeli; bu liste
// ile gerçeğin ayrışmaması için aşağıda mobil dosyayla karşılaştırılıyor.
const WEBVIEW_ROUTES = ['m/host', 'm/agency'];

const DART = new URL('../../mobile/lib/widgets/app_webview_modal.dart', import.meta.url).pathname;
if (existsSync(DART)) {
  const found = [...readFileSync(DART, 'utf8').matchAll(/AppWebPage\(path:\s*'\/yonetim\/([^']+?)\/?'/g)]
    .map((m) => m[1].replace(/\/$/, ''));
  const missing = found.filter((r) => !WEBVIEW_ROUTES.includes(r));
  if (missing.length) {
    console.error(
      `HATA: uygulama şu panel yollarını da WebView'de açıyor ama bu araç onları bilmiyor: ${missing.join(', ')}\n`
      + `tools/webview_dialogs.mjs içindeki WEBVIEW_ROUTES listesine ekle.`,
    );
    process.exit(2);
  }
}

/** Bir dosyanın import ettiği yerel dosyaları çözer. */
function localImports(file) {
  const code = readFileSync(file, 'utf8');
  const out = [];
  for (const m of code.matchAll(/(?:from|import)\s*["']([^"']+)["']/g)) {
    const spec = m[1];
    let base;
    if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
    else if (spec.startsWith('.')) base = resolve(dirname(file), spec);
    else continue; // paket
    for (const cand of [base, base + '.tsx', base + '.ts', join(base, 'index.tsx'), join(base, 'index.ts')]) {
      if (existsSync(cand) && statSync(cand).isFile()) { out.push(cand); break; }
    }
  }
  return out;
}

// WebView giriş sayfalarından başlayıp erişilebilir dosyaları topla.
const reachable = new Set();
const queue = [];
for (const r of WEBVIEW_ROUTES) {
  for (const f of ['page.tsx', 'page.ts']) {
    const p = join(SRC, 'app', r, f);
    if (existsSync(p)) queue.push(p);
  }
}
if (!queue.length) { console.error('HATA: WebView giriş sayfası bulunamadı — araç bozuk.'); process.exit(2); }
while (queue.length) {
  const f = queue.pop();
  if (reachable.has(f)) continue;
  reachable.add(f);
  for (const next of localImports(f)) queue.push(next);
}

// Düzen dosyaları (layout.tsx) sayfa ile birlikte çiziliyor ama import edilmiyor.
for (const r of WEBVIEW_ROUTES) {
  for (let d = join(SRC, 'app', r); d.startsWith(join(SRC, 'app')); d = dirname(d)) {
    const l = join(d, 'layout.tsx');
    if (existsSync(l) && !reachable.has(l)) { reachable.add(l); for (const n of localImports(l)) queue.push(n); }
  }
}
while (queue.length) {
  const f = queue.pop();
  if (reachable.has(f)) continue;
  reachable.add(f);
  for (const next of localImports(f)) queue.push(next);
}

let bad = 0;
const DIALOG = /\bwindow\s*\.\s*(confirm|alert|prompt)\s*\(/g;
for (const f of [...reachable].sort()) {
  const raw = readFileSync(f, 'utf8');
  for (const m of raw.matchAll(DIALOG)) {
    const before = raw.slice(0, m.index);
    // Yorum satırındaki anlatımı sayma.
    const lineStart = before.lastIndexOf('\n') + 1;
    const line = raw.slice(lineStart, raw.indexOf('\n', m.index));
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
    console.log(
      `${relative(PANEL, f)}:${before.split('\n').length}: window.${m[1]}() — bu dosya uygulama içinde `
      + `WebView'de açılıyor; tarayıcı kutusu SUNUCU ADRESİNİ gösterir. useConfirm() kullan.`,
    );
    bad++;
  }
}

console.log(bad
  ? `\n${bad} tarayıcı kutusu. Her biri kullanıcıya sunucu adresini gösterir.`
  : `uygulama içi panel sayfalarında tarayıcı kutusu yok (${reachable.size} dosya denetlendi)`);
process.exit(bad ? 1 : 0);
