import 'dotenv/config';
import path from 'node:path';

const env = process.env;
export const isProd = env.NODE_ENV === 'production';

let warned = false;
export function jwtSecret() {
  if (env.JWT_SECRET) return env.JWT_SECRET;
  if (isProd) throw new Error('JWT_SECRET tanımlı değil.');
  if (!warned) {
    warned = true;
    console.warn('[uyarı] JWT_SECRET tanımlı değil; yalnızca geliştirme için varsayılan anahtar kullanılıyor.');
  }
  return 'dev-only-change-me';
}

/// `*` yerine kullanılan geçici değer (bkz. validateConfig). Üretimde yalnızca eski kurulumlarda devreye girer.
let corsFallback = null;

export function validateConfig() {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL tanımlı değil.');
  if (isProd) {
    const secret = env.JWT_SECRET || '';
    if (secret.length < 32 || /CHANGE_ME/i.test(secret)) {
      throw new Error('Üretimde JWT_SECRET en az 32 karakterlik rastgele bir değer olmalıdır.');
    }
    if (!env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET || !env.LIVEKIT_URL) {
      console.warn('[uyarı] LiveKit ayarları eksik; sesli/görüntülü bağlantı çalışmaz.');
    }
    // CORS üretimde açık bırakılamaz.
    //
    // Oturum bileti `Authorization` başlığıyla taşındığı için tarayıcıdan oturum çalınması
    // riski düşük — ama `*`, herhangi bir sitenin tarayıcıdan API'mize istek atabilmesi demek.
    // Bir gün çerez tabanlı bir uca geçilirse bu ayar sessizce açık kapı olur. Ayrıca panel ve
    // oyun adreslerini açıkça yazmak, hangi kökenlerin beklendiğini belgeler.
    //
    // ## Geçiş yolu — niçin doğrudan hata vermiyoruz
    //
    // Çalışan kurulumlarda `CORS_ORIGIN='*'` yazıyor. Burada koşulsuz hata atsaydık, sunucu
    // kendini güncellediği an AÇILMAZDI: site, kimse bir şey yapmadan düşerdi. Bir güvenlik
    // sıkılaştırması, uygulandığı gün hizmeti kesiyorsa yanlış uygulanmıştır.
    //
    // Bu yüzden: `*` yazılıysa ve sunucunun kendi adresi (PUBLIC_BASE_URL) biliniyorsa, kısıt
    // ona daraltılır ve uyarı basılır. Açık kapı kapanır, sunucu ayakta kalır.
    //
    // Kendi adresi de bilinmiyorsa durulacak güvenli bir değer yok: orada hata doğrudur.
    const cors = (env.CORS_ORIGIN || '').trim();
    const self = (env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
    if (!cors || cors === '*') {
      if (!self) {
        throw new Error(
          'Üretimde CORS_ORIGIN tanımlı olmalı ve "*" olamaz. ' +
          'Panel ve oyun adreslerini virgülle yazın (ör. CORS_ORIGIN=https://panel.alanadi.com,https://oyun.alanadi.com).',
        );
      }
      corsFallback = self;
      console.warn(
        `[uyarı] CORS_ORIGIN="${cors || '(boş)'}" üretimde kabul edilmiyor; geçici olarak ${self} kullanılıyor. ` +
        'Kalıcı çözüm: .env dosyasına CORS_ORIGIN yazın (panel ve oyun adresleriyle birlikte).',
      );
    }
  }
}

export const config = {
  port: Number(env.PORT || 3000),
  // Geliştirmede '*' kabul edilir; üretimde validateConfig() bunu daraltır ya da reddeder.
  // Getter: validateConfig() config nesnesi kurulduktan SONRA çalışır, sabit değer eski kalırdı.
  get corsOrigin() {
    const raw = corsFallback || env.CORS_ORIGIN || '*';
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  },
  trustProxy: env.TRUST_PROXY === undefined ? false : (/^\d+$/.test(env.TRUST_PROXY) ? Number(env.TRUST_PROXY) : env.TRUST_PROXY === 'true'),
  uploadDir: env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'),
  // Bu değerin (Coin) üstündeki hediyeler tüm kullanıcılara global şerit olarak gider.
  globalGiftMinCoins: BigInt(env.GLOBAL_GIFT_MIN_COINS || 1000),
  // Yardımcı adminin 24 saatte yükleyebileceği toplam Coin (tek seferde en fazla 100.000 ve saatte 30 yükleme ayrıca
  // sınırlıdır). 0 = yardımcı adminin Coin yüklemesi kapalı. Bu ayar yönetim kodunda kullanılıyor ama burada tanımlı
  // değildi: yardımcı admin Coin yüklemeye çalışınca "Sunucu hatası" alıyordu (tanımsız değerle BigInt işlemi).
  supportCoinDailyLimit: /^\d{1,15}$/.test(env.SUPPORT_COIN_DAILY_LIMIT ?? '') ? BigInt(env.SUPPORT_COIN_DAILY_LIMIT) : 1000000n,
  databaseSsl: env.DATABASE_SSL ?? (isProd ? 'no-verify' : 'false'),
  bannedWords: (env.BANNED_WORDS || '').split(',').map((w) => w.trim()).filter(Boolean),
  firewall: {
    enabled: env.FIREWALL_ENABLED !== 'false',
    // Asla yasaklanmayacak IP'ler (yerel geliştirme + kendi ofis/izleme IP'leriniz)
    allowIps: ['127.0.0.1', '::1', ...(env.FIREWALL_ALLOW_IPS || '').split(',').map((s) => s.trim()).filter(Boolean)],
    // IP başına dakikalık istek sınırı (kaba sel koruması). Kullanıcı başına sınır DEĞİLDİR: operatör NAT'ı, yurt, kafe
    // ve aynı Wi-Fi'daki herkes tek IP'den görünür. Eski değer (300) birkaç kişinin aynı ağdan kullanmasıyla doluyordu.
    ipPerMinute: Number(env.FIREWALL_IP_PER_MINUTE || 3000),
    // Görsel / animasyon dosyaları (/uploads, /media, emoji) ayrı sayılır: API bütçesini tüketmez.
    mediaPerMinute: Number(env.FIREWALL_MEDIA_PER_MINUTE || 6000),
    // Aynı IP'den en fazla eşzamanlı canlı bağlantı (WebSocket). Kullanıcı başına sınır ayrıca 5'tir.
    wsPerIp: Number(env.FIREWALL_WS_PER_IP || 300),
    banThreshold: Number(env.FIREWALL_BAN_THRESHOLD || 30),
  },
};
