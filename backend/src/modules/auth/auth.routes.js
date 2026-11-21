import crypto from 'node:crypto';
import {
  statusOf as twoFactorStatus, isEnabled as twoFactorEnabled, beginSetup as beginTotpSetup,
  confirmSetup as confirmTotpSetup, verifyLogin as verifyTotpLogin, disable as disableTotp,
  regenerateRecovery as regenerateTotpRecovery,
} from './two_factor.service.js';
import { cleanPublic } from '../../middleware/security/safe_text.js';
import { Router } from 'express';
import { query } from '../../infrastructure/database/database.js';
import { hashPassword, checkPassword, signToken, passwordRules, liftBan, requireAuth, optionalAuth } from '../../middleware/authentication/auth.js';
import { openSession, refreshSession, revokeByRefresh, revokeSession, cleanDevice } from '../users/sessions.service.js';
import { banExpired, banMessage } from '../agencies/staff.rules.js';
import { fail, text } from '../../shared/errors/http.js';
import { selfUser } from '../../shared/utils/views.js';
import { newPublicId } from '../users/ids.service.js';
import { ipLimit, loginGuard, clientIp } from '../../middleware/security/firewall.js';
import { promoteBootstrapAdmins } from '../system/bootstrap.service.js';
import { getConfig, phoneVerifyOn } from '../system/app_config.service.js';
import { verifyPhoneToken } from '../notifications/firebase_verify.service.js';

export const router = Router();
export const USERNAME_RE = /^[a-z0-9_.]{3,30}$/;
let dummyHash;

/**
 * Giriş yanıtı. Yeni uygulama "device" alanı gönderir ve cihaz oturumu (kısa erişim + yenileme token'ı) alır.
 * Cihaz bilgisi göndermeyen eski sürümler, yenileme bilmedikleri için eskisi gibi 30 günlük token alır.
 */
export async function tokensFor(user, req) {
  if (!req.body?.device || typeof req.body.device !== 'object') return { token: signToken(user) };
  const s = await openSession(user, cleanDevice(req.body.device), clientIp(req));
  return { token: s.token, refreshToken: s.refreshToken, expiresIn: s.expiresIn };
}

router.post('/register', ipLimit('register', 5, 3600e3), async (req, res) => {
  const username = String(req.body?.username ?? '').trim().toLowerCase();
  if (!USERNAME_RE.test(username)) {
    throw fail('Kullanıcı adı 3-30 karakter olmalı; yalnızca harf, rakam, nokta ve alt çizgi kullanılabilir.');
  }
  const password = String(req.body?.password ?? '');
  passwordRules(password);
  const displayName = cleanPublic(text(req.body?.displayName || username, 'Ad', { min: 1, max: 60 }), 'Ad');cleanPublic(username, 'Kullanıcı adı');
  const passwordHash = await hashPassword(password);
  try {
    const publicId = await newPublicId();
    const r = await query(
      `INSERT INTO users(username, display_name, password_hash, public_id) VALUES($1,$2,$3,$4) RETURNING *`,
      [username, displayName, passwordHash, publicId],
    );
    const row = r.rows[0];
    if (await promoteBootstrapAdmins(row.username)) row.system_role = 'admin';
    res.status(201).json({ ...(await tokensFor(row, req)), user: selfUser(row) });
  } catch (error) {
    if (error.code === '23505') throw fail('Kullanıcı adı zaten kullanılıyor.', 409);
    throw error;
  }
});

/**
 * Telefon numarasını tek biçime çevirir (+905xxxxxxxxx). Türkiye numaraları 0 / 90 / 5 ile yazılabilir;
 * yabancı numara + ile ve ülke koduyla yazılır. Geçersizse null.
 */
export function normalizePhone(input) {
  let s = String(input ?? '').replace(/[\s\-().]/g, '');
  if (!s) return null;
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (/^0?5\d{9}$/.test(s)) s = `+90${s.replace(/^0/, '')}`;
  else if (/^905\d{9}$/.test(s)) s = `+${s}`;
  if (!/^\+[1-9]\d{7,14}$/.test(s)) return null;
  if (s.startsWith('+90') && !/^\+905\d{9}$/.test(s)) return null; // Türkiye: yalnızca cep numarası
  return s;
}
const looksLikePhone = (v) => /^[+\d][\d\s\-()]{8,}$/.test(v);

