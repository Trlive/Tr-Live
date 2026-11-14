import crypto from 'node:crypto';
import { Router } from 'express';
import { authenticateToken } from '../auth.js';
import { query } from '../database.js';
import { ipLimit } from '../firewall.js';
import { renderDealerTopupPage, renderErrorPage, safeVersion } from '../dealer_topup_page.js';

// GET /dealer-topup — bayi bakiye talebi H5 sayfası (WebView). Geçerli token + aktif bayi hesabı gerekir.
// Görünürlük yalnızca rol bazlıdır; platforma ya da hesaba göre gizleme yoktur.
export const router = Router();

router.get('/', ipLimit('dealer_topup_page', 300, 3600e3), async (req, res) => {
  const nonce = crypto.randomBytes(16).toString('base64');
  res.set({
    'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  const page = (status, text) => res.status(status).type('html').send(renderErrorPage(text, nonce));
  const h = req.headers.authorization || '';
  let user;
  try { user = await authenticateToken(h.startsWith('Bearer ') ? h.slice(7) : ''); } catch (e) {
    if (e?.status === 401) return page(401, 'Oturum doğrulanamadı. Pencereyi kapatıp yeniden aç.');
    throw e;
  }
  const d = await query(`SELECT 1 FROM dealer_accounts WHERE owner_user_id = $1 AND is_active = TRUE`, [user.id]);
  if (!d.rowCount) return page(403, 'Bayi hesabınız bulunmuyor.');
  res.type('html').send(renderDealerTopupPage({ appVersion: safeVersion(req.get('X-App-Version')), nonce }));
});
