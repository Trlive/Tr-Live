import crypto from 'node:crypto';
import fs from 'node:fs';
import { Router } from 'express';
import { authenticateToken } from '../../middleware/authentication/auth.js';
import { isUuid } from '../../shared/errors/http.js';
import { ipLimit } from '../../middleware/security/firewall.js';
import { isRoomMember } from './rooms.service.js';
import { getConfig } from '../system/app_config.service.js';
import { renderErrorPage, safeVersion } from './activities_page.routes.js';

// GET /room-game/tek | /room-game/ludo ?roomId=<uuid>&lang=tr|en|ar|hi
// Odadaki oyun penceresinin (WebView) açtığı SABİT sayfalar: TEK kart oyunu ve Ludo. Adres veritabanından okunmaz, dışarıdan
// değişmez; sayfa yalnızca kendi betiğini (nonce) çalıştırır ve yalnızca kendi sunucusuna bağlanır.
// İlk istek `Authorization: Bearer <token>` başlığıyla gelir; token geçersizse ya da kişi odada değilse sayfa verilmez.
// Oyunun kendisi /api/games uçlarıyla oynanır (kurallar sunucuda; sayfa yalnızca gösterir).
export const router = Router();

const TEMPLATES = {
  tek: fs.readFileSync(new URL('../../pages/tek.html', import.meta.url), 'utf8'),
  ludo: fs.readFileSync(new URL('../../pages/ludo.html', import.meta.url), 'utf8'),
};
const LANGS = ['tr', 'en', 'ar', 'hi'];

/** Sayfayı üretir. [roomId] doğrulanmış UUID olmalıdır; dil yalnızca bilinen dört koddan biri olabilir. */
export function renderGamePage(game, { roomId, lang, nonce, appVersion = '' }) {
  const safeLang = LANGS.includes(lang) ? lang : 'tr';
  return TEMPLATES[game].replaceAll('__NONCE__', nonce).replaceAll('__ROOM_ID__', roomId).replaceAll('__LANG__', safeLang)
    .replaceAll('__APP_VERSION__', safeVersion(appVersion));
}

router.get('/:game', ipLimit('room_game_page', 600, 3600e3), async (req, res) => {
  const nonce = crypto.randomBytes(16).toString('base64');
  res.set({
    'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; img-src 'self' data: https:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  const page = (status, text) => res.status(status).type('html').send(renderErrorPage(text, nonce));

  const game = String(req.params.game);
  if (!Object.hasOwn(TEMPLATES, game)) return page(404, 'Oyun bulunamadı.');
  if (game === 'tek' && (await getConfig()).cardGameEnabled === false) return page(404, 'Bu oyun şu an kapalı.');

  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  let user;
  try { user = await authenticateToken(token); } catch (e) {
    if (e?.status === 401) return page(401, 'Oturum doğrulanamadı. Pencereyi kapatıp yeniden aç.');
    throw e; // veritabanı hatası vb.: ortak hata yöneticisine gider
  }

  const roomId = String(req.query.roomId ?? '');
  if (!isUuid(roomId)) return page(400, 'Oda bilgisi geçersiz.');
  if (!(await isRoomMember(user.id, roomId))) return page(403, 'Bu oyuna yalnızca odadaki üyeler katılabilir.');

  res.type('html').send(renderGamePage(game, { roomId, lang: String(req.query.lang ?? 'tr'), nonce, appVersion: req.get('X-App-Version') }));
});
