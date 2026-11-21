import crypto from 'node:crypto';
import { query } from '../../infrastructure/database/database.js';

/// Varlık listesi (manifest): uygulamanın önceden indirmesi gereken dosyaların sürümlü listesi.
///
/// ## Niçin gerek var
///
/// Bugün uygulama hangi dosyayı indireceğini **tesadüfen** öğreniyor: hediye paneli açılınca
/// `/api/gifts` çağrılıyor, en ucuz 24 hediye alınıp indiriliyor. Sonuçları:
///
/// * Dosyanın **ne kadar** olduğu bilinmiyor — yarım inen dosya bozuk olarak önbellekte kalıyordu.
/// * Pahalı ve sık kullanılan bir hediye listeye girmiyorsa, ilk gönderildiğinde donarak iniyor.
/// * Bir dosya bozuk yüklendiyse geri dönüş yolu yok; her telefon onu tek tek indirmeye çalışıyor.
///
/// Liste bunları çözüyor: hangi dosya, ne boyutta, hangi damgayla, hangi öncelikle.
///
/// ## Sürüm ve geri alma
///
/// Listenin sürümü, içeriğinin özetidir. Bir varlık değişince sürüm değişir; değişmezse uygulama
/// `If-None-Match` ile sorar ve 304 alır — yani liste bedava. Uygulama **son çalışan sürümü**
/// saklar: yeni listedeki dosyalar inmezse eskisine döner.

const TTL_MS = 60_000;
let cache = null;

/**
 * Paylaşılan varlıklar: her kullanıcıda aynı olan, odada aniden gereken dosyalar.
 *
 * Kullanıcıya özel görseller (profil fotoğrafı, oda kapağı) listeye GİRMEZ: kişi başına değişir,
 * listeyi şişirir ve zaten görüldüğü anda iniyor.
 *
 * `priority` indirme sırasını belirler: 1 = odada her an gerekebilir (giriş efekti, ucuz hediye),
 * 2 = sık, 3 = nadir. Uygulama ölçülü bağlantıda yalnızca 1'leri indirir.
 */
const SQL = `
  WITH items AS (
    -- Hediyeler: ucuzdan pahalıya. Ucuz hediyeler çok daha sık gönderilir.
    SELECT 'gift'   AS kind, id::text AS ref, animation_url AS url,
           CASE WHEN coin_price <= 1000 THEN 1 WHEN coin_price <= 50000 THEN 2 ELSE 3 END AS priority
      FROM gifts WHERE is_active AND animation_url IS NOT NULL AND animation_url <> ''
    UNION ALL
    SELECT 'gift_icon', id::text, icon_url, 1
      FROM gifts WHERE is_active AND icon_url IS NOT NULL AND icon_url <> ''
    UNION ALL
    -- Giriş efektleri: odaya biri girdiği anda gerekir, beklemeye tahammülü yok.
    SELECT 'entrance', id::text, animation_url, 1
      FROM entrance_effects WHERE is_active AND animation_url IS NOT NULL AND animation_url <> ''
  ),
  resolved AS (
    SELECT i.kind, i.ref, i.url, i.priority,
           m.id AS media_id, m.size_bytes, m.sha256, m.storage_key
      FROM items i
      LEFT JOIN media_files m
        ON m.id = NULLIF(substring(i.url from '/media/([0-9a-f-]{36})'), '')::uuid
  )
  SELECT kind, ref, url, priority, size_bytes, sha256, (storage_key IS NOT NULL) AS on_cdn
    FROM resolved
   ORDER BY priority, kind, ref
`;

export async function buildManifest() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const rows = (await query(SQL)).rows;
  const assets = rows.map((r) => ({
    kind: r.kind,
    url: r.url,
    priority: r.priority,
    // Boyut, uygulamanın yarım inen dosyayı anlaması için. Bilinmiyorsa null gönderilir;
    // uydurulmuş bir sayı, doğru inen dosyayı attırırdı.
    bytes: r.size_bytes ?? null,
    sha256: r.sha256 ?? null,
    onCdn: r.on_cdn === true,
  }));
  // Sürüm = içeriğin özeti. Böylece "bir şey değişti mi" sorusu tek karşılaştırmayla yanıtlanır
  // ve aynı içerik her zaman aynı sürümü verir (sunucu yeniden başlasa da).
  const version = crypto.createHash('sha256')
    .update(JSON.stringify(assets.map((a) => [a.url, a.bytes, a.sha256])))
    .digest('hex').slice(0, 16);
  const totalBytes = assets.reduce((n, a) => n + (a.bytes || 0), 0);
  const value = { version, count: assets.length, totalBytes, assets };
  cache = { at: Date.now(), value };
  return value;
}

export function invalidateManifest() { cache = null; }

/// Damgası olmayan dosyalara sha256 yazar.
///
/// R2 açık olmasa da çalışır: damga, uygulamanın bütünlük denetimi ve listenin sürümü için
/// gerekli. Turda az sayıda dosya işlenir — tüm tabloyu birden okumak büyük kurulumda
/// veritabanını kilitlerdi.
export async function backfillHashes(limit = 50) {
  const rows = (await query(
    `SELECT id, data FROM media_files
      WHERE sha256 IS NULL AND data IS NOT NULL AND length(data) > 0
      ORDER BY created_at LIMIT $1`,
    [Math.max(1, Math.min(500, limit))],
  )).rows;
  let done = 0;
  for (const r of rows) {
    const buf = Buffer.isBuffer(r.data) ? r.data : Buffer.from(r.data);
    await query(`UPDATE media_files SET sha256 = $2 WHERE id = $1 AND sha256 IS NULL`,
      [r.id, crypto.createHash('sha256').update(buf).digest('hex')]);
    done++;
  }
  if (done) invalidateManifest();
  return { hashed: done, remaining: rows.length === 0 ? 0 : -1 };
}
