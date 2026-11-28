// Yayın (mikrofon/kamera) izni kuralı — tek kaynak. Bağımlılık yok, test edilebilir.
//
// LiveKit anahtarı, koltuğa oturma, koltuk susturma ve LiveKit webhook'u (izinsiz yayını kesme) AYNI kuralı kullanır;
// böylece "uygulama ne gösteriyor" ile "ses sunucusu neye izin veriyor" ayrışmaz. Eskiden koltuk susturma yalnızca
// istemcide uygulanıyordu: değiştirilmiş bir uygulama susturulmuş koltukta konuşmaya devam edebiliyordu.
import { TrackSource } from 'livekit-server-sdk';

/**
 * room: { room_type, muted_seats } · member: { seat_index } | null
 * Dönüş: { canPublish, sources } — sources null ise tüm kaynaklar serbest; dizi ise yalnızca onlar.
 *  - Koltukta değil (ya da odada değil): yayın yok.
 *  - Susturulmuş koltuk: sesli odada yayın yok; görüntülü odada yalnızca kamera (görüntü sürer, ses kapanır).
 *  - Diğer: tam izin.
 */
export function publishPolicy(room, member) {
  if (!room || !member || member.seat_index === null || member.seat_index === undefined) return { canPublish: false, sources: null };
  const muted = (room.muted_seats ?? []).includes(member.seat_index);
  if (!muted) return { canPublish: true, sources: null };
  if (room.room_type === 'video') return { canPublish: true, sources: [TrackSource.CAMERA] };
  return { canPublish: false, sources: null };
}

/** Bu kaynaktan yayın bu izinle serbest mi? source: TrackSource (sayı). */
export function sourceAllowed(policy, source) {
  if (!policy.canPublish) return false;
  return !policy.sources || policy.sources.includes(source);
}
