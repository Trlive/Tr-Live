import { Router } from 'express';
import { optionalAuth } from '../../middleware/authentication/auth.js';
import { buildManifest } from './manifest.service.js';

export const router = Router();

/// Varlık listesi. Uygulama açılışta ve Wi-Fi'ye geçince okur.
///
/// Liste sürümü ETag olarak gönderilir: içerik değişmediyse uygulama 304 alır ve gövde hiç inmez.
/// Yani her açılışta sorulması bedava.
router.get('/assets/manifest', optionalAuth, async (_req, res, next) => {
  try {
    const m = await buildManifest();
    const etag = `"${m.version}"`;
    // Liste bir dakika taze sayılır: hediye eklendiğinde telefonlara en geç bir dakikada ulaşır,
    // bu arada her açılış sunucuya yük bindirmez.
    res.set({ ETag: etag, 'Cache-Control': 'public, max-age=60' });
    if (_req.headers['if-none-match'] === etag) return res.status(304).end();
    res.json(m);
  } catch (e) { next(e); }
});
