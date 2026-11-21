// Oyun paketlerinin veritabanı erişimini kendi tablolarına daraltan kapı.
//
// DURUM (denetim O-01): Panelden yüklenen oyun paketi sunucu sürecinin İÇİNDE çalışıyor ve
// kendisine ham `query`/`tx` veriliyordu. Yani hatalı ya da kötü niyetli bir paket
// `users`, `wallet_transactions`, `admin_sessions` — veritabanının tamamını okuyup
// yazabiliyordu. Yükleme yetkisi yalnızca süper adminde olsa da, model "oyun paketi satın
// al, kur" noktasına gittiğinde bu kabul edilemez.
//
// BU KAPININ YAPTIĞI: paketin çalışma anındaki her SQL'ini okuyup yalnızca KENDİ
// tablolarına dokunduğunu doğrular. Tablo listesi, paketin kurulum SQL'inden çıkarılıp
// kayda yazılır (game_plugins.tables); paket sonradan listeye tablo ekleyemez.
//
// BU KAPININ YAPMADIĞI — açıkça yazıyorum, çünkü yarı güvenlik, güvenlik sanılırsa
// tehlikelidir:
//   · Bu bir KUM HAVUZU DEĞİLDİR. Paket hâlâ aynı süreçte çalışır; `import('node:fs')`
//     ya da `process.env` ile buradaki denetimi tamamen atlayabilir.
//   · Yani bu kapı, DÜRÜST ama hatalı paketi durdurur ve niyeti açık hale getirir.
//     KÖTÜ NİYETLİ paketi durdurmaz.
//   · Kötü niyetliye karşı tek gerçek çözüm paketi AYRI SÜREÇTE/kapsayıcıda, kendi
//     veritabanı kullanıcısıyla çalıştırmaktır (O-01 adım 3). O iş bitene kadar
//     üçüncü taraf paket yüklenmemelidir.

const DDL = /^(create|drop|alter|truncate|grant|revoke|comment|copy|call|do|set|reset|vacuum|analyze|reindex|cluster|listen|notify|prepare|execute|deallocate|begin|commit|rollback|savepoint|lock|refresh|import|security)\b/i;
const FORBIDDEN = /\b(pg_[a-z_]*|information_schema|current_setting|set_config|dblink[a-z_]*|lo_import|lo_export|pg_sleep)\b/i;
const STARTS = /^(select|insert|update|delete|with|values|table)\b/i;

/** SQL'deki dize, dolar-tırnak ve yorumları boşlukla değiştirir (uzunluk korunur). */
export function blankSql(sql) {
  const out = sql.split('');
  const blank = (a, b) => { for (let i = a; i < b; i++) if (out[i] !== '\n') out[i] = ' '; };
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    if (c === '-' && sql[i + 1] === '-') { let j = i; while (j < n && sql[j] !== '\n') j++; blank(i, j); i = j; continue; }
    if (c === '/' && sql[i + 1] === '*') {
      // SQL'de blok yorumlar İÇ İÇE geçebilir (standart böyle); saymazsak erken kapatırız.
      let j = i + 2; let depth = 1;
      while (j < n && depth > 0) {
        if (sql[j] === '/' && sql[j + 1] === '*') { depth++; j += 2; continue; }
        if (sql[j] === '*' && sql[j + 1] === '/') { depth--; j += 2; continue; }
        j++;
      }
      blank(i, j); i = j; continue;
    }
    if (c === "'") {
      let j = i + 1;
      // '' kaçışı: kapanış tırnağından sonra bir tırnak daha varsa dize sürüyor demektir.
      while (j < n) { if (sql[j] === "'") { if (sql[j + 1] === "'") { j += 2; continue; } break; } j++; }
      blank(i + 1, Math.min(j, n)); i = Math.min(j + 1, n); continue;
    }
    if (c === '"') { // tırnaklı tanımlayıcı: içerik ADdır, silinmez
      let j = i + 1;
      while (j < n && sql[j] !== '"') j++;
      i = Math.min(j + 1, n); continue;
    }
    if (c === '$') { // $$ ... $$ ya da $etiket$ ... $etiket$
      const m = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        const j = end < 0 ? n : end + tag.length;
        blank(i, j); i = j; continue;
      }
    }
    i++;
  }
  return out.join('');
}

/** Bir sorgunun dokunduğu tablo adları (CTE adları hariç). */
export function tablesOf(sql) {
  const code = blankSql(sql);
  // WITH ad AS ( …  ve  , ad AS ( …  → bunlar gerçek tablo değil, sorgu içi geçici ad.
  const ctes = new Set();
  if (/\bwith\b/i.test(code)) {
    for (const m of code.matchAll(/(?:\bwith\b|,)\s*(?:recursive\s+)?([a-zA-Z_][\w$]*)\s+as\s*\(/gi)) ctes.add(m[1].toLowerCase());
  }
  const found = new Set();
  for (const m of code.matchAll(/\b(from|join|into|update|using)\s+(only\s+)?([a-zA-Z_][\w$]*)(\s*\.\s*([a-zA-Z_][\w$]*))?/gi)) {
    const schema = m[5] ? m[3].toLowerCase() : null;
    const name = (m[5] ?? m[3]).toLowerCase();
    if (ctes.has(name) && !schema) continue;
    found.add(schema ? `${schema}.${name}` : name);
  }
  return [...found];
}

/**
 * Paketin çalıştırmak istediği SQL'i denetler.
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
export function checkPluginSql(sql, allowed) {
  const text = String(sql ?? '').trim();
  if (!text) return { ok: false, reason: 'Boş sorgu.' };
  const code = blankSql(text);
  // Tek deyim: ";" ile ikinci bir komut eklenmesi (zincirleme) engellenir.
  if (code.replace(/;\s*$/, '').includes(';')) return { ok: false, reason: 'Tek seferde tek sorgu çalıştırılabilir.' };
  if (!STARTS.test(code.trimStart())) return { ok: false, reason: 'Yalnızca SELECT / INSERT / UPDATE / DELETE / WITH çalıştırılabilir.' };
  if (DDL.test(code.trimStart())) return { ok: false, reason: 'Şema değiştiren komutlar yalnızca kurulum SQL\'inde olur.' };
  const bad = FORBIDDEN.exec(code);
  if (bad) return { ok: false, reason: `Sistem nesnesine erişilemez: ${bad[0]}` };
  const allow = new Set((allowed ?? []).map((t) => String(t).toLowerCase()));
  for (const t of tablesOf(text)) {
    if (!allow.has(t)) return { ok: false, reason: `Bu tabloya erişim yetkiniz yok: ${t}` };
  }
  return { ok: true };
}

/**
 * Kurulum SQL'inin oluşturduğu tablo adları.
 *
 * Kurulum SQL'i bir kez, yükleme anında ve süper admin onayıyla çalışır; bu yüzden orada
 * DDL serbesttir. Buradaki amaç yasaklamak değil, paketin SAHİP OLDUĞU tabloları kayda
 * geçirmek: çalışma anındaki izin listesi budur.
 */
export function createdTables(sql) {
  const code = blankSql(String(sql ?? ''));
  const out = new Set();
  for (const m of code.matchAll(/\bcreate\s+(?:unlogged\s+|temp\s+|temporary\s+)?table\s+(?:if\s+not\s+exists\s+)?([a-zA-Z_][\w$]*)/gi)) {
    out.add(m[1].toLowerCase());
  }
  return [...out];
}
