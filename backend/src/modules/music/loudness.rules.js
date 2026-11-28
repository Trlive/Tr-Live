// Ses yüksekliği eşitleme saf kuralları (birim testli).

/** Hedef ortalama ses yüksekliği. Yayın/akış servislerinin konuşma+müzik karışımı için kullandığı düzeye yakın;
 *  oda müziği konuşmaların altında kalır. */
export const TARGET_LUFS = -18;
/** En çok bu kadar kısılır (çok yüksek kaydedilmiş parça bile duyulur kalır). */
export const MIN_GAIN_DB = -14;

/** Ölçülen LUFS → kazanç (dB). Yalnızca kısar (en çok 0), [MIN_GAIN_DB, 0] aralığında, 0,1 dB'e yuvarlı. */
export function gainForLufs(lufs) {
  const x = Number(lufs);
  if (!Number.isFinite(x) || x < -70) return 0; // sessiz / ölçülemeyen parça: dokunma
  const g = Math.min(0, Math.max(MIN_GAIN_DB, TARGET_LUFS - x));
  return Math.round(g * 10) / 10 || 0;
}

/** ffmpeg ebur128 çıktısının "Summary" bölümündeki "I: -14.2 LUFS" değeri. Bulunamazsa null. */
export function parseIntegratedLufs(stderr) {
  const s = String(stderr ?? '');
  const i = s.lastIndexOf('Summary:');
  const m = /I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/.exec(i >= 0 ? s.slice(i) : s);
  return m ? Number(m[1]) : null;
}
