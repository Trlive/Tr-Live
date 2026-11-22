#!/usr/bin/env node
// İş akışlarının kullandığı dosyalar depoda DURUYOR MU?
//
// NEDEN: `zip_ile_guncelle.yml` yüklenen zip'i açmadan önce `.git` ve `.github` dışındaki
// HER ŞEYİ siliyor:
//
//     find . -mindepth 1 -maxdepth 1 ! -name '.git' ! -name '.github' -exec rm -rf {} +
//     cp -a "$T/." .
//
// Yani zip'te olmayan bir dosya depodan SİLİNİYOR. İş akışı dosyaları korunduğu için
// `.github/workflows/ios_build.yml` yerinde kaldı ama onun çağırdığı
// `mobile/native/ios/setup_ios.py` silindi: iOS derlemesi "No such file or directory"
// ile düştü ve kimse aylarca fark etmedi, çünkü o iş yalnızca elle çalıştırılıyor.
//
// Bu araç iş akışlarındaki dosya yollarını okuyup depoda var mı diye bakıyor. Böyle bir
// kayıp bir daha sessizce olmaz: yayın öncesi denetim patlar.
//
// BU ARACIN GÖREMEDİĞİ: değişkenle kurulan yollar (`$DIR/x.py`), kabuk döngüsünde üretilen
// adlar, `uses:` ile çekilen dış eylemler. Atlananların sayısı sonda yazılır.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;
const WF = join(ROOT, '.github', 'workflows');

if (!existsSync(WF)) {
  console.error('HATA: .github/workflows bulunamadı — araç bozuk.');
  process.exit(2);
}

/** İş akışı metninden depo içi dosya yolu gibi görünenleri çıkarır. */
function pathsIn(text) {
  const out = new Set();
  // "python3 native/ios/setup_ios.py", "bash scripts/x.sh", "node tools/y.mjs",
  // "-f mobile/pubspec.yaml", "cat backend/package.json" gibi kullanımlar.
  const re = /(?:^|[\s"'=(])((?:\.\/)?(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.(?:py|sh|mjs|js|json|yaml|yml|dart|sql|kt|plist|xml))(?=[\s"'):;,]|$)/gm;
  for (const m of text.matchAll(re)) {
    let p = m[1].replace(/^\.\//, '');
    // Çalışma anında üretilenler ve dış kaynaklar denetlenmez.
    if (p.includes('$') || p.includes('*') || p.startsWith('build/') || p.includes('/build/')) continue;
    if (p.startsWith('.github/')) continue;        // iş akışları zaten korunuyor
    if (/^(node_modules|ios|android)\//.test(p)) continue; // flutter create üretiyor
    out.add(p);
  }
  return out;
}

/** Bir iş akışının `working-directory` değerleri: göreli yollar ona göre çözülür.
 *
 *  `working-directory: ${{ env.APP_DIR }}` gibi değişkenler, aynı dosyadaki `env:`
 *  bloğundan çözülür. Çözülmezse yoldan vazgeçilmez; bilinen tüm dizinler denenir.  */
function workDirs(text) {
  const vars = new Map();
  for (const m of text.matchAll(/^\s*([A-Z_][A-Z0-9_]*):\s*([A-Za-z0-9_./-]+)\s*$/gm)) vars.set(m[1], m[2]);
  const dirs = new Set(['']);
  for (const m of text.matchAll(/working-directory:\s*([^\s#]+)/g)) {
    let d = m[1];
    const v = /\$\{\{\s*(?:env\.)?([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/.exec(d);
    if (v) d = vars.get(v[1]) ?? '';
    d = d.replace(/^\.$/, '').replace(/\/$/, '');
    if (!d.includes('$')) dirs.add(d);
  }
  return [...dirs];
}

/** Depodaki üst düzey klasörler (mobile, backend, web, deploy, docs …). */
const TOP_DIRS = readdirSync(ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
  .map((e) => e.name);

let missing = 0;
let checked = 0;
let skipped = 0;

for (const file of readdirSync(WF).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))) {
  const text = readFileSync(join(WF, file), 'utf8');
  const dirs = workDirs(text);
  for (const p of pathsIn(text)) {
    // Yol; kök, iş akışının working-directory değerleri ya da depodaki herhangi bir üst
    // klasöre göre varsa tamam.
    //
    // Üst klasörleri de denememizin sebebi: `working-directory: ${{ env.APP_DIR }}` gibi
    // değerler çalışma anında hesaplanıyor (apk_build.yml, pubspec.yaml'ı arayıp buluyor),
    // dosyadan okunamıyor. Bu, denetimi biraz gevşetiyor ama aranan hatayı kaçırmıyor:
    // tamamen silinmiş bir dosya hiçbir ön ek altında bulunamaz.
    const found = existsSync(join(ROOT, p))
      || dirs.some((d) => existsSync(join(ROOT, d, p)))
      || TOP_DIRS.some((d) => existsSync(join(ROOT, d, p)));
    if (found) { checked++; continue; }
    // Oluşturulan dosyalar (ör. build.log) iş akışının kendisi tarafından yazılır.
    if (/\.(log|txt)$/.test(p)) { skipped++; continue; }
    // Varlığı ZATEN sınanan ya da silinen dosyalar: yokluğu beklenen durumdur.
    // (`if [ -f test/widget_test.dart ] && ... rm -f test/widget_test.dart`)
    const onGuardedLine = text.split('\n').some(
      (l) => l.includes(p) && (/\brm\s/.test(l) || /\[\s*!?\s*-[fde]\s/.test(l)),
    );
    if (onGuardedLine) { skipped++; continue; }
    console.log(
      `.github/workflows/${file}: "${p}" iş akışında kullanılıyor ama DEPODA YOK `
      + `→ o iş "No such file or directory" ile düşer`,
    );
    missing++;
  }
}

if (!checked && !missing) { console.error('HATA: hiçbir yol okunamadı — araç bozuk.'); process.exit(2); }
console.log(missing
  ? `\n${missing} eksik dosya. Zip yükleme iş akışı, zip'te olmayan her şeyi SİLDİĞİ için `
    + `bu dosyalar bir sonraki yüklemede de geri gelmez.`
  : `iş akışlarının kullandığı dosyalar yerinde (${checked} yol denetlendi`
    + `${skipped ? `, ${skipped} tanesi çalışma anında üretildiği için atlandı` : ''})`);
process.exit(missing ? 1 : 0);
