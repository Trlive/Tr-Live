// Bayi API'si saf kuralları (veritabanısız; birim testli): anahtar üretimi/çözümü, IP izin listesi, sipariş no biçimi.
import crypto from 'node:crypto';
import net from 'node:net';

const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const rand = (n) => { let s = ''; for (const b of crypto.randomBytes(n)) s += ABC[b % ABC.length]; return s; };

/** Yeni anahtar: "trk_<8 önek>_<40 gizli>". Dönüş: { key (bir kez gösterilir), prefix, hash }. */
export function newApiKey() {
  const prefix = `trk_${rand(8)}`;
  const key = `${prefix}_${rand(40)}`;
  return { key, prefix, hash: sha256(key) };
}
export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
export const KEY_RE = /^(trk_[A-Za-z0-9]{8})_[A-Za-z0-9]{40}$/;

/** "Bearer trk_..." başlığından anahtar ve önek. Biçim bozuksa null. */
export function parseBearer(h) {
  const m = /^Bearer\s+(\S+)$/.exec(String(h ?? ''));
  if (!m) return null;
  const k = KEY_RE.exec(m[1]);
  return k ? { key: m[1], prefix: k[1] } : null;
}

/** Saklanan özetle sabit zamanlı karşılaştırma. */
export function keyMatches(key, hash) {
  const a = Buffer.from(sha256(key), 'hex'); const b = Buffer.from(String(hash ?? ''), 'hex');
  return a.length === 32 && b.length === 32 && crypto.timingSafeEqual(a, b);
}

const v4 = (ip) => ip.split('.').reduce((n, x) => (n << 8n) + BigInt(Number(x)), 0n);
const normIp = (ip) => String(ip ?? '').replace(/^::ffff:/, '');

/** İzin listesi girdisi: tek IP (v4/v6) ya da IPv4 CIDR (ör. 203.0.113.0/24). Geçersizse null. */
export function cleanAllowEntry(raw) {
  const s = String(raw ?? '').trim();
  const cidr = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(s);
  if (cidr) return net.isIPv4(cidr[1]) && Number(cidr[2]) >= 8 && Number(cidr[2]) <= 32 ? s : null;
  return net.isIP(s) ? s.toLowerCase() : null;
}

/** IP izin listesinde mi? Liste boşsa her IP. */
export function ipAllowed(list, ip) {
  if (!list || !list.length) return true;
  const x = normIp(ip);
  for (const e of list) {
    const cidr = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(e);
    if (cidr) {
      if (!net.isIPv4(x)) continue;
      const bits = BigInt(Number(cidr[2]));
      const mask = ((1n << 32n) - 1n) ^ ((1n << (32n - bits)) - 1n);
      if ((v4(x) & mask) === (v4(cidr[1]) & mask)) return true;
    } else if (e.toLowerCase() === x.toLowerCase()) {
      return true;
    }
  }
  return false;
}

/** Bayinin sipariş numarası: 1–64 karakter, harf/rakam/-/_ (aynı numara ikinci kez Coin yüklemez). */
export const CLIENT_ORDER_RE = /^[A-Za-z0-9_-]{1,64}$/;
