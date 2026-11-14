// Sunucu kayıtlarını (güncelleme / kurulum logları) yönetim panelinde göstermeden önce gizli değerleri maskeler.
// Saf mantık: veritabanı gerektirmez.

const MASK = '***';

const RULES = [
  // Bağlantı adresindeki kullanıcı:şifre (postgres://kullanici:sifre@sunucu, https://x:token@github.com)
  [/([a-z][a-z0-9+.-]*:\/\/)([^\s:/@]+):([^\s@/]+)@/gi, (_m, scheme, user) => `${scheme}${user}:${MASK}@`],
  // GitHub / GitLab / Slack / Google / AWS anahtar biçimleri
  [/\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{20,}|xox[abpr]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,}|AKIA[0-9A-Z]{16})\b/g, MASK],
  // JWT (üç parça base64url)
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, MASK],
  // Authorization: Bearer xxx
  [/(\bauthorization\s*[:=]\s*(?:bearer|basic|token)\s+)\S+/gi, `$1${MASK}`],
  [/(\bbearer\s+)[A-Za-z0-9._~+/-]{12,}=*/gi, `$1${MASK}`],
  // ANAHTAR=değer / anahtar: değer / "anahtar": "değer" (şifre, secret, token, api key, private key…)
  [/((?:["']?)[A-Za-z0-9_.-]*(?:pass(?:word|wd)?|secret|token|api[_-]?key|private[_-]?key|access[_-]?key|credential|sifre|şifre)[A-Za-z0-9_.-]*["']?\s*[:=]\s*)(["']?)([^\s"',;]+)\2/gi,
    (_m, head, q) => `${head}${q}${MASK}${q}`],
  // PEM özel anahtar blokları
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, `-----BEGIN PRIVATE KEY-----${MASK}-----END PRIVATE KEY-----`],
];

/** Metindeki şifre / anahtar / token değerlerini *** ile değiştirir. null / boş gelirse olduğu gibi döner. */
export function redactSecrets(text) {
  if (typeof text !== 'string' || !text) return text;
  let out = text;
  for (const [re, rep] of RULES) out = out.replace(re, rep);
  return out;
}
