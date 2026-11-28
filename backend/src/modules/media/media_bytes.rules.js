// Medya baytlarının okunması ve veritabanı kopyasının silinme kararı (bağımlılık yok, test edilebilir).
//
// Bağlam: dosyalar önce `media_files.data`'ya yazılır, arka plan işi onları R2'ye taşır (`storage_key` dolar); belirli bir süre sonra
// veritabanı kopyası silinir (`data = ''`, `db_copy_dropped = true`) — böylece veritabanı ve yedekler büyümez (rapor O-03).
// Kopyası silinmiş bir dosyanın baytlarını İÇERİDEN okuyan kod (küçültme, otomatik ikon) bunları depodan okumak zorundadır;
// aksi halde boş bayt üzerinde çalışıp yanlış sonuç üretir.
import crypto from 'node:crypto';

export class MediaBytesError extends Error {}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** Depodan okunan baytları satırdaki kayıtlı boyut ve sha256 ile doğrular; uyuşmazlıkta fırlatır (bozuk dosya sessizce işlenmesin). */
export function verifyFetched(buf, row) {
  const size = Number(row.size_bytes ?? 0);
  if (size > 0 && buf.length !== size) {
    throw new MediaBytesError(`Depodan okunan dosyanın boyutu kayıtla uyuşmuyor (${buf.length} ≠ ${size}).`);
  }
  if (row.sha256 && sha256(buf) !== row.sha256) {
    throw new MediaBytesError('Depodan okunan dosyanın sha256 değeri kayıtla uyuşmuyor.');
  }
  return buf;
}

/**
 * Taşınmış bir dosyanın veritabanı kopyası silinebilir mi? Depodaki dosya ŞİMDİ var olmalı ve boyutu kayıtlı boyutla aynı olmalı.
 * head: depodan HEAD sonucu ({ size }) ya da dosya yoksa null.
 */
export function dropDecision(row, head) {
  if (!head) return { ok: false, reason: 'depoda yok' };
  const size = Number(row.size_bytes ?? 0);
  if (!(size > 0)) return { ok: false, reason: 'kayıtlı boyut yok' };
  if (Number(head.size) !== size) return { ok: false, reason: 'boyut uyuşmuyor' };
  return { ok: true };
}

/**
 * Silme turu (saf döngü; depo ve veritabanı dışarıdan verilir): her satırı yeniden doğrular, yalnızca doğrulananı siler.
 * head(row) → depodan HEAD sonucu; drop(row) → silinen satır sayısı (0 ya da 1). Art arda `maxErrorStreak` hata olursa tur durur
 * (depo erişilemiyor: kalanlar sonraki turda). Başarılı bir HEAD hata sayacını sıfırlar.
 */
export async function processDrops(rows, { head, drop, maxErrorStreak = 3 }) {
  let dropped = 0; let unverified = 0; let streak = 0;
  for (const row of rows) {
    try {
      const h = await head(row);
      streak = 0;
      if (!dropDecision(row, h).ok) { unverified++; continue; }
      dropped += Number(await drop(row)) || 0;
    } catch {
      unverified++;
      streak++;
      if (streak >= maxErrorStreak) break;
    }
  }
  return { dropped, unverified, candidates: rows.length };
}

/**
 * Dosyanın baytları: veritabanı kopyası varsa o; silinmişse depodan okunup doğrulanır.
 * row: { data, storage_key, size_bytes, sha256 }; cfg: R2 yapılandırması (null olabilir); get: (cfg, key) => Buffer|null.
 */
export async function readBytes(row, { cfg, get }) {
  if (row.data && row.data.length > 0) return Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data);
  if (!row.storage_key) throw new MediaBytesError('Dosyanın baytları yok (veritabanında boş, depoda kayıt yok).');
  if (!cfg) throw new MediaBytesError('Dosya depoya taşınmış ama depo (R2) şu an yapılandırılmamış.');
  const buf = await get(cfg, row.storage_key);
  if (!buf) throw new MediaBytesError('Dosya depoda bulunamadı.');
  return verifyFetched(buf, row);
}

/** Depoya yalnızca bu biçimdeki anahtarlar yazılır (storage.js keyFor). Silme kuyruğu da yalnızca bunları siler: tablo bozulsa bile rastgele nesne silinmez. */
export const MEDIA_KEY_RE = /^media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,5}$/;
export const isMediaKey = (key) => typeof key === 'string' && MEDIA_KEY_RE.test(key);

/**
 * Silme kuyruğunu işler (saf döngü): del(key) depodan siler; done(key) kuyruktan çıkarır; fail(key, msg) deneme sayısını artırır.
 * Geçersiz anahtar depoya GİTMEZ: hatayla işaretlenir. Art arda `maxErrorStreak` depo hatası olursa tur durur (depo erişilemiyor).
 */
export async function processDeletes(keys, { del, done, fail, maxErrorStreak = 3 }) {
  let deleted = 0; let failed = 0; let streak = 0;
  for (const key of keys) {
    if (!isMediaKey(key)) { failed++; await fail(key, 'geçersiz anahtar biçimi'); continue; }
    try {
      await del(key);
      streak = 0;
      await done(key);
      deleted++;
    } catch (e) {
      failed++;
      streak++;
      await fail(key, String(e?.message || e).slice(0, 300));
      if (streak >= maxErrorStreak) break;
    }
  }
  return { deleted, failed };
}
