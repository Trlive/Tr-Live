import crypto from 'node:crypto';
import { query } from '../../infrastructure/database/database.js';
import { fail } from '../../shared/errors/http.js';
import { jwtSecret } from '../../config.js';
import { getConfig, mailOn } from '../system/app_config.service.js';
import { sendMail } from './mailer.service.js';

/** E-posta kodları: 6 hane, 10 dakika, en fazla 5 deneme, aynı adrese dakikada 1 / saatte 5 gönderim. */
export const CODE_TTL_MIN = 10;
export const MAX_ATTEMPTS = 5;
export const EMAIL_RE = /^[^\s@<>()[\],;:"]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}$/;

export function normalizeEmail(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return s.length <= 254 && EMAIL_RE.test(s) ? s : null;
}

export const hashCode = (email, purpose, code) =>
  crypto.createHmac('sha256', jwtSecret()).update(`${purpose}:${email}:${code}`).digest('hex');

const TEXTS = {
  tr: {
    verify: ['TR Live doğrulama kodun', 'E-posta adresini doğrulamak için kodun'],
    reset: ['TR Live şifre sıfırlama kodu', 'Şifreni sıfırlamak için kodun'],
    foot: (m) => `Kod ${m} dakika geçerlidir. Bu isteği sen yapmadıysan bu e-postayı yok say; kodu kimseyle paylaşma.`,
  },
  en: {
    verify: ['Your TR Live verification code', 'Your code to verify your email address'],
    reset: ['Your TR Live password reset code', 'Your code to reset your password'],
    foot: (m) => `The code is valid for ${m} minutes. If you didn't request this, ignore this email and never share the code.`,
  },
  ar: {
    verify: ['رمز التحقق من TR Live', 'رمزك للتحقق من بريدك الإلكتروني'],
    reset: ['رمز إعادة تعيين كلمة مرور TR Live', 'رمزك لإعادة تعيين كلمة المرور'],
    foot: (m) => `الرمز صالح لمدة ${m} دقائق. إذا لم تطلب ذلك فتجاهل هذه الرسالة ولا تشارك الرمز مع أحد.`,
  },
  hi: {
    verify: ['आपका TR Live सत्यापन कोड', 'अपना ईमेल सत्यापित करने के लिए आपका कोड'],
    reset: ['आपका TR Live पासवर्ड रीसेट कोड', 'पासवर्ड रीसेट करने के लिए आपका कोड'],
    foot: (m) => `कोड ${m} मिनट तक मान्य है। अगर आपने यह अनुरोध नहीं किया तो इस ईमेल को अनदेखा करें और कोड किसी से साझा न करें।`,
  },
};

export function mailBody(lang, purpose, code) {
  const t = TEXTS[lang] ?? TEXTS[String(lang ?? '').slice(0, 2)] ?? TEXTS.en;
  const [subject, lead] = t[purpose];
  const foot = t.foot(CODE_TTL_MIN);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const text = `${lead}: ${code}\n\n${foot}\n\nTR Live`;
  const html = `<div dir="${dir}" style="font-family:Arial,sans-serif;background:#0B0906;color:#F6EFDF;padding:24px;border-radius:12px;max-width:480px">
<div style="color:#F2B92A;font-size:20px;font-weight:bold;margin-bottom:12px">TR Live</div>
<div style="font-size:15px">${lead}:</div>
<div style="font-size:34px;letter-spacing:8px;font-weight:bold;color:#FFD54F;margin:14px 0">${code}</div>
<div style="font-size:12px;color:#B3A584">${foot}</div></div>`;
  return { subject, text, html };
}

/** Kod üretir, saklar ve gönderir. [userId] verilirse kodla birlikte kaydedilir. */
export async function issueEmailCode(email, purpose, { userId = null, lang = 'tr', send = sendMail } = {}) {
  const cfg = await getConfig();
  if (!mailOn(cfg)) throw fail('E-posta gönderimi henüz yapılandırılmadı.', 503);
  const recent = (await query(
    `SELECT COUNT(*)::int AS hour, COALESCE(MAX(EXTRACT(EPOCH FROM (NOW() - created_at))), 1e9)::float AS last_ago,
            MIN(EXTRACT(EPOCH FROM (NOW() - created_at)))::float AS newest_ago
     FROM email_codes WHERE lower(email) = $1 AND purpose = $2 AND created_at > NOW() - INTERVAL '1 hour'`,
    [email, purpose],
  )).rows[0];
  if (recent.newest_ago != null && recent.newest_ago < 60) throw fail('Yeni kod için biraz bekleyin (1 dakika).', 429);
  if (recent.hour >= 5) throw fail('Bu adrese çok fazla kod gönderildi. 1 saat sonra tekrar deneyin.', 429);
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  // Önceki geçerli kodlar geçersiz olur: yalnızca son gönderilen kod çalışır.
  await query(`UPDATE email_codes SET used_at = NOW() WHERE lower(email) = $1 AND purpose = $2 AND used_at IS NULL`, [email, purpose]);
  await query(
    `INSERT INTO email_codes(email, purpose, user_id, code_hash, expires_at) VALUES($1,$2,$3,$4, NOW() + ($5 || ' minutes')::interval)`,
    [email, purpose, userId, hashCode(email, purpose, code), String(CODE_TTL_MIN)],
  );
  const msg = mailBody(lang, purpose, code);
  try {
    await send({ host: cfg.smtpHost, port: cfg.smtpPort, secure: cfg.smtpSecure !== false, user: cfg.smtpUser, pass: cfg.smtpPass, from: cfg.smtpFrom || cfg.smtpUser }, { to: email, ...msg });
  } catch (e) {
    console.error('[e-posta] gönderilemedi:', e.message);
    await query(`UPDATE email_codes SET used_at = NOW() WHERE lower(email) = $1 AND purpose = $2 AND used_at IS NULL`, [email, purpose]);
    throw fail('E-posta gönderilemedi. Adresi kontrol edip tekrar deneyin.', 502);
  }
  return { expiresInMin: CODE_TTL_MIN };
}

/** Kodu doğrular ve kullanılmış sayar. Döner: { userId }. Hatalı kodda deneme sayısı artar. */
export async function consumeEmailCode(email, purpose, code, run = query) {
  const c = String(code ?? '').replace(/\D/g, '');
  if (c.length !== 6) throw fail('Kod 6 haneli olmalı.');
  const row = (await run(
    `SELECT id, user_id, code_hash, attempts, expires_at < NOW() AS expired FROM email_codes
     WHERE lower(email) = $1 AND purpose = $2 AND used_at IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
    [email, purpose],
  )).rows[0];
  if (!row || row.expired) throw fail('Kodun süresi doldu. Yeni kod isteyin.', 410);
  if (row.attempts >= MAX_ATTEMPTS) throw fail('Çok fazla hatalı deneme. Yeni kod isteyin.', 429);
  const ok = crypto.timingSafeEqual(Buffer.from(row.code_hash, 'hex'), Buffer.from(hashCode(email, purpose, c), 'hex'));
  if (!ok) {
    await run(`UPDATE email_codes SET attempts = attempts + 1 WHERE id = $1`, [row.id]);
    const left = MAX_ATTEMPTS - row.attempts - 1;
    throw fail(left > 0 ? `Kod hatalı. ${left} deneme hakkın kaldı.` : 'Çok fazla hatalı deneme. Yeni kod isteyin.', 400);
  }
  await run(`UPDATE email_codes SET used_at = NOW() WHERE id = $1`, [row.id]);
  return { userId: row.user_id };
}
