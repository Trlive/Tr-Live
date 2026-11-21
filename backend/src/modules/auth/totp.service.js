import crypto from 'node:crypto';

/// TOTP (zaman tabanlı tek kullanımlık şifre) — RFC 6238.
///
/// **Niçin elle yazıldı:** `speakeasy` ya da `otplib` eklemek, sattığın koda onlarca bağımlılık
/// paketi daha sokardı. Algoritma belgeli, değişmiyor ve `node:crypto` ile elli satır.
/// Doğruluğu RFC 6238'in kendi test vektörleriyle sınanıyor — yanlış bir uygulama, yöneticiyi
/// kendi panelinden kilitler ya da daha kötüsü, hiçbir kodu reddetmez.

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Rastgele gizli anahtar (base32, 160 bit — RFC 4226'nın önerdiği uzunluk). */
export function newSecret() {
  const buf = crypto.randomBytes(20);
  let bits = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

export function base32Decode(s) {
  const clean = String(s || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const c of clean) {
    const v = B32.indexOf(c);
    if (v < 0) continue;
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** Verilen zaman adımı için 6 haneli kod. */
export function codeFor(secret, counter) {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  // JavaScript sayısı 2^53'e kadar güvenli; zaman adımı bunun çok altında.
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const h = crypto.createHmac('sha1', key).update(buf).digest();
  const off = h[h.length - 1] & 0x0f;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 1000000).padStart(6, '0');
}

/**
 * Kodu doğrular.
 *
 * `window` komşu zaman adımlarına da bakar: telefonun saati sunucuyla birkaç saniye kayık
 * olabilir ve kullanıcı kodu tam değişirken yazmış olabilir. ±1 adım (30 sn) yaygın ve
 * güvenli ölçüdür; daha geniş pencere, çalınan bir kodun geçerlilik süresini uzatır.
 *
 * Karşılaştırma **sabit zamanlı**: normal `===` ile kodun kaç hanesinin tuttuğu yanıt
 * süresinden anlaşılabilirdi.
 */
export function verifyCode(secret, code, { now = Date.now(), window = 1, step = 30 } = {}) {
  const c = String(code || '').replace(/\D/g, '');
  if (c.length !== 6) return false;
  const counter = Math.floor(now / 1000 / step);
  for (let d = -window; d <= window; d++) {
    const want = codeFor(secret, counter + d);
    if (want.length === c.length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(c))) return true;
  }
  return false;
}

/** Kimlik doğrulayıcı uygulamalarının okuduğu adres. Telefonda tıklanınca uygulama açılır. */
export function otpauthUri(secret, { account, issuer = 'TR Live' } = {}) {
  const e = encodeURIComponent;
  return `otpauth://totp/${e(issuer)}:${e(account)}?secret=${secret}&issuer=${e(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/// Kurtarma kodları: telefon kaybolursa tek çıkış yolu.
///
/// Kurtarma kodu olmayan bir 2FA, telefonu kaybeden yöneticiyi kendi panelinden kalıcı olarak
/// kilitler. Veritabanına elle müdahale gerekir — ki o da en kötü anda, baskı altında yapılır.
export function newRecoveryCodes(n = 8) {
  const out = [];
  for (let i = 0; i < n; i++) {
    // Okunabilir biçim: 4+4 karakter, karışabilen harfler (I, O, 0, 1) yok.
    const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let j = 0; j < 8; j++) s += alpha[crypto.randomInt(alpha.length)];
    out.push(`${s.slice(0, 4)}-${s.slice(4)}`);
  }
  return out;
}

/// Kurtarma kodları veritabanında **düz metin saklanmaz**: veritabanı sızarsa 2FA'yı
/// tamamen atlatırlardı. Şifreler gibi özetlenir.
export const hashRecovery = (code) =>
  crypto.createHash('sha256').update(String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '')).digest('hex');
