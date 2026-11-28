import pg from 'pg';
import { config } from '../../config.js';
import { recordQuery } from '../observability/metrics.js';

const { Pool } = pg;
let pool;
// Küçük/ücretsiz veritabanı planlarında bağlantı sınırı düşüktür (Aiven Free: toplam 20, bir kısmını Aiven kendisi kullanır;
// Render yeni sürümü açarken eski sürüm de birkaç dakika açık kalır). Havuz bu yüzden 5 ile sınırlı; DATABASE_POOL_MAX ile değişir.
const POOL_MAX = Math.min(Math.max(Number(process.env.DATABASE_POOL_MAX) || 5, 1), 50);
// Donma koruması: takılan tek bir sorgu ya da yarıda bırakılmış bir işlem havuzdaki bağlantıları (ve tuttuğu kilitleri) süresiz
// tutarsa bütün uygulama durur (odalar, hediyeler, girişler). Sınırlar ortam değişkeniyle ayarlanır; 0 = kapalı.
//  - DB_STATEMENT_TIMEOUT_MS (varsayılan 30 sn): tek sorgunun en uzun süresi. Aşan sorgu iptal edilir (57014), istek hata alır.
//  - DB_IDLE_TX_TIMEOUT_MS (varsayılan 60 sn): BEGIN'den sonra hiçbir sorgu gelmeden açık bekleyen işlem kapatılır.
// Uzun sürmesi doğal işler (mutabakat taraması, dönem kapanışı) kendi işlemlerinde `SET LOCAL statement_timeout` ile daha uzun
// süre alır; migration çalıştırıcısı sınırı kapatır (büyük indeks oluşturmak 30 sn'yi aşabilir).
const msEnv = (name, def) => {
  const v = process.env[name];
  if (v === undefined || v === '') return def;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : def;
};

function sslOption() {
  // Sağlayıcının CA sertifikası verilirse (ör. Aiven "CA certificate") sertifika tam doğrulanır.
  if (process.env.DATABASE_CA) return { ca: process.env.DATABASE_CA.replace(/\\n/g, '\n'), rejectUnauthorized: true };
  if (config.databaseSsl === 'false') return false;
  if (config.databaseSsl === 'true') return { rejectUnauthorized: true };
  return { rejectUnauthorized: false }; // 'no-verify'
}

/**
 * Bağlantı adresindeki SSL parametreleri (Aiven/Supabase/Neon adreslerinin sonundaki ?sslmode=require gibi) pg'de
 * aşağıdaki ssl ayarını ezer ve sağlayıcının kendi sertifika zinciriyle "self-signed certificate" hatası verir.
 * Bu yüzden adresten çıkarılır; SSL davranışı DATABASE_SSL (ve isteğe bağlı DATABASE_CA) ile belirlenir.
 */
export function dbTarget(raw) {
  try {
    const u = new URL(raw);
    const mode = (u.searchParams.get('sslmode') || '').toLowerCase();
    for (const k of ['sslmode', 'ssl', 'sslrootcert', 'sslcert', 'sslkey', 'sslcrl', 'uselibpqcompat']) u.searchParams.delete(k);
    return { connectionString: u.toString(), sslDisabled: mode === 'disable' };
  } catch {
    return { connectionString: raw, sslDisabled: false };
  }
}

export function db() {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL tanımlı değil');
    const t = dbTarget(process.env.DATABASE_URL);
    pool = new Pool({
      connectionString: t.connectionString,
      ssl: t.sslDisabled ? false : sslOption(),
      max: POOL_MAX,
      // Boştaki bağlantılar 5 dk açık tutulur: veritabanı ayrı bir sunucuda (Aiven) olduğundan her yeni bağlantı
      // (TCP + SSL + şifre doğrulama) birkaç gidiş-dönüş, yani her istekte fazladan ~0,3–1 sn demekti. Eskiden 10 sn
      // boşta kalan bağlantı kapanıyor, az kullanıcıyla neredeyse her istek yeni bağlantı açıyordu.
      idleTimeoutMillis: 5 * 60 * 1000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
      // Bağlantı alınamazsa istek sonsuza dek beklemesin: 15 sn sonra anlaşılır hata döner.
      connectionTimeoutMillis: 15000,
      statement_timeout: msEnv('DB_STATEMENT_TIMEOUT_MS', 30000),
      idle_in_transaction_session_timeout: msEnv('DB_IDLE_TX_TIMEOUT_MS', 60000),
    });
    pool.on('error', (error) => console.error('PostgreSQL havuz hatası:', error.message));
  }
  return pool;
}

// Sorgu süresi ölçülür: "uygulama yavaş" şikâyetinde suçlunun uç mu yoksa tek bir SQL mi
// olduğunu ayırt etmenin tek yolu bu. Ölçüm yalnızca SÜRE ve normalleştirilmiş sorgu
// metnini alır; parametre DEĞERLERİ hiçbir zaman kayda girmez.
async function timed(sql, run) {
  const t = process.hrtime.bigint();
  try {
    const r = await run();
    recordQuery({ ms: Number(process.hrtime.bigint() - t) / 1e6, sql });
    return r;
  } catch (error) {
    recordQuery({ ms: Number(process.hrtime.bigint() - t) / 1e6, sql, failed: true });
    throw error;
  }
}

export const query = (text, params = []) => timed(text, () => db().query(text, params));

/** Bağlantı havuzu durumu (yönetim paneli). */
export function poolStats() {
  if (!pool) return { total: 0, idle: 0, waiting: 0, max: POOL_MAX };
  return { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount, max: POOL_MAX };
}

export async function tx(fn) {
  const client = await db().connect();
  // Havuzdan ALINMIŞ bağlantıda 'error' olayını dinleyen olmazsa Node süreci ÇÖKER (havuzun kendi dinleyicisi yalnızca boştaki
  // bağlantıları kapsar). Veritabanı bağlantıyı kapatabilir: açık işlem süre sınırı (DB_IDLE_TX_TIMEOUT_MS), yeniden başlatma,
  // ağ kopması. Bu durumda işlem normal bir hatayla geri döner ve bozuk bağlantı havuza GERİ KONMAZ (atılır).
  let broken = null;
  const onError = (error) => { broken = error; console.error('PostgreSQL işlem bağlantısı koptu:', error.message); };
  client.on('error', onError);
  // İşlem içindeki sorgular da ölçülür. Yavaş SQL'lerin çoğu işlem içindedir (kilit bekleme),
  // ölçüm yalnızca havuz üzerinden gidenleri saysaydı en önemli kısmı kaçırırdı.
  const raw = client.query.bind(client);
  // Tüm argümanlar olduğu gibi geçirilir: pg'nin query(text, values, callback) biçimi de
  // çalışsın. Yalnızca metin sorgular ölçülür; nesne/akış biçimleri dokunulmadan geçer.
  client.query = (...args) => (typeof args[0] === 'string' ? timed(args[0], () => raw(...args)) : raw(...args));
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* bağlantı zaten kopmuş olabilir */ }
    throw error;
  } finally {
    // Yama SÖKÜLMEK ZORUNDA: bağlantı havuza geri döner ve aynı nesne yeniden kullanılır.
    // Sökülmezse her tx() bir öncekinin sarmalayıcısını sarar; sarmalayıcı zinciri büyür,
    // her sorgu birden çok kez sayılır ve bellek sızar.
    client.query = raw;
    client.removeListener('error', onError);
    client.release(broken ?? undefined);
  }
}

export async function closeDb() {
  if (pool) { await pool.end(); pool = undefined; }
}
