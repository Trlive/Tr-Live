#!/usr/bin/env node
// Ortak nesnelerde OLMAYAN yöntem çağrılarını yakalar.
//
// NEDEN: `hub.toUser(...)` yazdım. Böyle bir yöntem yok — doğrusu `sendToUser`. Sözdizimi
// doğru, import doğru, tanımsız ad yok; hiçbir araç görmedi. O uç çağrıldığında
// `TypeError: hub.toUser is not a function` olacak ve kullanıcı "Sunucu hatası" görecekti.
//
// Bu, JavaScript'in en sessiz hata sınıflarından biri: nesne üzerindeki yöntem adı yalnızca
// çalışma anında çözülür. Tip denetleyici olmadan tek çare, az sayıdaki ORTAK nesnenin
// yöntemlerini tanımından okuyup çağrılarla karşılaştırmak.
//
// Kapsam bilerek dar: yalnızca aşağıdaki tekil nesneler. Her nesne için "yöntemler nerede
// tanımlı" bilgisi elle verilir, çünkü keyfi bir ifadenin türünü çıkarmak tip denetleyici
// işidir ve yarım yapılırsa yanlış alarm üretir.
//
// BU ARACIN GÖREMEDİĞİ: başka her nesne, zincirlenmiş çağrılar, dinamik ad (`hub[x]()`).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { blankNonCode } from './free_idents.mjs';

const SRC = new URL('../src/', import.meta.url).pathname;

/** nesne adı → yöntemlerin tanımlandığı dosya */
const SINGLETONS = {
  hub: 'infrastructure/websocket/realtime.js',
  // log bir NESNE, fonksiyon değil: log(...) diye çağırmak TypeError. Yanlış yöntem adı da öyle.
  log: 'infrastructure/observability/log.js',
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

/** Bir dosyadaki nesne değişmezinin/sınıfın yöntem adları. */
function methodsOf(file) {
  const code = blankNonCode(readFileSync(file, 'utf8'));
  const out = new Set();
  // `ad(...) {`  ve  `ad: (...) =>`  ve  `ad: function`
  for (const m of code.matchAll(/(?:^|[{;,])\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/gm)) {
    const open = m.index + m[0].length - 1;
    let d = 0; let i = open;
    for (; i < code.length; i++) {
      if (code[i] === '(') d++;
      else if (code[i] === ')') { d--; if (d === 0) break; }
    }
    if (/^\s*\{/.test(code.slice(i + 1))) out.add(m[1]);
  }
  for (const m of code.matchAll(/(?:^|[{;,])\s*([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?(?:\(|function)/gm)) out.add(m[1]);
  return out;
}

let bad = 0;
let checked = 0;
const files = walk(SRC);

for (const [obj, rel] of Object.entries(SINGLETONS)) {
  const defFile = join(SRC, rel);
  const known = methodsOf(defFile);
  if (known.size === 0) { console.error(`HATA: ${rel} içinde hiç yöntem bulunamadı — araç bozuk.`); process.exit(2); }
  const re = new RegExp(String.raw`\b${obj}\s*\.\s*([A-Za-z_$][\w$]*)\s*\(`, 'g');
  // Adın YEREL olarak tanımlandığı yer: `const log = []`, `let hub = ...`, `function f(log)`.
  const shadow = new RegExp(String.raw`(?:const|let|var)\s+${obj}\s*=|\(\s*${obj}\s*[,)]|,\s*${obj}\s*[,)]`);
  for (const f of files) {
    if (f === defFile) continue;
    const raw = readFileSync(f, 'utf8');
    const code = blankNonCode(raw);
    // Dosya bu tekil nesneyi GERÇEKTEN import etmiyorsa, aynı adlı yerel bir değişkendir.
    // `log` gibi yaygın adlarda bu şart olmadan araç 8 yanlış alarm veriyordu
    // (`const log = []` ardından `log.push(...)`).
    const imports = new RegExp(String.raw`import\s*\{[^}]*\b${obj}\b[^}]*\}\s*from\s*['"][^'"]*${rel.split('/').pop().replace('.', '\\.')}['"]`).test(raw);
    if (!imports) continue;
    // Import etse bile aynı adı yerelde gölgeliyorsa karar vermiyoruz.
    if (shadow.test(code)) continue;
    for (const m of code.matchAll(re)) {
      checked++;
      if (known.has(m[1])) continue;
      const line = raw.slice(0, m.index).split('\n').length;
      console.log(
        `${relative(SRC, f)}:${line}: "${obj}.${m[1]}()" diye bir yöntem YOK `
        + `(${rel} içinde tanımlı değil) → çalışma anında TypeError`,
      );
      bad++;
    }
  }
}

if (!checked) { console.error('HATA: hiçbir çağrı okunamadı — araç bozuk.'); process.exit(2); }
console.log(bad
  ? `\n${bad} olmayan yöntem çağrısı. Her biri o uç çağrıldığında "Sunucu hatası" demektir.`
  : `ortak nesne yöntemleri doğru (${checked} çağrı denetlendi)`);
process.exit(bad ? 1 : 0);
