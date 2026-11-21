// Tüm kaynak dosyaların sözdizimini denetler (node --check yalnızca verilen dosyaya bakar; içe aktarılanlara bakmaz).
import { readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

const roots = ['src', 'test', 'e2e', 'scripts'];
const files = [];
const walk = (d) => {
  let entries = [];
  try { entries = readdirSync(d); } catch { return; }
  for (const n of entries) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(m?js)$/.test(n)) files.push(p);
  }
};
roots.forEach(walk);
let failed = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) {
    failed += 1;
    console.error(`✗ ${f}\n${r.stderr}`);
  }
}
console.log(`${files.length - failed}/${files.length} dosya sözdizimi tamam.`);

// Dağıtım yolları: Dockerfile ve package.json'daki komut yolları ile kaynak içindeki
// new URL(...) varlık yolları gerçekten var mı.
//
// Bu denetim, modüllere ayırma sırasında Dockerfile'ın hâlâ taşınmış bir dosyayı çağırdığının
// fark edilmesiyle eklendi: kapsayıcı bir sonraki dağıtımda hiç açılmayacaktı. Bu yollar dize
// içinde olduğu için import denetimine takılmıyor.
const dp = spawnSync(process.execPath, [new URL('../tools/deploy_paths.mjs', import.meta.url).pathname], { encoding: 'utf8' });
process.stdout.write(dp.stdout || '');
process.stderr.write(dp.stderr || '');
if (dp.status !== 0) failed += 1;

// Tanımsız ad ve eksik dışa verim denetimi.
//
// İkisi de "sözdizimi doğru ama çalışınca patlar" sınıfındandır ve birim testleri
// o yolu çağırmıyorsa sessiz kalırlar:
//  - Tanımsız ad → uç çağrılınca ReferenceError → kullanıcıya "Sunucu hatası".
//    (v2.146.0'da canlıda "oda açılamıyor" hatasının sebebi tam buydu: rooms.routes.js
//     profileJson'u kullanıyor ama import etmiyordu.)
//  - Eksik dışa verim → modül bağlanamaz → sunucu HİÇ açılmaz.
const srcFiles = files.filter((f) => f.startsWith(`src${sep}`) || f.startsWith(`e2e${sep}`));
for (const tool of ['free_idents.mjs', 'export_check.mjs']) {
  const r = spawnSync(process.execPath, [new URL(`../tools/${tool}`, import.meta.url).pathname, ...srcFiles], { encoding: 'utf8' });
  process.stdout.write(r.stdout || '');
  process.stderr.write(r.stderr || '');
  if (r.status !== 0) failed += 1;
}

// E2E'nin çağırdığı her adres sunucuda var mı?
//
// route_map.mjs "taşımada adres kayboldu mu?" sorusuna bakar; testin adresi DOĞRU
// yazdığına bakmaz. Bir test `/api/gifts/global` çağırıyordu, gerçek adres
// `/api/gifts/global/recent` idi → HTTP 404 "Adres bulunamadı".
// Node test koşucusu ilk hatada o testi bırakır; bu yüzden böyle hatalar CI'da
// sırayla, her turda bir tane çıkar. Bu araç hepsini bir kerede gösterir.
const er = spawnSync(process.execPath, [new URL('../tools/e2e_routes.mjs', import.meta.url).pathname], { encoding: 'utf8' });
process.stdout.write(er.stdout || '');
process.stderr.write(er.stderr || '');
if (er.status !== 0) failed += 1;

process.exit(failed ? 1 : 0);
