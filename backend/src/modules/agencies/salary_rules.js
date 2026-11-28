// Maaş ve kota sayımı kuralı (bağımlılık yok, test edilebilir).
//
// Sesli odada kendine gönderilen hediye, alıcının maaşına ve kotasına SAYILIR (sahibinin kararı).
// Görüntülü odada kendine hediye zaten gönderilemez (gifts.routes.js); eski kayıtlarda kalanlar sayılmaz.
// Liderlik tabloları ve resmi etkinlik sayımı bu kuraldan etkilenmez; onlar kendine hediyeyi hâlâ dışlar.

/** JS karşılığı: bu hediye alıcının maaş/kota hesabına girer mi? */
export function giftCountsForSalary({ senderId, receiverId, roomType }) {
  return senderId !== receiverId || roomType !== 'video';
}

/**
 * Aynı kuralın SQL karşılığı. gift_transactions için `g`, rooms için roomAlias (LEFT JOIN edilmiş olmalı) kullanılır.
 * IS DISTINCT FROM: odası silinmiş (NULL) kayıt sesli sayılır, tıpkı hostPeriodMetrics'teki CASE gibi.
 * Bu iki karşılık birlikte değişmeli.
 */
export const salaryGiftSql = (roomAlias = 'r') => `(g.sender_id <> g.receiver_id OR ${roomAlias}.room_type IS DISTINCT FROM 'video')`;
