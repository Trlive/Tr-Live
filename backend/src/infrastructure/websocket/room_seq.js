// Oda olayları için sıra numarası (rapor O-04; bağımlılık yok, test edilebilir).
//
// Her oda için artan bir sayaç tutulur; durumu değiştiren oda olaylarına `seq` damgası vurulur. İstemci `seq`'te boşluk görürse
// (ör. 41'den sonra 43 geldi) bir olay kaçmış demektir ve oda durumunu yeniden alır. Abonelik onayı (`room_subscribed`) o anki
// numarayı taşır: istemci takibe oradan başlar, böylece kopma sonrası yeniden abone olan istemci sahte "boşluk" görmez.
//
// Sayaç bellek içidir ve süreç yeniden başlayınca sıfırlanır; bu sorun değildir: yeniden başlatmada tüm bağlantılar kapanır, istemci yeniden
// abone olur ve yeni taban numarayı alır. Odada kimse kalmadığında sayaç silinir (bellek şişmez); sonraki abone yine tabanı onaydan alır.
export function createRoomSeq() {
  const seqs = new Map();
  return {
    /** Bir sonraki numara (1'den başlar). */
    next(roomId) {
      const n = (seqs.get(roomId) ?? 0) + 1;
      seqs.set(roomId, n);
      return n;
    },
    /** Şu ana kadar verilen son numara (hiç verilmediyse 0). */
    current(roomId) { return seqs.get(roomId) ?? 0; },
    /** Odanın sayacını siler (oda boşaldı / kapandı). */
    drop(roomId) { seqs.delete(roomId); },
    size() { return seqs.size; },
  };
}

/**
 * Olaya sıra numarası vurur. Yalnızca görsel (kaybolması durumu bozmayan) olaylar damgasız kalır: bunlar yavaş istemcilere zaten
 * bilerek gönderilmez (hub'daki DECORATIVE), damga alsalardı istemci sahte boşluk görürdü.
 */
export function stampRoomEvent(payload, roomId, seqs, decorative) {
  if (decorative.has(payload?.type)) return payload;
  return { ...payload, seq: seqs.next(roomId) };
}
