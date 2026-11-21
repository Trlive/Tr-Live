#!/usr/bin/env node
// Sunucunun TÜM API adreslerini kaynak koddan çıkarır.
//
// Modüllere ayırma işi "dosyayı taşı, mantığa dokunma" şeklinde ilerliyor. Böyle bir taşımada en büyük
// tehlike bir adresin sessizce kaybolmasıdır: sunucu açılır, testler geçer, ama uygulamadaki bir düğme
// 404 döner. Staging olmadığımız için bunu canlıda fark ederdik.
//
// Bu araç her adresi (yöntem + yol + hangi router'a bağlı) listeler. route_map.test.js listeyi
// test/route_map.json ile karşılaştırır: taşıma sırasında bir adres kaybolur ya da yolu değişirse test
// kırmızı yanar. Bilerek değiştirildiyse `node tools/route_map.mjs --write` ile anlık görüntü yenilenir.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = new URL('../src/', import.meta.url).pathname;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    // Test dosyaları taranmaz: bir test, rota dizesini metin olarak içerdiğinde (ör. kaynağı
    // okuyup `router.get('/:roomId/members'` arayan bir doğrulama) araç onu gerçek bir rota
    // sanar ve sahte fark üretir. Sahte fark üreten güvenlik ağına kimse bakmaz.
    if (name === 'samples' || name === 'node_modules' || name === 'migrations' || name === 'tests') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.js') && !name.endsWith('.test.js')) out.push(p);
  }
  return out;
}

// express Router çağrıları: <ad>.get('/yol', ...) / .post / .put / .patch / .delete / .all / .use('/yol'
const CALL = /\b([A-Za-z_$][\w$]*)\.(get|post|put|patch|delete|all|use)\(\s*(['"`])([^'"`]*)\3/g;
// server.js'teki bağlama: app.use('/api/xxx', yyyRouter)
const MOUNT = /\bapp\.use\(\s*(['"`])([^'"`]+)\1\s*,\s*([A-Za-z_$][\w$]*)/g;

export function routeMap() {
  // Adres anahtarında dosya yolu BİLEREK yok: modüllere ayırma dosyaları taşır, API yüzeyi aynı kalmalı.
  // Dosya bilgisi yalnızca bilgi amaçlı ayrı alanda tutulur.
  const routes = [];
  const mounts = [];
  const files = {};
  for (const file of walk(SRC).sort()) {
    const rel = relative(SRC, file);
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(CALL)) {
      const [, holder, method, , path] = m;
      // Yalnızca gerçek router'lar: typingCache.delete() gibi Map çağrıları ve statik ara katmanlar elenir.
      if (!/router$/i.test(holder)) continue;
      if (!path.startsWith('/')) continue;
      // Anahtarda router DEĞİŞKEN ADI da bilerek yok: büyük bir dosya alt router'lara bölündüğünde
      // ad değişir ama API yüzeyi aynı kalır. Aynı yolun kaç kez tanımlandığı sayılır; biri düşerse
      // sayı değişir, yani bölme sırasında kaybolan adres yine yakalanır.
      routes.push(`${method.toUpperCase()} ${path}`);
      files[rel] = (files[rel] || 0) + 1;
    }
    if (rel === 'server.js' || rel === 'app.js') { // bağlamalar app.js'e taşındı; ikisi de taranır
      for (const m of src.matchAll(MOUNT)) if (/router$/i.test(m[3])) mounts.push(`${m[2]} -> ${m[3]}`);
    }
  }
  const counts = {};
  for (const r of routes) counts[r] = (counts[r] || 0) + 1;
  const keyed = Object.keys(counts).sort().map((r) => (counts[r] > 1 ? `${r}  ×${counts[r]}` : r));
  return { mounts: [...new Set(mounts)].sort(), routes: keyed, total: routes.length, files };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const map = routeMap();
  if (process.argv.includes('--write')) {
    const out = new URL('../test/route_map.json', import.meta.url).pathname;
    // --write'ı farkı GÖRMEDEN çalıştırmak güvenlik ağını etkisiz kılar: kaybolan bir adres
    // sessizce onaylanmış olur. Bu yüzden yazmadan önce fark her zaman basılır.
    let prev = null;
    try { prev = JSON.parse(readFileSync(out, 'utf8')); } catch { /* ilk yazım */ }
    if (prev) {
      const gone = prev.routes.filter((r) => !map.routes.includes(r));
      const neu = map.routes.filter((r) => !prev.routes.includes(r));
      const mGone = (prev.mounts || []).filter((r) => !map.mounts.includes(r));
      if (gone.length) console.log(`\n!! KAYBOLAN ${gone.length} ADRES:\n` + gone.map((r) => '   - ' + r).join('\n'));
      if (mGone.length) console.log(`\n!! KAYBOLAN ${mGone.length} BAGLAMA:\n` + mGone.map((r) => '   - ' + r).join('\n'));
      if (neu.length) console.log(`\n+  YENI ${neu.length} ADRES:\n` + neu.map((r) => '   + ' + r).join('\n'));
      if (!gone.length && !neu.length && !mGone.length) console.log('fark yok.');
      console.log('');
    }
    writeFileSync(out, JSON.stringify(map, null, 2) + '\n');
    console.log(`yazildi: ${map.mounts.length} baglama, ${map.total} adres tanimi (${map.routes.length} ayri yol), ${Object.keys(map.files).length} dosya`);
  } else {
    console.log(JSON.stringify(map, null, 2));
  }
}
