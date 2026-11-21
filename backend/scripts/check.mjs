// Tüm kaynak dosyaların sözdizimini denetler (node --check yalnızca verilen dosyaya bakar; içe aktarılanlara bakmaz).
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
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

process.exit(failed ? 1 : 0);
