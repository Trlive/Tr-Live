// Hediye combo sayacı (Yoho): aynı kişi(ler)e aynı hediye birkaç saniye içinde tekrar gönderilirse
// sayaç artar (x2, x3 ...). Bellek içidir; tek sunucu örneği için yeterli (çoklu örnekte Redis gerekir).
export const COMBO_WINDOW_MS = 6000;
// Şanslı hediye (Yoho / Tinni): combo düğmesi son gönderimden sonra daha uzun açık kalır.
export const LUCKY_COMBO_WINDOW_MS = 12000;
const combos = new Map(); // anahtar -> { n, at }

export function nextCombo(key, now = Date.now(), windowMs = COMBO_WINDOW_MS) {
  const prev = combos.get(key);
  const n = prev && now - prev.at <= windowMs ? prev.n + 1 : 1;
  combos.set(key, { n, at: now });
  if (combos.size > 5000) {
    for (const [k, v] of combos) if (now - v.at > LUCKY_COMBO_WINDOW_MS) combos.delete(k);
  }
  return n;
}
