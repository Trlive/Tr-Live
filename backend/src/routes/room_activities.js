import crypto from 'node:crypto';
import { Router } from 'express';
import { authenticateToken } from '../auth.js';
import { isUuid } from '../http.js';
import { ipLimit } from '../firewall.js';
import { isRoomMember } from '../services/rooms.js';
import { getConfig } from '../services/app_config.js';
import { renderActivitiesPage, renderErrorPage, safeVersion } from '../room_activities_page.js';

// GET /room-activities?roomId=<uuid>
// Uygulamadaki WebView penceresinin açtığı SABİT H5 sayfası. Adres veritabanından okunmaz, dışarıdan değişmez.
// İlk istek `Authorization: Bearer <token>` başlığıyla gelir; token geçerli değilse ya da kişi odada değilse sayfa verilmez.
export const router = Router();

router.get('/', ipLimit('room_activities', 600, 3600e3), async (req, res) => {
  const nonce = crypto.randomBytes(16).toString('base64');
  res.set({
    // Bu sayfa yalnızca kendi betiğini (nonce) çalıştırır, yalnızca kendi sunucusuna bağlanır; çerçeveye alınamaz.
    'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  const page = (status, text) => res.status(status).type('html').send(renderErrorPage(text, nonce));

  // Genel anahtar kapalıysa rota yoktur (herkes için aynı).
  if ((await getConfig()).roomActivitiesEnabled === false) return page(404, 'Etkinlikler şu an kapalı.');

  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  let user;
  try { user = await authenticateToken(token); } catch (e) {
    if (e?.status === 401) return page(401, 'Oturum doğrulanamadı. Pencereyi kapatıp yeniden aç.');
    throw e; // veritabanı hatası vb.: ortak hata yöneticisine gider
  }

  const roomId = String(req.query.roomId ?? '');
  if (!isUuid(roomId)) return page(400, 'Oda bilgisi geçersiz.');
  if (!(await isRoomMember(user.id, roomId))) return page(403, 'Bu etkinliklere yalnızca odadaki üyeler katılabilir.');

  res.type('html').send(renderActivitiesPage({ roomId, appVersion: safeVersion(req.get('X-App-Version')), nonce }));
});
