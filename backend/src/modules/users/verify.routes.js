import { Router } from 'express';
import { query, tx } from '../../infrastructure/database/database.js';
import { requireAuth, hashPassword, passwordRules } from '../../middleware/authentication/auth.js';
import { fail } from '../../shared/errors/http.js';
import { ipLimit, userLimit } from '../../middleware/security/firewall.js';
import { getConfig } from '../system/app_config.service.js';
import { verifyPhoneToken } from '../notifications/firebase_verify.service.js';
import { issueEmailCode, consumeEmailCode, normalizeEmail } from '../notifications/email_codes.service.js';
import { revokeAllSessions } from './sessions.service.js';
import { hub } from '../../infrastructure/websocket/realtime.js';
import { selfUser } from '../../shared/utils/views.js';

/**
 * Doğrulama uçları (v2.100.0):
 *  - Telefon: uygulama SMS kodunu Firebase ile doğrular, Firebase kimlik token'ını gönderir (bkz. firebase_verify.js).
 *  - E-posta: sunucu 6 haneli kodu SMTP ile gönderir (bkz. email_codes.js).
 *  - Şifremi unuttum: doğrulanmış telefon (SMS) ya da doğrulanmış e-posta (kod) ile yeni şifre.
 */
export const router = Router();

const langOf = (req, user) => String(user?.language ?? req.body?.lang ?? 'tr').slice(0, 2);

/** Şifreyi değiştirir; tüm oturumları kapatır (çalınan hesabı geri almak için). */
async function resetPassword(userId, password) {
  passwordRules(password);
  const hash = await hashPassword(password);
  await query(`UPDATE users SET password_hash = $1, token_version = token_version + 1, updated_at = NOW() WHERE id = $2`, [hash, userId]);
  await revokeAllSessions(userId, 'password_reset');
  hub.disconnectUser(userId, 'password_changed');
}

// Giriş yapmış kullanıcı telefonunu SMS ile doğrular / bağlar (hesapta başka numara varsa yenisiyle değiştirilir).
router.post('/phone/link', requireAuth, userLimit('phone_link', 10, 3600e3), async (req, res) => {
  const phone = await verifyPhoneToken(req.body?.idToken, (await getConfig()).firebaseProjectId);
  const other = (await query(`SELECT id FROM users WHERE phone = $1 AND id <> $2`, [phone, req.user.id])).rows[0];
  if (other) throw fail('Bu telefon numarası başka bir hesaba bağlı.', 409);
  const row = (await query(
    `UPDATE users SET phone = $1, phone_verified_at = NOW(), updated_at = NOW() WHERE id = $2 RETURNING *`,
    [phone, req.user.id],
  )).rows[0];
  res.json({ ok: true, user: selfUser(row) });
});

// E-posta ekleme / doğrulama: koda gönder.
router.post('/email/send', requireAuth, userLimit('email_send', 10, 3600e3), async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!email) throw fail('Geçerli bir e-posta adresi girin.');
  const other = (await query(`SELECT 1 FROM users WHERE lower(email) = $1 AND id <> $2 AND email_verified_at IS NOT NULL`, [email, req.user.id])).rowCount;
  if (other) throw fail('Bu e-posta adresi başka bir hesapta kullanılıyor.', 409);
  res.json({ ok: true, ...(await issueEmailCode(email, 'verify', { userId: req.user.id, lang: langOf(req, req.user) })) });
});

router.post('/email/confirm', requireAuth, userLimit('email_confirm', 20, 3600e3), async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!email) throw fail('Geçerli bir e-posta adresi girin.');
  const row = await tx(async (c) => {
    const r = await consumeEmailCode(email, 'verify', req.body?.code, (q, p) => c.query(q, p));
    if (r.userId && r.userId !== req.user.id) throw fail('Kod bu hesap için değil. Yeni kod isteyin.', 403);
    // Aynı adresi doğrulanmamış hâlde tutan başka hesap varsa adres ondan kaldırılır (adres doğrulayanındır).
    await c.query(`UPDATE users SET email = NULL, email_verified_at = NULL WHERE lower(email) = $1 AND id <> $2 AND email_verified_at IS NULL`, [email, req.user.id]);
    try {
      return (await c.query(`UPDATE users SET email = $1, email_verified_at = NOW(), updated_at = NOW() WHERE id = $2 RETURNING *`, [email, req.user.id])).rows[0];
    } catch (e) {
      if (e.code === '23505') throw fail('Bu e-posta adresi başka bir hesapta kullanılıyor.', 409);
      throw e;
    }
  });
  res.json({ ok: true, user: selfUser(row) });
});

// Şifremi unuttum (e-posta): hesap var mı yok mu belli edilmez; her durumda aynı yanıt.
router.post('/reset/email/send', ipLimit('reset_email', 10, 3600e3), async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!email) throw fail('Geçerli bir e-posta adresi girin.');
  const user = (await query(`SELECT id, language, account_status FROM users WHERE lower(email) = $1 AND email_verified_at IS NOT NULL`, [email])).rows[0];
  if (user && user.account_status === 'active') {
    await issueEmailCode(email, 'reset', { userId: user.id, lang: langOf(req, user) }).catch((e) => {
      if (e.status === 429 || e.status === 503) throw e; // bekleme / yapılandırma hatası kullanıcıya söylenir
      console.error('[şifre sıfırlama] e-posta:', e.message);
    });
  }
  res.json({ ok: true, message: 'Bu adres bir hesaba bağlıysa kod gönderildi. Gelen kutunu ve spam klasörünü kontrol et.' });
});

router.post('/reset/email', ipLimit('reset_email_confirm', 30, 3600e3), async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!email) throw fail('Geçerli bir e-posta adresi girin.');
  const password = String(req.body?.password ?? '');
  passwordRules(password);
  const { userId } = await consumeEmailCode(email, 'reset', req.body?.code);
  const user = (await query(`SELECT id FROM users WHERE id = $1 AND lower(email) = $2 AND account_status = 'active'`, [userId, email])).rows[0];
  if (!user) throw fail('Hesap bulunamadı.', 404);
  await resetPassword(user.id, password);
  res.json({ ok: true, message: 'Şifren değişti. Yeni şifrenle giriş yapabilirsin.' });
});

// Şifremi unuttum (telefon): SMS kodu uygulamada Firebase ile doğrulanır.
router.post('/reset/phone', ipLimit('reset_phone', 20, 3600e3), async (req, res) => {
  const password = String(req.body?.password ?? '');
  passwordRules(password);
  const phone = await verifyPhoneToken(req.body?.idToken, (await getConfig()).firebaseProjectId);
  const user = (await query(`SELECT id, account_status FROM users WHERE phone = $1`, [phone])).rows[0];
  if (!user) throw fail('Bu telefon numarasına bağlı hesap yok.', 404);
  if (user.account_status !== 'active') throw fail('Hesap askıya alınmış veya silinmiş.', 403);
  await query(`UPDATE users SET phone_verified_at = COALESCE(phone_verified_at, NOW()) WHERE id = $1`, [user.id]);
  await resetPassword(user.id, password);
  res.json({ ok: true, message: 'Şifren değişti. Yeni şifrenle giriş yapabilirsin.' });
});