// Telefon numarasıyla kayıt: numara + şifre + görünen ad. Numara benzersizdir.
// Firebase yapılandırılmışsa (yönetim > uygulama ayarları) SMS kodu zorunludur: uygulama kodu Firebase ile doğrular ve
// kimlik token'ını (idToken) gönderir; numara token'dan alınır. Yapılandırılmamışsa eskisi gibi kodsuz kayıt.
router.post('/register-phone', ipLimit('register', 5, 3600e3), async (req, res) => {
  const cfg = await getConfig();
  let phone = normalizePhone(req.body?.phone);
  let verified = false;
  if (phoneVerifyOn(cfg)) {
    if (!req.body?.idToken) throw fail('Telefon numaranı SMS koduyla doğrulaman gerekiyor. Uygulamayı güncelleyin.', 428);
    const p = normalizePhone(await verifyPhoneToken(req.body.idToken, cfg.firebaseProjectId));
    if (!p) throw fail('Bu telefon numarasıyla kayıt yapılamaz.');
    if (phone && phone !== p) throw fail('Doğrulanan numara ile girilen numara aynı değil.');
    phone = p;
    verified = true;
  }
  if (!phone) throw fail('Geçerli bir cep telefonu numarası girin (ör. 0555 123 45 67).');
  const password = String(req.body?.password ?? '');
  passwordRules(password);
  const displayName = cleanPublic(text(req.body?.displayName, 'Ad', { min: 1, max: 60 }), 'Ad');
  if ((await query(`SELECT 1 FROM users WHERE phone = $1`, [phone])).rowCount) throw fail('Bu telefon numarasıyla zaten bir hesap var. Giriş yapın.', 409);
  const passwordHash = await hashPassword(password);
  let row = await createAccount({ displayName, passwordHash, phone, prefix: 't' });
  if (verified) row = (await query(`UPDATE users SET phone_verified_at = NOW() WHERE id = $1 RETURNING *`, [row.id])).rows[0];
  res.status(201).json({ ...(await tokensFor(row, req)), user: selfUser(row) });
});

/** Yeni hesap: kullanıcı adı otomatik (ör. g_48392011), görünen ad verilen. Telefon / şifre isteğe bağlı. */
export async function createAccount({ displayName, passwordHash = null, phone = null, prefix = 'u' }, run = query, inTx = false) {
  for (let i = 0; i < 10; i += 1) {
    const username = `${prefix}_${crypto.randomInt(10_000_000, 99_999_999)}`;
    // İşlem (transaction) içindeyken çakışma tüm işlemi bozmasın: her deneme bir kayıt noktasında.
    let sp = inTx;
    if (sp) await run('SAVEPOINT create_account');
    try {
      const publicId = await newPublicId(run);
      const row = (await run(
        `INSERT INTO users(username, display_name, password_hash, public_id, phone) VALUES($1,$2,$3,$4,$5) RETURNING *`,
        [username, displayName, passwordHash, publicId, phone],
      )).rows[0];
      if (sp) {
        await run('RELEASE SAVEPOINT create_account');
        sp = false;
      }
      if (await promoteBootstrapAdmins(row.username)) row.system_role = 'admin';
      return row;
    } catch (error) {
      if (sp) await run('ROLLBACK TO SAVEPOINT create_account');
      if (error.code !== '23505') throw error;
      if (phone && /phone/.test(String(error.constraint ?? error.detail ?? ''))) throw fail('Bu telefon numarasıyla zaten bir hesap var. Giriş yapın.', 409);
    }
  }
  throw new Error('Hesap oluşturulamadı.');
}

/** Giriş öncesi hesap durumu: süresi dolan yasak kaldırılır; yasaklı / askıdaki hesap reddedilir. */
export async function checkAccount(user) {
  let acct = user;
  if (banExpired(acct)) acct = await liftBan(acct);
  if (acct.account_status === 'banned') throw fail(banMessage(acct), 403);
  if (acct.account_status !== 'active') throw fail('Hesap askıya alınmış veya silinmiş.', 403);
  return acct;
}

