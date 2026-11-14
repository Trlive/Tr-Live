// Günlük giriş kuralları (saf mantık, veritabanı gerektirmez; test edilebilir).

/** "20,20,20,20,50,50,100" → [20, 20, 20, 20, 50, 50, 100]. Bozuk değerde varsayılan. */
export function parseCoins(v) {
  const parts = String(v ?? '').split(',').map((x) => Number(x.trim()));
  if (parts.length === 7 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 999999999)) return parts;
  return [20, 20, 20, 20, 50, 50, 100];
}

/**
 * Bugün giriş yapılırsa kaçıncı gün olur. [last]: son kayıt { streak, gap } (gap = bugün - son gün, gün).
 * Dün giriş yapıldıysa seri sürer; 7. günden sonra yeniden 1; araya gün girerse 1.
 */
export function nextStreak(last) {
  if (!last || last.gap !== 1) return 1;
  return last.streak >= 7 ? 1 : last.streak + 1;
}

/** Penceredeki ilerleme: kaç gün işaretli görünür ve bugün yapıldı mı. */
export function progress(last) {
  if (!last) return { signedDays: 0, signedToday: false };
  if (last.gap === 0) return { signedDays: last.streak, signedToday: true };
  if (last.gap === 1 && last.streak < 7) return { signedDays: last.streak, signedToday: false };
  return { signedDays: 0, signedToday: false };
}
