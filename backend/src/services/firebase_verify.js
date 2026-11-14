import crypto from 'node:crypto';
import { fail } from '../http.js';

/**
 * Firebase telefon doğrulaması: uygulama SMS kodunu Firebase ile doğrular ve Firebase'in verdiği kimlik token'ını
 * (ID token) sunucuya gönderir. Sunucu bu token'ı Google'ın açık anahtarlarıyla doğrular ve içindeki telefon numarasını
 * kullanır. Firebase Admin paketi gerekmez; yalnızca proje kimliği (projectId) gerekir. İmza node:crypto ile denetlenir.
 */
const b64json = (s) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

/** RS256 JWT: imzayı doğrular, başlık ve içeriği döndürür. Bozuk / imzası tutmayan token'da null. */
export function decodeVerifiedJwt(token) {
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  let header;
  let payload;
  try {
    header = b64json(parts[0]);
    payload = b64json(parts[1]);
  } catch (_) {
    return null;
  }
  return { header, payload, verify: (pem) => {
    try {
      return crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), crypto.createPublicKey(pem), Buffer.from(parts[2], 'base64url'));
    } catch (_) {
      return false;
    }
  } };
}
const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const MAX_AGE_SEC = 10 * 60; // SMS doğrulandıktan en fazla 10 dakika sonra kullanılabilir
let certs = null;
let certsUntil = 0;
let fetchCerts = defaultFetchCerts;
const used = new Map(); // token özeti → son geçerlilik (aynı doğrulama ikinci kez kullanılamaz)

async function defaultFetchCerts() {
  const r = await fetch(CERTS_URL, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`Google anahtarları alınamadı (${r.status})`);
  const maxAge = Number(/max-age=(\d+)/.exec(r.headers.get('cache-control') ?? '')?.[1] ?? 3600);
  return { keys: await r.json(), maxAge };
}

/** Testler için: anahtar getiriciyi değiştirir ve önbelleği temizler. */
export function setCertFetcher(fn) {
  fetchCerts = fn ?? defaultFetchCerts;
  certs = null;
  certsUntil = 0;
  used.clear();
}

async function keyFor(kid) {
  if (!certs || Date.now() > certsUntil || !certs[kid]) {
    const { keys, maxAge } = await fetchCerts();
    certs = keys;
    certsUntil = Date.now() + Math.max(60, Math.min(maxAge, 86400)) * 1000;
  }
  return certs[kid] ?? null;
}

/**
 * Token'ı doğrular, doğrulanmış telefon numarasını (+905…) döndürür. Hatalıysa kullanıcıya anlaşılır hata fırlatır.
 * [oneTime]: aynı token ikinci kez kabul edilmez (kayıt, telefon bağlama, şifre sıfırlama).
 */
export async function verifyPhoneToken(idToken, projectId, { oneTime = true, now = Date.now() } = {}) {
  if (!projectId) throw fail('Telefon doğrulaması henüz yapılandırılmadı.', 503);
  const token = String(idToken ?? '');
  if (token.length < 100 || token.length > 4096) throw fail('Telefon doğrulaması geçersiz. Kodu yeniden isteyin.', 401);
  const jwt = decodeVerifiedJwt(token);
  const head = jwt?.header;
  if (!head || head.alg !== 'RS256' || !head.kid) throw fail('Telefon doğrulaması geçersiz. Kodu yeniden isteyin.', 401);
  let key;
  try {
    key = await keyFor(head.kid);
  } catch (_) {
    throw fail('Doğrulama sunucusuna ulaşılamadı. Biraz sonra tekrar deneyin.', 503);
  }
  if (!key) throw fail('Telefon doğrulaması geçersiz. Kodu yeniden isteyin.', 401);
  const nowSec = Math.floor(now / 1000);
  const p = jwt.payload;
  // İmza, hedef proje (aud), yayıncı (iss) ve süre (exp / iat, 60 sn tolerans) denetlenir.
  if (!jwt.verify(key) || p.aud !== projectId || p.iss !== `https://securetoken.google.com/${projectId}`
      || !(Number(p.exp) > nowSec - 60) || !(Number(p.iat) <= nowSec + 60)) {
    throw fail('Telefon doğrulamasının süresi doldu ya da geçersiz. Kodu yeniden isteyin.', 401);
  }
  const authTime = Number(p.auth_time ?? 0);
  if (!p.sub || !authTime || authTime > nowSec + 60 || nowSec - authTime > MAX_AGE_SEC) {
    throw fail('Telefon doğrulamasının süresi doldu. Kodu yeniden isteyin.', 401);
  }
  if (p.firebase?.sign_in_provider !== 'phone' || !/^\+[1-9]\d{7,14}$/.test(String(p.phone_number ?? ''))) {
    throw fail('Telefon doğrulaması geçersiz. Kodu yeniden isteyin.', 401);
  }
  if (oneTime) {
    for (const [h, until] of used) if (until < now) used.delete(h);
    const h = crypto.createHash('sha256').update(token).digest('hex');
    if (used.has(h)) throw fail('Bu doğrulama zaten kullanıldı. Kodu yeniden isteyin.', 409);
    used.set(h, now + 2 * 3600e3);
  }
  return String(p.phone_number);
}
