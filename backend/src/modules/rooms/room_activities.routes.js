import crypto from 'node:crypto';
import { Router } from 'express';
import { authenticateToken } from '../../middleware/authentication/auth.js';
import { isUuid } from '../../shared/errors/http.js';
import { ipLimit } from '../../middleware/security/firewall.js';
import { isRoomMember } from './rooms.service.js';
import { getConfig } from '../system/app_config.service.js';
import { query } from '../../infrastructure/database/database.js';
import { canSeeActivities } from '../games/activities.routes.js';
import { renderActivitiesPage, renderErrorPage, safeVersion } from './activities_page.routes.js';

// GET /room-activities?roomId=<uuid>
// Uygulamadaki WebView penceresinin açtığı SABİT H5 sayfası. Adres veritabanından okunmaz, dışarıdan değişmez.
// İlk istek `Authorization: Bearer <token>` başlığıyla gelir; token geçerli değilse ya da kişi odada değilse sayfa verilmez.
export const router = Router();

router.get('/', ipLimit('room_activities', 600, 3600e3), async (req, res) => {
  const nonce = crypto.randomBytes(16).toString('base64');
  res.set({
    // Bu sayfa yalnızca kendi betiğini (nonce) çalıştırır, yalnızca kendi sunucusuna bağlanır; çerçeveye alınamaz.
    'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; img-src 'self' data: https:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
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

  if (!(await canSeeActivities(user.id))) return page(403, 'Etkinlikler için izniniz yok.');

  const roomId = String(req.query.roomId ?? '');
  if (!isUuid(roomId)) return page(400, 'Oda bilgisi geçersiz.');
  if (!(await isRoomMember(user.id, roomId))) return page(403, 'Bu etkinliklere yalnızca odadaki üyeler katılabilir.');

  // Yönetimden eklenen etkinlikler (bağlantı yapıştırılınca "Yakında" kalkar, dokununca uygulama açar).
  const items = (await query(`SELECT id, title, subtitle, icon, link_url FROM activity_items WHERE enabled ORDER BY sort_order, created_at`)
    .catch(() => ({ rows: null }))).rows;
  res.type('html').send(renderActivitiesPage({
    roomId, appVersion: safeVersion(req.get('X-App-Version')), nonce,
    items: items ? items.map((r) => ({ id: r.id, title: r.title, subtitle: r.subtitle, icon: r.icon, ready: !!r.link_url })) : undefined,
  }));
});
