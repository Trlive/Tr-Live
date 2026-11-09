import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { query } from './database.js';
import { jwtSecret } from './config.js';
import { fail } from './http.js';
import { banExpired, banMessage } from './staff_logic.js';
import { touchSession } from './services/sessions.js';

export const hashPassword = (p) => bcrypt.hash(p, 12);
export const checkPassword = (p, h) => bcrypt.compare(p, h);

// En sık kullanılan (ilk denenen) şifreler: yeni şifre olarak kabul edilmez. Mevcut şifrelerle giriş etkilenmez.
const COMMON_PASSWORDS = new Set([
  '123456', '1234567', '12345678', '123456789', '1234567890', '0123456789', '123123', '123321', '654321', '987654', '112233',
  '121212', '123qwe', 'qwe123', 'qwerty', 'qwerty1', 'qwerty123', 'qwertyuiop', 'asdasd', 'asd123', 'asdfgh', 'zxcvbn', 'abc123',
  'abcdef', '1q2w3e', '1q2w3e4r', '1qaz2wsx', 'password', 'password1', 'passw0rd', 'iloveyou', 'sifre', 'sifre123', 'şifre', 'şifre123',
  'parola', 'parola123', 'trlive', 'trlive123', 'tr-live', 'admin', 'admin123', 'galatasaray', 'fenerbahce', 'besiktas', 'trabzonspor',
  '147258', '159753', '789456', '456789', '147852', '258369', '102030', '101010', '202020', '696969', '123654', '741852', 'aaaaaa',
]);

// Karşılaştırma için küçük harf: Türkçe I/İ/ı farkı yok sayılır (BESIKTAS = besiktas = beşiktaş değil, ayrı yazılır).
const fold = (v) => String(v).trim().toLowerCase().normalize('NFD').replace(/\u0307/g, '').normalize('NFC').replace(/ı/g, 'i');

/** Yeni şifre kuralları (kayıt, şifre değişimi, yöneticinin verdiği şifre). username verilirse şifre ona eşit olamaz. */
export function passwordRules(password, { username = null } = {}) {
  if (typeof password !== 'string' || password.length < 6) throw fail('Şifre en az 6 karakter olmalı.');
  if (Buffer.byteLength(password, 'utf8') > 72) throw fail('Şifre en fazla 72 bayt olabilir.');
  const p = fold(password);
  // Tek karakter tekrarı (111111, aaaaaa) ve listedeki yaygın şifreler ilk denenenlerdir.
  if (COMMON_PASSWORDS.has(p) || /^(.)\1+$/u.test(p)) throw fail('Bu şifre çok yaygın ve kolay tahmin edilir. Daha güçlü bir şifre seçin.');
  if (username && p === fold(username)) throw fail('Şifre kullanıcı adıyla aynı olamaz.');
}

// Eski uygulama sürümleri (cihaz bilgisi göndermeyen) için 30 günlük tek token. Yeni sürümler cihaz oturumu
// (services/sessions.js: 1 saatlik erişim + yenileme token'ı) kullanır.
export const signToken = (u) => jwt.sign({ sub: u.id, tv: u.token_version ?? 0 }, jwtSecret(), { expiresIn: '30d', algorithm: 'HS256' });

export async function loadUser(id) {
  const r = await query('SELECT * FROM users WHERE id = $1', [id]);
  return r.rows[0] || null;
}

// Süresi dolan banı kaldırır (otomatik).
export async function liftBan(user) {
  const r = await query(
    `UPDATE users SET account_status = 'active', banned_until = NULL, ban_reason = NULL, banned_by = NULL, updated_at = NOW()
     WHERE id = $1 AND account_status = 'banned' RETURNING *`, [user.id]);
  return r.rows[0] || user;
}

// Token'ı doğrular; hesabın aktif ve token sürümünün güncel olduğunu denetler.
export async function authenticateToken(token) {
  if (!token) throw fail('Yetkisiz erişim.', 401);
  let payload;
  try { payload = jwt.verify(token, jwtSecret(), { algorithms: ['HS256'] }); } catch { throw fail('Yetkisiz erişim.', 401); }
  let user;
  if (payload.sid) {
    // Cihaz oturumlu token: oturum kapatılmışsa (uzaktan çıkış, şifre değişimi) token süresi dolmamış olsa da geçersiz.
    const r = await query(
      `SELECT u.*, s.revoked_at AS session_revoked_at FROM users u JOIN user_sessions s ON s.id = $2 AND s.user_id = u.id WHERE u.id = $1`,
      [payload.sub, payload.sid],
    );
    user = r.rows[0] || null;
    if (user) {
      const revoked = user.session_revoked_at;
      delete user.session_revoked_at;
      if (revoked) throw fail('Bu cihazdaki oturum kapatıldı. Lütfen yeniden giriş yapın.', 401);
      user.session_id = payload.sid;
    }
  } else {
    user = await loadUser(payload.sub);
  }
  if (user && banExpired(user)) user = { ...(await liftBan(user)), session_id: user.session_id };
  if (user && user.account_status === 'banned') throw fail(banMessage(user), 401);
  if (!user || user.account_status !== 'active' || (user.token_version ?? 0) !== (payload.tv ?? 0)) {
    throw fail('Hesap aktif değil veya oturum sona erdi.', 401);
  }
  touchSession(user.session_id);
  return user;
}

const bearer = (req) => {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
};

export async function requireAuth(req, res, next) {
  try {
    req.user = await authenticateToken(bearer(req));
    req.auth = { sub: req.user.id };
    next();
  } catch (error) { next(error); }
}

export async function optionalAuth(req, res, next) {
  try {
    const t = bearer(req);
    if (t) { req.user = await authenticateToken(t); req.auth = { sub: req.user.id }; }
  } catch (_) { /* misafir olarak devam */ }
  next();
}

// requireAuth'tan SONRA kullanılır.
export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.system_role)) return next(fail('Bu işlem için yetkiniz yok.', 403));
  next();
};
// Yönetici = uygulama sahibi (tam yetki). Yardımcı admin ('support') yalnızca staff_logic.js'teki dar yetkilere sahiptir.
export const requireStaff = requireRole('admin', 'support');
export const requireSuperAdmin = requireRole('admin');
export const requireAdmin = requireSuperAdmin;
