import { query } from '../../infrastructure/database/database.js';
import { getConfig } from '../system/app_config.service.js';
import { nonOverlapping } from '../../infrastructure/queue/ticker.js';
import { r2Config, keyFor, putObject, headObject, deleteObject, sha256hex, publicUrl } from '../../infrastructure/storage/storage.js';
import { backfillHashes } from '../assets/manifest.service.js';
import { processDrops, processDeletes } from './media_bytes.rules.js';
import { log } from '../../infrastructure/observability/log.js';

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
  const dq = (await query(`SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE attempts >= 20)::int AS stuck FROM media_delete_queue`)).rows[0];
  return { enabled: cfg !== null, publicBase: cfg?.publicBase || null, running, lastRun, deleteQueue: dq.n, deleteQueueStuck: dq.stuck, ...r.rows[0] };
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
        const u = await query(
          `UPDATE media_files SET storage_key = $2, sha256 = $3, offloaded_at = NOW() WHERE id = $1`,
          [row.id, key, sha256hex(buf)],
        );
        // Yükleme sürerken satır silindiyse (hesap silme vb.) az önce yazdığımız nesne sahipsiz kalırdı: hemen geri al.
        if (!u.rowCount) { await deleteObject(cfg, key).catch(() => {}); continue; }
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
 * Veritabanı kopyasını siler — taşıma doğrulandıktan SONRA ve `olderThanDays` gün geçtikten sonra (rapor O-03).
 *
 * Taşıma ile silme bilerek ayrı: R2'de bir sorun çıkarsa `storage_key` temizlenip eski davranışa dönülebilsin diye bir süre iki
 * kopya birden durur. Silme, geri alınamaz olduğu için her dosyada YENİDEN doğrulanır: depodaki dosya şimdi var olmalı ve boyutu
 * kayıtlı boyutla aynı olmalı (`dropDecision`). Doğrulanamayan dosya silinmez, kopyası durur. Depo art arda hata verirse tur durur.
 * Saatlik taşıma işiyle otomatik çalışır; panelden de elle tetiklenebilir.
 */
export async function dropDbCopies({ olderThanDays = 7, limit = 500 } = {}) {
  const cfg = r2Config(await getConfig());
  if (!cfg) return { skipped: 'R2 yapılandırılmamış', dropped: 0, unverified: 0 };
  const days = Math.max(1, Math.min(365, Number(olderThanDays) || 7));
  const rows = (await query(
    `SELECT id, storage_key, size_bytes FROM media_files
      WHERE storage_key IS NOT NULL AND db_copy_dropped = false
        AND offloaded_at < NOW() - ($1 || ' days')::interval
      ORDER BY offloaded_at LIMIT $2`,
    [String(days), Math.max(1, Math.min(5000, Number(limit) || 500))],
  )).rows;
  return processDrops(rows, {
    head: (row) => headObject(cfg, row.storage_key),
    // Koşullar UPDATE'te tekrarlanır: bu arada dosya geri alındıysa (storage_key temizlendiyse) silinmez.
    drop: async (row) => (await query(
      `UPDATE media_files SET data = ''::bytea, db_copy_dropped = true
        WHERE id = $1 AND db_copy_dropped = false AND storage_key = $2`,
      [row.id, row.storage_key],
    )).rowCount,
  });
}

/**
 * Silme kuyruğunu boşaltır: silinen medya satırlarının R2 nesnelerini siler (migration 118'deki tetikleyici kuyruğa yazar).
 * R2 yapılandırılmamışsa bekler (kuyruk durur, anahtar kaybolmaz). 20 denemede silinemeyen anahtar kuyrukta kalır ve durumda görünür.
 */
export async function drainDeleteQueue({ limit = 100 } = {}) {
  const cfg = r2Config(await getConfig());
  if (!cfg) return { skipped: 'R2 yapılandırılmamış', deleted: 0, failed: 0 };
  const keys = (await query(
    `SELECT storage_key FROM media_delete_queue WHERE attempts < 20 ORDER BY attempts, queued_at LIMIT $1`,
    [Math.max(1, Math.min(500, limit))],
  )).rows.map((r) => r.storage_key);
  return processDeletes(keys, {
    del: (key) => deleteObject(cfg, key),
    done: (key) => query(`DELETE FROM media_delete_queue WHERE storage_key = $1`, [key]),
    fail: (key, msg) => query(`UPDATE media_delete_queue SET attempts = attempts + 1, last_error = $2 WHERE storage_key = $1`, [key, msg]),
  });
}

/** Taşınmış bir dosyanın CDN adresi; taşınmamışsa null (sunucu kendi gövdesini döndürür). */
export function cdnUrlFor(cfg, storageKey) {
  return cfg && storageKey ? publicUrl(cfg, storageKey) : null;
}

/**
 * 10 dakikada bir çalışır: silme kuyruğu HER turda (ucuz; hesap silinince dosya hızla kalksın), taşıma + doğrulamalı kopya silme
 * saatte bir (her 6. tur). R2 kapalıysa hiçbir şey yapmaz (tek bir yapılandırma okuması dışında).
 */
export function startOffloadTicker() {
  let n = 0;
  return setInterval(nonOverlapping(async () => {
    const heavy = n++ % 6 === 0;
    try {
      const q = await drainDeleteQueue({});
      if (q.deleted || q.failed) log.info('media_delete_queue', q);
      if (!heavy) return;
      // Damgalar R2'den bağımsız: varlık listesi ve uygulamanın bütünlük denetimi için gerekli.
      await backfillHashes(50);
      await runOffload({});
      // Doğrulanmış taşımaların veritabanı kopyasını (7 gün sonra) otomatik sil: veritabanı ve yedekler şişmesin. Her turda en çok 100 dosya.
      const d = await dropDbCopies({ olderThanDays: 7, limit: 100 });
      if (d.dropped || d.unverified) log.info('media_db_copies_dropped', d);
      // R2 yapılandırılmamışsa medya veritabanında birikir; büyüklüğü eşiği aşınca uyar (yapılandırma panelden yapılır).
      if (d.skipped) {
        const st = await offloadStatus();
        const mb = Math.round(Number(st.bytes_pending) / 1048576);
        if (mb > 500) log.warn('media_db_growth', { pendingMB: mb, hint: 'R2 yapılandırılmadı: medya veritabanında birikiyor (panel → depolama).' });
      }
    } catch (e) {
      lastRun = { at: new Date().toISOString(), moved: 0, failed: 0, error: String(e?.message || e).slice(0, 300) };
    }
  }), 10 * 60 * 1000);
}
