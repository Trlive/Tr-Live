import { query } from '../../infrastructure/database/database.js';
import { getConfig } from '../system/app_config.service.js';
import { nonOverlapping } from '../../infrastructure/queue/ticker.js';
import { r2Config, keyFor, putObject, headObject, sha256hex, publicUrl } from '../../infrastructure/storage/storage.js';
import { backfillHashes } from '../assets/manifest.service.js';

/// Medyayı veritabanından R2'ye taşıyan arka plan işi.
///
/// Yükleme noktalarına dokunmaz: dosyalar her zamanki gibi `media_files`'a yazılır, bu iş onları
/// sonradan kopyalar. Yükleme anında R2'ye yazmaya kalksaydık, R2 bir an yanıt vermediğinde
/// kullanıcının yüklemesi başarısız olurdu — oysa taşıma beklemeye tahammüllü bir iştir.
///
/// Her dosya için sıra: R2'ye yaz → HEAD ile oku, boyutu karşılaştır → ancak o zaman
/// `storage_key` doldur. Doğrulama yapılmadan işaretlemek, var olmayan bir dosyaya yönlendirme
/// demek olurdu.

const BATCH = 25;        // Tek turda taşınan dosya sayısı: veritabanını ve R2'yi yormayan ölçü.
const MAX_BYTES = 64 * 1024 * 1024; // Tek turda okunan toplam bayt (bellek koruması).

let running = false;
let lastRun = { at: null, moved: 0, failed: 0, error: null };

export async function offloadStatus() {
  const r = await query(
    `SELECT COUNT(*)::bigint AS total,
            COUNT(*) FILTER (WHERE storage_key IS NOT NULL)::bigint AS moved,
            COUNT(*) FILTER (WHERE db_copy_dropped)::bigint AS dropped,
            COALESCE(SUM(size_bytes), 0)::bigint AS bytes_total,
            COALESCE(SUM(size_bytes) FILTER (WHERE storage_key IS NULL), 0)::bigint AS bytes_pending
       FROM media_files`,
  );
  const cfg = r2Config(await getConfig());
  return { enabled: cfg !== null, publicBase: cfg?.publicBase || null, running, lastRun, ...r.rows[0] };
}

/**
 * Bir turluk taşıma. Elle de çalıştırılabilir (panelden "şimdi taşı").
 * Aynı anda iki tur çalışmaz: aynı dosyayı iki kez yüklemek boşuna trafik.
 */
export async function runOffload({ limit = BATCH } = {}) {
  if (running) return { skipped: 'zaten çalışıyor' };
  const cfg = r2Config(await getConfig());
  if (!cfg) return { skipped: 'R2 yapılandırılmamış' };

  running = true;
  let moved = 0, failed = 0, error = null;
  try {
    const rows = (await query(
      `SELECT id, ext, mime, size_bytes, data FROM media_files
        WHERE storage_key IS NULL AND data IS NOT NULL
        ORDER BY created_at LIMIT $1`,
      [Math.max(1, Math.min(200, limit))],
    )).rows;

    let bytes = 0;
    for (const row of rows) {
      bytes += row.size_bytes || 0;
      if (bytes > MAX_BYTES && moved > 0) break; // bellek koruması: kalanlar sonraki turda
      const key = keyFor(row.id, row.ext);
      try {
        const buf = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data);
        await putObject(cfg, key, buf, row.mime);
        // Doğrulama: yazdığımızı geri okumadan "taşındı" demek, var olmayan dosyaya yönlendirmek olur.
        const head = await headObject(cfg, key);
        if (!head || head.size !== buf.length) {
          failed++;
          continue;
        }
        await query(
          `UPDATE media_files SET storage_key = $2, sha256 = $3, offloaded_at = NOW() WHERE id = $1`,
          [row.id, key, sha256hex(buf)],
        );
        moved++;
      } catch (e) {
        failed++;
        error = String(e?.message || e).slice(0, 300);
        // R2 tamamen erişilemezse turu erken bitir: 25 dosya için 25 kez beklemenin anlamı yok.
        if (failed >= 3 && moved === 0) break;
      }
    }
  } finally {
    running = false;
    lastRun = { at: new Date().toISOString(), moved, failed, error };
  }
  return lastRun;
}

/**
 * Veritabanı kopyasını siler — taşıma doğrulandıktan SONRA, ayrı ve bilinçli bir adım.
 *
 * Taşıma ile silme bilerek ayrıldı: R2'de bir sorun çıkarsa `storage_key` temizlenip eski
 * davranışa dönülebilsin diye. Silme yalnızca panelden, `olderThanDays` gün önce taşınmış
 * dosyalar için yapılır — yani bir süre iki kopya birden durur.
 */
export async function dropDbCopies({ olderThanDays = 7, limit = 500 } = {}) {
  const days = Math.max(1, Math.min(365, Number(olderThanDays) || 7));
  const r = await query(
    `UPDATE media_files SET data = ''::bytea, db_copy_dropped = true
      WHERE id IN (
        SELECT id FROM media_files
         WHERE storage_key IS NOT NULL AND db_copy_dropped = false
           AND offloaded_at < NOW() - ($1 || ' days')::interval
         ORDER BY offloaded_at LIMIT $2
      ) RETURNING id`,
    [String(days), Math.max(1, Math.min(5000, Number(limit) || 500))],
  );
  return { dropped: r.rowCount };
}

/** Taşınmış bir dosyanın CDN adresi; taşınmamışsa null (sunucu kendi gövdesini döndürür). */
export function cdnUrlFor(cfg, storageKey) {
  return cfg && storageKey ? publicUrl(cfg, storageKey) : null;
}

/** Saatte bir taşır. R2 kapalıysa hiçbir şey yapmaz (tek bir yapılandırma okuması dışında). */
export function startOffloadTicker() {
  return setInterval(nonOverlapping(async () => {
    try {
      // Damgalar R2'den bağımsız: varlık listesi ve uygulamanın bütünlük denetimi için gerekli.
      await backfillHashes(50);
      await runOffload({});
    } catch (e) {
      lastRun = { at: new Date().toISOString(), moved: 0, failed: 0, error: String(e?.message || e).slice(0, 300) };
    }
  }), 60 * 60 * 1000);
}
