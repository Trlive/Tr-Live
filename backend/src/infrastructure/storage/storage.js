import crypto from 'node:crypto';
import { signRequest } from './s3_sign.js';
import { getConfig } from '../../modules/system/app_config.service.js';

/// Nesne deposu: medya dosyalarının Postgres yerine R2/CDN'de durması.
///
/// ## Sorun
///
/// Bugün her hediye animasyonu, çerçeve ve oda teması `media_files` tablosunda **bayt olarak**
/// duruyor. Her görüntüleme bir veritabanı okuması demek. Oda kalabalıklaştıkça aynı animasyon
/// onlarca kez okunuyor; veritabanı asıl işini (finansal işlemler) yaparken görsel trafiğiyle
/// uğraşıyor. Yedek dosyaları da bu yüzden gereksiz büyük.
///
/// ## Çözüm ve neden böyle
///
/// Dosyalar R2'ye taşınıp CDN'den sunulacak. Ama **yükleme noktalarına dokunulmuyor** — sekiz ayrı
/// yerde `INSERT INTO media_files` var ve hepsini değiştirmek, yükleme anında hata çıkarma riski
/// demekti. Bunun yerine dosyalar veritabanına her zamanki gibi yazılıyor, arka planda çalışan
/// taşıyıcı onları R2'ye kopyalıyor ve `storage_key` alanını dolduruyor. `/media/:id` adresi
/// `storage_key` doluysa CDN'e yönlendiriyor.
///
/// Böylece: yükleme yolu hiç değişmedi, taşıma geri alınabilir, R2 kapalıysa sistem bugünkü gibi
/// çalışmaya devam ediyor.

export function r2Config(c) {
  const id = (c.r2AccountId || '').trim();
  const bucket = (c.r2Bucket || '').trim();
  const key = (c.r2AccessKey || '').trim();
  const secret = (c.r2SecretKey || '').trim();
  const base = (c.r2PublicBase || '').trim().replace(/\/+$/, '');
  // Beşi birden dolu değilse depo kapalıdır. Yarım yapılandırma ile denemek, yarısı R2'de
  // yarısı veritabanında dosya bırakır; o karışıklığı temizlemek taşımaktan zordur.
  if (!id || !bucket || !key || !secret || !base) return null;
  return { host: `${id}.r2.cloudflarestorage.com`, bucket, accessKey: key, secretKey: secret, publicBase: base };
}

export async function storageEnabled() {
  return r2Config(await getConfig()) !== null;
}

/** Dosyanın depodaki adı. Kimlik + uzantı: içerik değişmez olduğu için önbellek sonsuza kadar geçerli. */
export const keyFor = (id, ext) => `media/${id}.${ext}`;

/** CDN adresi. */
export const publicUrl = (cfg, key) => `${cfg.publicBase}/${key}`;

export const sha256hex = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

async function send(cfg, method, key, body, extraHeaders = {}) {
  const path = `/${cfg.bucket}/${key}`;
  const headers = signRequest({
    method, host: cfg.host, path, body: body ?? '',
    accessKey: cfg.accessKey, secretKey: cfg.secretKey, headers: extraHeaders,
  });
  const res = await fetch(`https://${cfg.host}${path}`, { method, headers, body: body ?? undefined });
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => '');
    throw new Error(`R2 ${method} ${res.status}: ${text.slice(0, 200)}`);
  }
  return res;
}

/** Dosyayı depoya yazar. Aynı anahtar yeniden yazılırsa içerik aynıdır (kimlik içerikle birlikte değişir). */
export async function putObject(cfg, key, buf, mime) {
  await send(cfg, 'PUT', key, buf, {
    'content-type': mime || 'application/octet-stream',
    // Dosya adı kimlik içerdiği için içerik asla değişmez: tarayıcı ve CDN sonsuza kadar saklayabilir.
    'cache-control': 'public, max-age=31536000, immutable',
  });
}

/** Dosyanın depoda olup olmadığını ve boyutunu söyler (taşıma doğrulaması için). */
export async function headObject(cfg, key) {
  const res = await send(cfg, 'HEAD', key, '');
  if (res.status === 404) return null;
  return { size: Number(res.headers.get('content-length') || 0) };
}

export async function deleteObject(cfg, key) {
  await send(cfg, 'DELETE', key, '');
}
