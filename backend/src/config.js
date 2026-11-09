import 'dotenv/config';
import path from 'node:path';

const env = process.env;
export const isProd = env.NODE_ENV === 'production';
// Varsayılan (bilinen) anahtarlara yalnızca açıkça geliştirme / test ortamında izin verilir. NODE_ENV hiç yazılmamışsa
// sunucu üretimde sayılır: "NODE_ENV unutuldu" diye herkesin bildiği anahtarla token imzalanmasın.
export const isDevLike = ['development', 'test'].includes(env.NODE_ENV) || Boolean(env.NODE_TEST_CONTEXT);

const PLACEHOLDER_RE = /CHANGE_?ME|dev-only|BURAYA|example/i;
// Yardımcı admin 24 saatte en fazla bu kadar Coin yükleyebilir (sunucu panelinden değiştirilebilir).
const DEFAULT_SUPPORT_COIN_DAILY_LIMIT = 2_000_000n;

let warned = false;
export function jwtSecret() {
  if (env.JWT_SECRET) return env.JWT_SECRET;
  if (!isDevLike) throw new Error('JWT_SECRET tanımlı değil.');
  if (!warned) {
    warned = true;
    console.warn('[uyarı] JWT_SECRET tanımlı değil; yalnızca geliştirme için varsayılan anahtar kullanılıyor.');
  }
  return 'dev-only-change-me';
}

/** Gizli değer zayıf mı: boş, kısa ya da örnek dosyadaki yer tutucu. */
export function weakSecret(value, minLength = 32) {
  const s = String(value ?? '');
  return s.length < minLength || PLACEHOLDER_RE.test(s);
}

export function validateConfig() {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL tanımlı değil.');
  if (isDevLike) return;
  if (!isProd) console.warn('[uyarı] NODE_ENV=production yazılı değil; sunucu yine de üretim kurallarıyla açılıyor.');
  if (weakSecret(env.JWT_SECRET)) {
    throw new Error('Üretimde JWT_SECRET en az 32 karakterlik rastgele bir değer olmalıdır (örnek değer kabul edilmez).');
  }
  if (!env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET || !env.LIVEKIT_URL) {
    console.warn('[uyarı] LiveKit ayarları eksik; sesli/görüntülü bağlantı çalışmaz.');
  } else if (PLACEHOLDER_RE.test(`${env.LIVEKIT_API_KEY} ${env.LIVEKIT_API_SECRET}`)) {
    // Örnek dosyadaki anahtarla herkes oda token'ı üretip odaları dinleyebilirdi.
    throw new Error('LIVEKIT_API_KEY / LIVEKIT_API_SECRET örnek değerde bırakılmış; rastgele değer verin.');
  } else if (weakSecret(env.LIVEKIT_API_SECRET)) {
    console.warn('[uyarı] LIVEKIT_API_SECRET 32 karakterden kısa; daha uzun rastgele bir değer önerilir.');
  }
}

/** Sayı ayarı: "2.000.000", "2,000,000", "2 000 000" kabul edilir; 0 geçerlidir (kapalı). Boş → varsayılan; geçersiz → uyarı + varsayılan. */
export function limitSetting(raw, fallback, name) {
  const s = String(raw ?? '').trim();
  if (!s) return fallback;
  const digits = s.replace(/[.,_\s]/g, '');
  if (/^\d{1,15}$/.test(digits)) return BigInt(digits);
  console.warn(`[uyarı] ${name} geçersiz ("${s}"); varsayılan ${fallback} kullanılıyor.`);
  return fallback;
}

export const config = {
  port: Number(env.PORT || 3000),
  corsOrigin: (env.CORS_ORIGIN || '*').split(',').map((s) => s.trim()).filter(Boolean),
  trustProxy: env.TRUST_PROXY === undefined ? false : (/^\d+$/.test(env.TRUST_PROXY) ? Number(env.TRUST_PROXY) : env.TRUST_PROXY === 'true'),
  uploadDir: env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'),
  // Bu değerin (Coin) üstündeki hediyeler tüm kullanıcılara global şerit olarak gider.
  globalGiftMinCoins: BigInt(env.GLOBAL_GIFT_MIN_COINS || 1000),
  supportCoinDailyLimit: limitSetting(env.SUPPORT_COIN_DAILY_LIMIT, DEFAULT_SUPPORT_COIN_DAILY_LIMIT, 'SUPPORT_COIN_DAILY_LIMIT'),
  databaseSsl: env.DATABASE_SSL ?? (isProd ? 'no-verify' : 'false'),
  bannedWords: (env.BANNED_WORDS || '').split(',').map((w) => w.trim()).filter(Boolean),
  firewall: {
    enabled: env.FIREWALL_ENABLED !== 'false',
    // Asla yasaklanmayacak IP'ler (yerel geliştirme + kendi ofis/izleme IP'leriniz)
    allowIps: ['127.0.0.1', '::1', ...(env.FIREWALL_ALLOW_IPS || '').split(',').map((s) => s.trim()).filter(Boolean)],
    ipPerMinute: Number(env.FIREWALL_IP_PER_MINUTE || 300),
    banThreshold: Number(env.FIREWALL_BAN_THRESHOLD || 30),
  },
};
