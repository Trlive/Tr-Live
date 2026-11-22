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

// Router kapsamı: öneksiz bağlanan bir router'da `use(araKatman)` yazılmış mı?
//
// v2.148.0'da tek böyle satır, yardımcı adminleri panelin TAMAMINDAN kilitledi: SDUI
// router'ına konan yetki denetimi, üst router'a gelen her isteğe uygulandı. CI'da bu
// "kullanıcı arama → HTTP 403" diye göründü; yani hatanın göründüğü yer ile olduğu yer
// alakasızdı. Bu sınıfı elle bulmak çok pahalı.
const rs = spawnSync(process.execPath, [new URL('../tools/router_scope.mjs', import.meta.url).pathname], { encoding: 'utf8' });
process.stdout.write(rs.stdout || '');
process.stderr.write(rs.stderr || '');
if (rs.status !== 0) failed += 1;

// SQL yer tutucuları ile verilen değerler tutuyor mu?
//
// host_statements INSERT'ine 10 sütun eklerken elle saymak zorunda kaldım. Bir eksik
// olsaydı PostgreSQL "bind message supplies 37 parameters, but prepared statement requires
// 38" diyecekti — ve bu yalnızca dönem kapanışında, yani ayda bir çalışan bir yolda
// ortaya çıkacaktı.
const sqp = spawnSync(process.execPath, [new URL('../tools/sql_params.mjs', import.meta.url).pathname], { encoding: 'utf8' });
process.stdout.write(sqp.stdout || '');
process.stderr.write(sqp.stderr || '');
if (sqp.status !== 0) failed += 1;

// Ortak nesnelerde olmayan yöntemi çağırmak.
//
// `hub.toUser(...)` yazdım; öyle bir yöntem yok, doğrusu `sendToUser`. Sözdizimi doğru,
// import doğru, tanımsız ad yok — hiçbir araç görmedi. O uç çağrıldığında TypeError atıp
// kullanıcıya "Sunucu hatası" dönecekti.
const sm = spawnSync(process.execPath, [new URL('../tools/singleton_methods.mjs', import.meta.url).pathname], { encoding: 'utf8' });
process.stdout.write(sm.stdout || '');
process.stderr.write(sm.stderr || '');
if (sm.status !== 0) failed += 1;

// Uygulama içinde açılan panel sayfalarında tarayıcı kutusu var mı?
//
// Ajans/Yayıncı Merkezi birer panel sayfası ve uygulama onları WebView'de açıyor.
// `window.confirm` orada Android'in kutusunu açıyor ve kutunun başlığında SUNUCU ADRESİ
// yazıyor. Sahibi bunu ekranda gördü. Yerine useConfirm() var.
const wd = spawnSync(process.execPath, [new URL('../tools/webview_dialogs.mjs', import.meta.url).pathname], { encoding: 'utf8' });
process.stdout.write(wd.stdout || '');
process.stderr.write(wd.stderr || '');
if (wd.status !== 0) failed += 1;

// WebView'e sunulan sayfalar ekranı doğru ölçüyor mu (doctype + viewport)?
//
// `tek.html` bunlarsız yazılmıştı: Android WebView sayfayı ~980px sanal ekrana çizip
// küçültüyor, doctype olmadığı için de quirks kipinde yüzdeli yükseklikler bozuluyordu.
// Oda üstündeki küçük pencerede bu "sayfa ekran görünümünü kaybetti" demekti.
const wp = spawnSync(process.execPath, [new URL('../tools/webview_pages.mjs', import.meta.url).pathname], { encoding: 'utf8' });
process.stdout.write(wp.stdout || '');
process.stderr.write(wp.stderr || '');
if (wp.status !== 0) failed += 1;

// SDUI: şema (sunucu) ile çizici (Flutter) aynı şeyleri biliyor mu?
//
// Şemaya bir bileşen eklenip çiziciye eklenmezse hiçbir yerde hata olmaz: panel onu
// katalogda gösterir, yönetici ekrana koyar, uygulama tanımadığı için ATLAR, kullanıcı
// BOŞ EKRAN görür. `repeater` ve `avatarRow` ile tam bu olmuştu.
const sp = spawnSync(process.execPath, [new URL('../tools/sdui_parity.mjs', import.meta.url).pathname], { encoding: 'utf8' });
process.stdout.write(sp.stdout || '');
process.stderr.write(sp.stderr || '');
if (sp.status !== 0) failed += 1;

process.exit(failed ? 1 : 0);
