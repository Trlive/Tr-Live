#!/usr/bin/env node
// SQL yer tutucuları ile verilen değerlerin sayısı tutuyor mu?
//
// NEDEN: `INSERT INTO host_statements(...38 sütun...) VALUES($1..$38)` yazıp diziye 37 değer
// vermek, PostgreSQL'in "bind message supplies 37 parameters, but prepared statement
// requires 38" hatasını veriyor. Sözdizimi doğru, import doğru, tanımsız ad yok. Hata
// YALNIZCA o sorgu çalıştığında çıkıyor — dönem kapanışı gibi ayda bir çalışan bir yolda
// bu, aylar sonra ve en kötü anda ortaya çıkar.
//
// Bu sürümde host_statements INSERT'ine 10 sütun ekledim; elle saymak zorundaydım.
//
// NE DENETLENİYOR: `query(`...`, [ ... ])` / `c.query(`...`, [ ... ])` biçimindeki
// çağrılarda sorgudaki en büyük $n ile dizideki eleman sayısı. Ayrıca INSERT'lerde sütun
// sayısı ile VALUES içindeki yer tutucu sayısı.
//
// BU ARACIN GÖREMEDİĞİ: dizisi değişkende tutulan çağrılar (`query(sql, params)`), koşullu
// olarak büyüyen diziler (`[...a, ...b]`), parçalı kurulan SQL. Bunlar ATLANIYOR ve kaç
// tanesinin atlandığı sonda yazılıyor — "hepsini denetledim" yanılgısı olmasın.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { blankNonCode } from './free_idents.mjs';

const SRC = new URL('../src/', import.meta.url).pathname;

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

/** Dizi değişmezinin elemanlarını sayar.
 *
 *  Virgül sayarak DEĞİL, boş olmayan parçaları sayarak: JavaScript'te `[a, b,]` iki
 *  elemandır. İlk denememde virgül saymıştım ve sondaki virgül yüzünden araç, dizinin
 *  sonundan bir değer SİLDİĞİM hâlde "uyuşuyor" dedi — yani kurduğu tuzağa kendisi
 *  düştü. Sessizce atlamak, hiç denetlememekten kötüdür.
 *
 *  Yayılma (`...x`) varsa eleman sayısı derlenmeden bilinemez: null döner, çağıran atlar. */
function countElements(src, open) {
  let depth = 0;
  let n = 0;
  let cur = false;      // şu anki parçada boşluk dışı bir şey görüldü mü
  let spread = false;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if ('([{'.includes(ch)) { if (depth >= 1) cur = true; depth++; continue; }
    if (')]}'.includes(ch)) {
      depth--;
      if (depth === 0) return spread ? null : n + (cur ? 1 : 0);
      continue;
    }
    if (depth === 1) {
      if (ch === ',') { if (cur) n++; cur = false; }
      else if (!/\s/.test(ch)) {
        cur = true;
        if (ch === '.' && src.slice(i, i + 3) === '...') spread = true;
      }
    }
  }
  return null;
}

/** Parantez grubundaki üst düzey eleman sayısı (boş olmayan parçalar; sondaki virgül
 *  fazladan eleman saymaz). Açılış parantezinin dizinideki yerini alır. */
function topLevelCount(src, open) {
  let depth = 0;
  let n = 0;
  let cur = false;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if ('(['.includes(ch)) { if (depth >= 1) cur = true; depth++; continue; }
    if (')]'.includes(ch)) {
      depth--;
      if (depth === 0) return n + (cur ? 1 : 0);
      continue;
    }
    if (depth === 1) {
      if (ch === ',') { if (cur) n++; cur = false; }
      else if (!/\s/.test(ch)) cur = true;
    }
  }
  return null;
}

let bad = 0;
let checked = 0;
let skipped = 0;

for (const file of walk(SRC)) {
  const raw = readFileSync(file, 'utf8');
  const code = blankNonCode(raw);

  for (const m of code.matchAll(/\b(?:\w+\.)?query\s*\(\s*`/g)) {
    // Sorgu metni: blankNonCode backtick'leri koruyor ama içeriği boşalttı; metni ham
    // kaynaktan okuyoruz, yer tutucular orada.
    const tickOpen = m.index + m[0].length - 1;
    let tickClose = tickOpen + 1;
    while (tickClose < raw.length && !(raw[tickClose] === '`' && raw[tickClose - 1] !== '\\')) tickClose++;
    const sql = raw.slice(tickOpen + 1, tickClose);
    const after = code.slice(tickClose + 1);
    const line = raw.slice(0, m.index).split('\n').length;

    // Şablon değişkeni içeren sorgu STATİK OLARAK SAYILAMAZ: `${visible}` çalışma anında
    // içinde $2, $3 taşıyan SQL'e açılıyor, metinde ise tek $1 görünüyor. İlk denememde bu
    // gözden kaçtı ve araç sağlam bir sorguyu hatalı bildirdi. Böylelerini atlıyoruz.
    if (sql.includes('${')) { skipped++; continue; }

    const nums = [...sql.matchAll(/\$(\d+)/g)].map((x) => Number(x[1]));
    const maxPh = nums.length ? Math.max(...nums) : 0;

    // INSERT'te sütun sayısı ile VALUES'taki ELEMAN sayısı aynı olmalı.
    //
    // Yer tutucu sayısıyla karşılaştırmak YANLIŞ olur: VALUES içinde düz değer de olabilir
    // (`VALUES($1,$2,'usd_withdrawal',$3)`) ya da `NOW()` gibi bir çağrı. İlk denememde
    // yer tutucu saymıştım ve araç 150'den fazla yanlış alarm verdi.
    const insAt = /INSERT\s+INTO\s+[\w."]+\s*\(/i.exec(sql);
    if (insAt) {
      const colOpen = insAt.index + insAt[0].length - 1;
      const cols = topLevelCount(sql, colOpen);
      const vAt = /\bVALUES\s*\(/i.exec(sql.slice(colOpen));
      if (cols !== null && vAt) {
        const vals = topLevelCount(sql, colOpen + vAt.index + vAt[0].length - 1);
        if (vals !== null && cols !== vals) {
          console.log(`${relative(SRC, file)}:${line}: INSERT sütun sayısı ${cols}, VALUES eleman sayısı ${vals} — uyuşmuyor`);
          bad++;
        }
      }
    }

    // Diziyle karşılaştırma: `, [` hemen ardından gelmeli.
    const arr = /^\s*,\s*\[/.exec(after);
    if (!arr) { skipped++; continue; }
    const openIdx = tickClose + 1 + after.indexOf('[');
    const count = countElements(code, openIdx);
    if (count === null) { skipped++; continue; }
    checked++;
    if (count !== maxPh) {
      console.log(
        `${relative(SRC, file)}:${line}: SQL ${maxPh} yer tutucu bekliyor, dizide ${count} değer var `
        + `→ çalışma anında "bind message supplies ${count} parameters, but prepared statement requires ${maxPh}"`,
      );
      bad++;
    }
  }
}

if (!checked) { console.error('HATA: hiçbir sorgu denetlenemedi — araç bozuk.'); process.exit(2); }
console.log(bad
  ? `\n${bad} uyuşmayan sorgu. Her biri o yol çalıştığında "Sunucu hatası" demektir.`
  : `SQL yer tutucuları ile değerler uyuşuyor (${checked} sorgu denetlendi, ${skipped} tanesi değişkenli/yayılmalı olduğu için atlandı)`);
process.exit(bad ? 1 : 0);
