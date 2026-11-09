// Sunucu kayıtlarında (kurulum / güncelleme günlüğü) şifre, anahtar ve token görünmesin. Kayıtlar uygulamadaki yönetim
// sayfasında da gösterildiği için oraya gitmeden önce bu süzgeçten geçer.
const RULES = [
  // Kurulumda üretilen panel şifresi satırı (eski sürümler kayda yazıyordu).
  [/(PANEL\s*S[Iİ]FRES[Iİ][^:\n]*:\s*)\S+/gi, '$1[gizlendi]'],
  // GitHub erişim anahtarları
  [/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, '[gizli-anahtar]'],
  // Bağlantı adresindeki şifre: postgres://kullanici:SIFRE@sunucu
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@/]+@/gi, '$1[gizlendi]@'],
  // ANAHTAR=değer / anahtar: değer biçimindeki gizli alanlar (--password=, client-secret:, X-Api-Token: dahil). Zaten gizlenmiş
  // değer atlanır: https://x-access-token:[gizlendi]@github.com/... adresinin geri kalanı silinmez.
  [/\b([A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|API_KEY|PRIVATE_KEY)[A-Z0-9_]*\s*[=:]\s*)(['"]?)(?!\[gizl)[^\s'"]+\2/gi, '$1$2[gizlendi]$2'],
  // HTTP yetki başlıkları
  [/(authorization:\s*(?:basic|bearer)\s+)\S+/gi, '$1[gizlendi]'],
];

export function redactSecrets(text) {
  if (typeof text !== 'string' || !text) return text;
  let out = text;
  for (const [re, rep] of RULES) out = out.replace(re, rep);
  return out;
}