router.post('/login', ipLimit('login', 30, 15 * 60e3), async (req, res) => {
  const raw = String(req.body?.username ?? '').trim();
  // Kullanıcı adı ya da telefon numarası ile giriş.
  const phone = looksLikePhone(raw) ? normalizePhone(raw) : null;
  const username = phone ?? raw.toLowerCase().slice(0, 40);
  const password = String(req.body?.password ?? '').slice(0, 200);
  const guard = loginGuard(clientIp(req), username);
  guard.check(); // çok sayıda hatalı denemeden sonra geçici kilit
  let user = phone ? (await query(`SELECT * FROM users WHERE phone = $1`, [phone])).rows[0] : null;
  // Rakamlardan oluşan eski kullanıcı adları telefon gibi görünebilir: bulunamazsa kullanıcı adı olarak da bakılır.
  user ??= (await query(`SELECT * FROM users WHERE lower(username) = $1`, [raw.toLowerCase().slice(0, 40)])).rows[0];
  // Kullanıcı yoksa da bcrypt çalıştırılır; böylece yanıt süresinden kullanıcı adı sızmaz.
  dummyHash ??= await hashPassword('dummy-password-for-timing');
  const ok = await checkPassword(password, user?.password_hash || dummyHash);
  if (!user || !user.password_hash || !ok) { guard.failed(); throw fail('Giriş bilgileri hatalı.', 401); }
  // İki adımlı doğrulama: yetkili hesaplarda şifre tek başına yetmez.
  //
  // Şifre doğrulandıktan SONRA sorulur ve kod yanlışsa aynı "hatalı deneme" sayacına yazılır:
  // böylece 6 haneli kod kaba kuvvetle denenemez (15 dakikada 30 deneme sınırı).
  //
  // "2FA gerekli" yanıtı yalnızca şifre doğruyken döner — yanlış şifrede dönseydi, bir hesabın
  // 2FA'sının açık olup olmadığı şifre bilmeden öğrenilebilirdi.
  if (await twoFactorEnabled(user.id)) {
    const code = String(req.body?.totpCode ?? '').trim();
    if (!code) {
      guard.succeeded();
      return res.status(401).json({ code: 'totp_required', message: 'Doğrulama kodunu girin.' });
    }
    if (!(await verifyTotpLogin(user.id, code))) {
      guard.failed();
      throw fail('Doğrulama kodu hatalı.', 401);
    }
  }
  guard.succeeded();
  const acct = await checkAccount(user);
  res.json({ ...(await tokensFor(acct, req)), user: selfUser(acct) });
});

// ---------------- İki adımlı doğrulama (yönetim) ----------------
// Kendi hesabının 2FA'sını yönetir. Başkasınınkine dokunulamaz: `req.user.id` dışında kimlik alınmaz.

router.get('/2fa', requireAuth, async (req, res) => {
  res.json(await twoFactorStatus(req.user.id));
});

router.post('/2fa/setup', requireAuth, ipLimit('totp_setup', 20, 60 * 60e3), async (req, res) => {
  res.json(await beginTotpSetup(req.user.id, req.user.username || req.user.id));
});

router.post('/2fa/confirm', requireAuth, ipLimit('totp_confirm', 30, 60 * 60e3), async (req, res) => {
  res.json(await confirmTotpSetup(req.user.id, req.body?.code));
});

router.post('/2fa/disable', requireAuth, ipLimit('totp_disable', 20, 60 * 60e3), async (req, res) => {
  res.json(await disableTotp(req.user.id, req.body?.code));
});

router.post('/2fa/recovery', requireAuth, ipLimit('totp_recovery', 10, 60 * 60e3), async (req, res) => {
  res.json(await regenerateTotpRecovery(req.user.id, req.body?.code));
});

// Erişim token'ını yeniler. Yenileme token'ı her seferinde değişir; uygulama yenisini saklamalıdır.
router.post('/refresh', ipLimit('refresh', 600, 15 * 60e3), async (req, res) => {
  const device = cleanDevice(req.body?.device);
  res.json(await refreshSession(req.body?.refreshToken, clientIp(req), device));
});

// Eski (30 günlük) token ile giriş yapmış uygulama güncellenince cihaz oturumuna geçer; yeniden giriş gerekmez.
router.post('/session', requireAuth, ipLimit('session_upgrade', 30, 15 * 60e3), async (req, res) => {
  if (req.user.session_id) throw fail('Bu cihazda zaten oturum var.', 409);
  const legacy = (req.headers.authorization || '').slice(7);
  const s = await openSession(req.user, cleanDevice(req.body?.device), clientIp(req), legacy);
  res.json({ token: s.token, refreshToken: s.refreshToken, expiresIn: s.expiresIn });
});

// Çıkış: bu cihazın oturumu sunucuda da kapanır (erişim token'ının süresi dolmuş olsa bile yenileme token'ıyla).
router.post('/logout', ipLimit('logout', 60, 15 * 60e3), optionalAuth, async (req, res) => {
  let n = await revokeByRefresh(req.body?.refreshToken, 'logout');
  if (!n && req.user?.session_id) n = await revokeSession(req.user.id, req.user.session_id, 'logout');
  res.json({ ok: true, revoked: n });
});
