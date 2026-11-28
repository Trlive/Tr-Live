import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { db, closeDb } from './database.js';

// Çalışma dizininden bağımsız: migration dosyaları bu dosyanın yanındadır.
// Migration klasörü `src/migrations`. Bu dosya `src/infrastructure/database/` altına taşındığı
// için yol kendi konumuna göre DEĞİL, src köküne göre çözülür.
//
// Taşımada gözden kaçan buydu: dosyanın kendisi doğru yere gitti ama içinde okuduğu klasörün
// yolu eski konuma göreydi. ENOENT: '.../infrastructure/database/migrations'.
const dir = new URL('../../migrations/', import.meta.url).pathname;
const LOCK_ID = 727001; // aynı anda iki süreç migration çalıştırmasın

// Migration'larda sorgu süre sınırı yok: büyük tabloya indeks/sütun eklemek 30 sn'yi aşabilir (bkz. database.js).
process.env.DB_STATEMENT_TIMEOUT_MS = '0';
process.env.DB_IDLE_TX_TIMEOUT_MS = '0';
const client = await db().connect();
client.on('error', (e) => console.error('Migration bağlantısı koptu:', e.message));
let failed = false;
try {
  await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  const files = (await fs.readdir(dir)).filter((x) => x.endsWith('.sql')).sort();
  for (const file of files) {
    const version = file.split('_')[0];
    const done = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [version]);
    if (done.rowCount) continue;
    const sql = await fs.readFile(path.join(dir, file), 'utf8');
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(version) VALUES($1)', [version]);
      await client.query('COMMIT');
      console.log('Uygulandı:', file);
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`${file} uygulanamadı: ${error.message}`);
    }
  }
  console.log('Migration tamamlandı.');
} catch (error) {
  failed = true;
  console.error(error.message);
} finally {
  try { await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]); } catch (_) { /* bağlantı kapanıyor */ }
  client.release();
  await closeDb();
}
if (failed) process.exit(1);
