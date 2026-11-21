import { query, tx } from '../../infrastructure/database/database.js';
import { fail } from '../../shared/errors/http.js';
import { newSecret, verifyCode, otpauthUri, newRecoveryCodes, hashRecovery } from './totp.service.js';

/// Yönetici iki adımlı doğrulaması.
///
/// ## Kurulum sırası bilinçli
///
/// 1. `beginSetup` gizli anahtar üretir ve kaydeder — ama **2FA'yı AÇMAZ**.
/// 2. `confirmSetup` ilk doğru kodu bekler; ancak o zaman açılır ve kurtarma kodları verilir.
///
/// Anahtarı kaydedip hemen açmak, yanlış kurulumda (kullanıcı QR'ı okutamadı, saat kayık)
/// yöneticiyi kendi panelinden kilitlemek demektir. Doğrulama olmadan açılmaz.

/** Hesabın 2FA durumu. */
export async function statusOf(userId) {
  const u = (await query(`SELECT totp_secret, totp_enabled_at FROM users WHERE id = $1`, [userId])).rows[0];
  if (!u) throw fail('Kullanıcı bulunamadı.', 404);
  const left = (await query(
    `SELECT COUNT(*)::int AS n FROM user_recovery_codes WHERE user_id = $1 AND used_at IS NULL`, [userId],
  )).rows[0].n;
  return { enabled: !!u.totp_enabled_at, pending: !!u.totp_secret && !u.totp_enabled_at, recoveryLeft: left };
}

export const isEnabled = async (userId) =>
  !!(await query(`SELECT 1 FROM users WHERE id = $1 AND totp_enabled_at IS NOT NULL`, [userId])).rowCount;

/** Yeni anahtar üretir. Zaten açıksa reddeder: açık 2FA'yı değiştirmek önce kapatmayı gerektirir. */
export async function beginSetup(userId, accountLabel) {
  const st = await statusOf(userId);
  if (st.enabled) throw fail('İki adımlı doğrulama zaten açık. Değiştirmek için önce kapatın.', 409);
  const secret = newSecret();
  await query(`UPDATE users SET totp_secret = $2 WHERE id = $1`, [userId, secret]);
  return { secret, uri: otpauthUri(secret, { account: accountLabel || 'yonetici' }) };
}

/**
 * İlk kodu doğrular ve 2FA'yı açar. Kurtarma kodları **yalnızca burada, bir kez** gösterilir.
 *
 * Sonradan tekrar gösterilemezler (özet saklanıyor); kaybedilirse yenileri üretilir.
 */
export async function confirmSetup(userId, code) {
  const u = (await query(`SELECT totp_secret, totp_enabled_at FROM users WHERE id = $1`, [userId])).rows[0];
  if (!u?.totp_secret) throw fail('Önce kurulumu başlatın.', 409);
  if (u.totp_enabled_at) throw fail('İki adımlı doğrulama zaten açık.', 409);
  if (!verifyCode(u.totp_secret, code)) throw fail('Kod doğrulanamadı. Telefonun saatini kontrol edin.', 401);

  const codes = newRecoveryCodes(8);
  await tx(async (c) => {
    await c.query(`UPDATE users SET totp_enabled_at = NOW() WHERE id = $1`, [userId]);
    await c.query(`DELETE FROM user_recovery_codes WHERE user_id = $1`, [userId]);
    for (const code of codes) {
      await c.query(`INSERT INTO user_recovery_codes(user_id, code_hash) VALUES($1,$2)
                     ON CONFLICT (user_id, code_hash) DO NOTHING`, [userId, hashRecovery(code)]);
    }
  });
  return { recoveryCodes: codes };
}

/// Girişte kod doğrulaması. Kurtarma kodu da kabul edilir ve **tüketilir**.
///
/// Kurtarma kodu tüketimi aynı transaction içinde ve `used_at IS NULL` koşuluyla yapılır:
/// aynı kodla eşzamanlı iki giriş denemesinden yalnızca biri geçer.
export async function verifyLogin(userId, code) {
  const u = (await query(`SELECT totp_secret, totp_enabled_at FROM users WHERE id = $1`, [userId])).rows[0];
  if (!u?.totp_enabled_at || !u.totp_secret) return true; // 2FA kapalı: doğrulanacak bir şey yok
  const c = String(code || '').trim();
  if (!c) return false;
  if (verifyCode(u.totp_secret, c)) return true;

  const r = await query(
    `UPDATE user_recovery_codes SET used_at = NOW()
      WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL RETURNING id`,
    [userId, hashRecovery(c)],
  );
  return r.rowCount > 0;
}

/**
 * 2FA'yı kapatır. **Mevcut kod ya da kurtarma kodu gerekir.**
 *
 * Yalnızca şifreyle kapatılabilseydi 2FA'nın hiçbir anlamı kalmazdı: şifreyi çalan kişi önce
 * 2FA'yı kapatır, sonra girerdi.
 */
export async function disable(userId, code) {
  if (!(await verifyLogin(userId, code))) throw fail('Kod doğrulanamadı.', 401);
  await tx(async (c) => {
    await c.query(`UPDATE users SET totp_secret = NULL, totp_enabled_at = NULL WHERE id = $1`, [userId]);
    await c.query(`DELETE FROM user_recovery_codes WHERE user_id = $1`, [userId]);
  });
  return { ok: true };
}

/** Kurtarma kodlarını yeniler (eskiler geçersiz olur). Mevcut kod gerekir. */
export async function regenerateRecovery(userId, code) {
  if (!(await verifyLogin(userId, code))) throw fail('Kod doğrulanamadı.', 401);
  const codes = newRecoveryCodes(8);
  await tx(async (c) => {
    await c.query(`DELETE FROM user_recovery_codes WHERE user_id = $1`, [userId]);
    for (const x of codes) {
      await c.query(`INSERT INTO user_recovery_codes(user_id, code_hash) VALUES($1,$2)
                     ON CONFLICT (user_id, code_hash) DO NOTHING`, [userId, hashRecovery(x)]);
    }
  });
  return { recoveryCodes: codes };
}
