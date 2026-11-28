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

// ---------------------------------------------------------------- Kendine hediye sınırı (sahibin kararı, v2.152.20)
// Sesli odada kendine hediye maaşa sayılır ama SINIRLI: bir dönemde sayılan kendine hediye, sayılan toplam elmasın en çok
// %20'si olabilir. Yani başkalarından gelen elmasın en çok dörtte biri kadar sayılır; başkasından hiç hediye almayan
// yayıncının kendine hediyesi maaşa hiç sayılmaz. Sınır DÖNEM bazında hesaplanır; günlere orantılı dağıtılır.
// Ödeme (hostPeriodMetrics), ajans primi (agencyGiftRows) ve yayıncının kendi ekranı (me.routes) aynı fonksiyonu kullanır.
export const SELF_GIFT_CAP_BPS = 2000;

/** Sayılacak kendine hediye: min(kendine, başkaları × oran / (1 − oran)). Hepsi BigInt. */
export function cappedSelf(others, self, capBps = SELF_GIFT_CAP_BPS) {
  if (self <= 0n) return 0n;
  if (capBps >= 10000) return self;
  if (capBps <= 0 || others <= 0n) return 0n;
  const max = (others * BigInt(capBps)) / BigInt(10000 - capBps);
  return self < max ? self : max;
}

/**
 * Kendine hediyenin günlük dağılımını sınıra göre küçültür. selfDays: Map(gün → BigInt). Dönüş: { counted, days }.
 * Paylar aşağı yuvarlanır, kalan son güne eklenir: günlerin toplamı her zaman counted'a eşittir.
 */
export function scaleSelfDays(othersTotal, selfDays, capBps = SELF_GIFT_CAP_BPS) {
  let selfTotal = 0n;
  for (const v of selfDays.values()) selfTotal += v;
  const counted = cappedSelf(othersTotal, selfTotal, capBps);
  const days = new Map();
  if (counted === 0n) return { counted, days };
  if (counted === selfTotal) return { counted, days: new Map(selfDays) };
  const keys = [...selfDays.keys()].sort((a, b) => a - b);
  let given = 0n;
  keys.forEach((k, i) => {
    const share = i === keys.length - 1 ? counted - given : (selfDays.get(k) * counted) / selfTotal;
    given += share;
    if (share > 0n) days.set(k, share);
  });
  return { counted, days };
}

/** Gün numarasının hangi dönem diliminde olduğu: periodStarts artan sıralı dönem başlangıç günleri. */
export function segmentOf(day, periodStarts = []) {
  let seg = 0;
  for (let i = 0; i < periodStarts.length; i += 1) if (day >= periodStarts[i]) seg = i + 1;
  return seg;
}
