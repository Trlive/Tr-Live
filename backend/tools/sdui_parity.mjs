#!/usr/bin/env node
// SDUI şeması ile uygulamanın ÇİZİCİSİ aynı şeyleri biliyor mu?
//
// NEDEN: Şema (sunucu) ve çizici (Flutter) iki ayrı dilde, iki ayrı dosyada. Şemaya bir
// bileşen eklenip çiziciye eklenmezse hiçbir şey hata vermez:
//   · Panel o bileşeni katalogda GÖSTERİR, yönetici ekrana koyar, kaydeder, yayınlar.
//   · Uygulama tanımadığı türü ATLAR (bilerek — eski APK çökmesin diye).
//   · Kullanıcı BOŞ EKRAN görür. Hiçbir yerde hata kaydı yoktur.
//
// Tam bu oldu: `repeater` ve `avatarRow` şemada vardı, çizicide YOKTU. Veri gelen
// ekranların hepsi (gelen kutusu, etkinlikler, ilişkiler) boş çizilecekti.
//
// Aynısı veri kaynakları için de geçerli: şema `faq`, `tasks`, `familyMembers`,
// `agencyReport` kaynaklarını tanıtıyordu; dördünün de uygulamada karşılığı yoktu
// (ikisi hiç uç değil, ikisi liste değil nesne döndürüyor).
//
// BU ARACIN GÖREMEDİĞİ: çizimin DOĞRU olup olmadığı. Yalnızca "karşılığı var mı" sorusunu
// yanıtlar; bileşenin güzel ya da doğru çizildiğini söylemez.
import { readFileSync, existsSync } from 'node:fs';

const SCHEMA = new URL('../src/modules/sdui/v2/sdui_v2.schema.js', import.meta.url).pathname;
const RENDERER = new URL('../../mobile/lib/hybrid/sdui/v2/renderer/sdui_renderer.dart', import.meta.url).pathname;
const ACTIONS = new URL('../../mobile/lib/hybrid/sdui/v2/registry/action_registry.dart', import.meta.url).pathname;
const SOURCES = new URL('../../mobile/lib/hybrid/sdui/v2/registry/source_registry.dart', import.meta.url).pathname;

for (const f of [SCHEMA, RENDERER, ACTIONS, SOURCES]) {
  if (!existsSync(f)) { console.error(`HATA: bulunamadı: ${f} — araç bozuk.`); process.exit(2); }
}

const schema = await import(SCHEMA);
const renderer = readFileSync(RENDERER, 'utf8');
const actions = readFileSync(ACTIONS, 'utf8');
const sources = readFileSync(SOURCES, 'utf8');

/** Dart dosyasındaki `case 'ad':` etiketleri. */
const casesOf = (src) => new Set([...src.matchAll(/case\s+'([A-Za-z_][\w]*)'\s*:/g)].map((m) => m[1]));
/** Dart haritasındaki `'anahtar':` adları. */
const keysOf = (src) => new Set([...src.matchAll(/'([A-Za-z_][\w]*)'\s*:\s*\(/g)].map((m) => m[1]));

let bad = 0;
const rendered = casesOf(renderer);
for (const type of Object.keys(schema.COMPONENTS)) {
  if (!rendered.has(type)) {
    console.log(`bileşen "${type}": şemada var, çizicide YOK → o bileşen sessizce boş çizilir`);
    bad++;
  }
}
// Ters yön de önemli: çizici bilip şemanın tanımadığı tür, kaydedilemeyeceği için ölü koddur.
const SKIP = new Set(['GET', 'PATCH', 'POST', 'PUT', 'DELETE', 'start', 'center', 'end', 'stretch', 'ring', 'bar', 'line', 'rounded', 'dot', 'circle', 'scroll']);
for (const type of rendered) {
  if (SKIP.has(type)) continue;
  if (!Object.hasOwn(schema.COMPONENTS, type)) {
    console.log(`bileşen "${type}": çizicide var, şemada YOK → kaydedilemez, ölü kod`);
    bad++;
  }
}

const known = casesOf(actions);
// Liste ŞEMADAN gelir, burada elle tutulmaz. Elle tutulsaydı şemaya eklenen yeni bir eylem
// (ör. openChat) bu araca eklenmediği sürece denetlenmeden geçerdi — aracın görevi tam da
// bunu yakalamak.
for (const a of schema.ACTION_TYPES) {
  if (a === 'noop') continue; // hiçbir şey yapmaz; çizicide dalı olması gerekmez
  if (!known.has(a)) { console.log(`eylem "${a}": şemada var, uygulamada YOK → düğme sessizce çalışmaz`); bad++; }
}
const appActions = keysOf(actions);
for (const name of Object.keys(schema.API_ACTIONS)) {
  if (!appActions.has(name)) {
    console.log(`işlem "${name}": şemada izinli ama uygulamada karşılığı YOK → düğme sessizce çalışmaz`);
    bad++;
  }
}
const appSources = keysOf(sources);
for (const name of schema.SOURCES) {
  if (!appSources.has(name)) {
    console.log(`veri kaynağı "${name}": şemada var, uygulamada YOK → liste sessizce boş kalır`);
    bad++;
  }
}

const n = Object.keys(schema.COMPONENTS).length + Object.keys(schema.API_ACTIONS).length
  + schema.SOURCES.length + schema.ACTION_TYPES.length;
console.log(bad
  ? `\n${bad} eşleşmeyen. Bunların her biri kullanıcıda BOŞ ya da TEPKİSİZ bir parça demektir.`
  : `şema ve uygulama aynı şeyleri biliyor (${n} tanım denetlendi)`);
process.exit(bad ? 1 : 0);
