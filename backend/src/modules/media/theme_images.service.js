import { fail } from '../../shared/errors/http.js';
import { query } from '../../infrastructure/database/database.js';
import { fitImage } from './media_tools.service.js';
import { imageInfo, acceptableAsIs } from './theme_image_info.service.js';

export { imageInfo, acceptableAsIs };

// Oda teması görselleri: her yüklemede otomatik boyutlandırılır. Tam ekran 1080x1920 (9:16), küçük resim 360x640.
// Uygulama görseli her ekranda "cover" ile yerleştirir; bu yüzden farklı telefon boyutlarında da kenar boşluğu olmaz.
export const THEME_FULL = [1080, 1920];
export const THEME_THUMB = [360, 640];
export const THEME_MAX_BYTES = 4 * 1024 * 1024;
const MEDIA_KIND = 'theme'; // yönetici/tema varlığı: kullanıcı işlemleriyle silinmez

async function save(buf, mime, ext, userId, purpose) {
  const r = await query(
    `INSERT INTO media_files(kind, mime, ext, size_bytes, data, meta, created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [MEDIA_KIND, mime, ext, buf.length, buf, JSON.stringify({ purpose }), userId ?? null],
  );
  return `/media/${r.rows[0].id}.${ext}`;
}

/**
 * Tema görselini doğrular, otomatik boyutlandırır ve saklar. { imageUrl, thumbUrl } döndürür.
 * [allowAnimated]: yalnızca yönetim (hareketli webp/gif olduğu gibi saklanır, küçük resmi ilk kareden yapılır).
 */
export async function storeThemeImage(buf, { userId, purpose, allowAnimated = false }) {
  if (!Buffer.isBuffer(buf) || !buf.length) throw fail('Görsel gönderilmedi.');
  if (buf.length > THEME_MAX_BYTES) throw fail('Görsel en fazla 4 MB olabilir.');
  const info = imageInfo(buf);
  if (!info) throw fail('Görsel biçimi geçersiz (png, jpeg, webp).');
  if (info.animated && !allowAnimated) throw fail('Hareketli görsel yüklenemez.');
  if (info.w < 320 || info.h < 480) throw fail('Görsel çok küçük (en az 540x960 önerilir).');

  if (info.animated) {
    const thumb = await fitImage(buf, ...THEME_THUMB).catch(() => null);
    const imageUrl = await save(buf, info.mime, info.ext, userId, purpose);
    return { imageUrl, thumbUrl: thumb ? await save(thumb.buf, thumb.mime, thumb.ext, userId, `${purpose}_thumb`) : null, animated: true };
  }
  const full = await fitImage(buf, ...THEME_FULL).catch((e) => { console.error('Tema görseli boyutlandırılamadı:', e.message); return null; });
  if (full) {
    const thumb = await fitImage(buf, ...THEME_THUMB).catch(() => null);
    const imageUrl = await save(full.buf, full.mime, full.ext, userId, purpose);
    return { imageUrl, thumbUrl: thumb ? await save(thumb.buf, thumb.mime, thumb.ext, userId, `${purpose}_thumb`) : null, animated: false };
  }
  // ffmpeg yok: uygulama zaten 9:16 kırpıp gönderir; uygun boyuttaysa olduğu gibi saklanır.
  if (!acceptableAsIs(info) || info.mime === 'image/gif') throw fail('Görsel dikey (9:16) olmalı. Uygulamadan kırparak yükleyin.');
  return { imageUrl: await save(buf, info.mime, info.ext, userId, purpose), thumbUrl: null, animated: false };
}

/** Depodaki hazır görseli (samples/themes) saklar; boyutlandırma gerekmez. */
export async function storeSeedImage(buf, ext, purpose) {
  return save(buf, ext === 'webp' ? 'image/webp' : 'image/jpeg', ext, null, purpose);
}
