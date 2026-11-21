#!/usr/bin/env node
// Yayın öncesi doğrulama — tek komut.
//
// ## Niçin yazıldı
//
// Modüllere ayırma sırasında 133 dosya taşındı. Sözdizimi, import denetimi, rota haritası ve
// bütün birim testleri yeşildi ve "doğrulandı" denildi. **Ama sunucu açılmıyordu.** Üç ayrı
// dosya yolu kırıktı ve bunu ancak sunucuyu çalıştırmayı deneyince gördük.
//
// Ders: *ucuz olanı doğrulayıp "doğrulandı" demek, doğrulama değildir.*
//
// Bu araç, tek tek hatırlanması gereken kontrolleri tek komutta toplar. Daha önemlisi:
// **doğrulayamadıklarını açıkça yazar.** Kör noktasını söylemeyen bir araç, yanlış güven üretir —
// tam da bu hatanın sebebi buydu.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url).pathname.replace(/\/$/, '');
const node = process.execPath;
const run = (args, opts = {}) => spawnSync(node, args, { cwd: ROOT, encoding: 'utf8', ...opts });

let failed = 0;
const step = (name, fn) => {
  process.stdout.write(`• ${name} … `);
  try {
    const msg = fn();
    console.log(msg ?? 'tamam');
  } catch (e) {
    failed++;
    console.log('HATA');
    console.log(String(e.message || e).split('\n').map((l) => '    ' + l).join('\n'));
  }
};

const ok = (r, what) => {
  if (r.status !== 0) throw new Error((r.stdout || '') + (r.stderr || '') || `${what} başarısız`);
};

console.log('TR Live — yayın öncesi doğrulama\n');

step('sözdizimi + dağıtım yolları', () => {
  const r = run(['scripts/check.mjs']);
  ok(r, 'check');
  return r.stdout.trim().split('\n').pop();
});

step('rota haritası (kaybolan adres)', () => {
  const r = run(['--test', 'test/route_map.test.js']);
  if (!/# fail 0/.test(r.stdout)) throw new Error(r.stdout);
  return 'adres kaybı yok';
});

step('birim testleri', () => {
  const files = spawnSync('find', ['test', 'src', '-name', '*.test.js'], { cwd: ROOT, encoding: 'utf8' })
    .stdout.trim().split('\n').filter(Boolean);
  let pass = 0, bad = [];
  for (const f of files) {
    const r = run(['--test', f], { env: { ...process.env } });
    if (/# fail 0/.test(r.stdout)) pass++; else bad.push(f);
  }
  if (bad.length) throw new Error('kırık: ' + bad.join(', '));
  return `${pass} dosya geçti`;
});

/// Git'ten gelen Flutter bağımlılıklarının hâlâ erişilebilir olduğunu doğrular.
///
/// Bunu yazma sebebi somut: yapay zekâ gürültü azaltma eklentisi kişisel bir depodan geliyordu,
/// depo silindi ve **her APK derlemesi durdu**. Kod değişmemişti; dışarıdaki bir depo kayboldu.
/// Hiçbir yerel kontrol bunu görmüyordu, çünkü hiçbiri depoya ulaşmayı denemiyordu.
step('Flutter git bağımlılıkları erişilebilir mi', () => {
  const pub = `${ROOT}/../mobile/pubspec.yaml`;
  if (!existsSync(pub)) return 'pubspec yok, atlandı';
  const urls = [...readFileSync(pub, 'utf8').matchAll(/^\s*url:\s*(\S+)/gm)]
    .map((m) => m[1].replace(/^['"]|['"]$/g, ''))
    .filter((u) => !/^\s*#/.test(u));
  if (!urls.length) return 'git bağımlılığı yok (iyi)';
  const bad = [];
  for (const u of urls) {
    const r = spawnSync('git', ['ls-remote', u], {
      encoding: 'utf8', timeout: 25000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    if (r.status !== 0) bad.push(u);
  }
  if (bad.length) throw new Error('erişilemeyen depo (APK derlemesi durur):\n  ' + bad.join('\n  '));
  return `${urls.length} depo erişilebilir`;
});

step('Dart ön denetimi (import / tanımsız ad)', () => {
  const r = spawnSync('python3', ['tools/dart_check.py'], { cwd: `${ROOT}/../mobile`, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stdout || r.stderr);
  return r.stdout.split('\n').find((l) => l.includes('tamam')) ?? 'tamam';
});

// ---------------------------------------------------------------------------------------------

console.log(`\n${failed ? `${failed} kontrol BAŞARISIZ` : 'Yerel kontroller tamam'}`);

console.log(`
BU ARAÇ ŞUNLARI DOĞRULAMAZ — yayından önce CI'da görülmeli:

  1. Sunucunun GERÇEKTEN açılması ve uçların gerçekten çalışması
     Bu ortamda paketler taklit; app.js gerçek Express'le çalıştırılamıyor. Sunucuyu açan tek
     yer CI'ın e2e işi. Modül taşımasında sunucuyu açtırmayan üç hata vardı ve buradaki
     kontrollerin hepsi yeşildi. "Testler geçti" ile "sunucu açılıyor" AYNI ŞEY DEĞİLDİR.

     v2.146.0'dan beri iki kör nokta KAPANDI (scripts/check.mjs içinde):
       · tanımsız ad (free_idents.mjs)   → uç çağrılınca "Sunucu hatası"
       · eksik dışa verim (export_check.mjs) → sunucu hiç açılmaz
     Bunlar yalnızca BU iki sınıfı görür. Veritabanı şeması, SQL, null, sıralama, yetki ve
     iş kuralı hataları hâlâ yalnızca e2e'de çıkar.

  2. Dart TİP denetimi (flutter analyze)
     Yukarıdaki Dart ön denetimi yalnızca import ve tanımsız ad bakar. List<int> ↔ Set<int>
     gibi tip hataları ve null güvenliği YALNIZCA CI'ın Mobil işinde görülür.

  3. APK derlemesi
     Bağımlılıkların indirilmesi ve Gradle derlemesi yalnızca CI'da.

Yani: bu araç yeşil yandı diye yayına hazır DEĞİLDİR. CI'ın üç işi de (backend, e2e, Mobil)
yeşil olmalı.`);

process.exit(failed ? 1 : 0);
