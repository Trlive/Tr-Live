import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { retry } from './retry.js';
import { log } from '../observability/log.js';

const configured = () => Boolean(process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET && process.env.LIVEKIT_URL);
// Sunucudan LiveKit'e (oda yönetimi) giden adres. Aynı makinede kuruluysa iç adres (LIVEKIT_API_URL) kullanılır;
// yoksa uygulamalara verilen genel adresten türetilir.
const httpUrl = () => (process.env.LIVEKIT_API_URL || (process.env.LIVEKIT_URL || '').replace(/^wss:/, 'https:').replace(/^ws:/, 'http:'));
const client = () => new RoomServiceClient(httpUrl(), process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);

// Anahtar ömrü KISA tutulur (varsayılan 15 dk). Sebep: mikrofon yetkisi anahtarın içindedir; koltuktan indirilen biri
// setCanPublish ile kapatılır, ama o çağrı ulaşamazsa eski anahtar süresi dolana kadar yayın yetkisi taşırdı. LiveKit sunucusu
// bağlı katılımcıya anahtarı kendisi yeniler; yeniden katılımda uygulama zaten yeni anahtar ister (rooms_media.routes.js).
export const TOKEN_TTL = '15m';

// hidden: katılımcı odadakilere görünmez (görüntülü PK'da rakip yayını izleyenler). ttl: anahtar ömrü.
export async function token({ identity, name, room, canPublish = true, metadata = '', hidden = false, ttl = TOKEN_TTL }) {
  if (!configured()) throw Object.assign(new Error('LiveKit yapılandırılmamış.'), { status: 503 });
  const t = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, { identity, name, metadata, ttl });
  // canPublishData kapalı: uygulama LiveKit veri kanalını kullanmaz (olaylar kendi WebSocket'imizden gider). Açık kalsaydı
  // değiştirilmiş bir istemci odadaki herkese sınırsız veri paketi yollayabilirdi.
  t.addGrant({ roomJoin: true, room, canPublish, canSubscribe: true, canPublishData: false, ...(hidden ? { hidden: true } : {}) });
  return t.toJwt();
}

// Aşağıdaki çağrılar "en iyi çaba"dır: LiveKit'e ulaşılamasa da oda işlemleri bozulmaz.
const notConnected = (e) => e?.status === 404 || e?.code === 'not_found';

/**
 * Katılımcının yayın (mikrofon) yetkisini açar/kapatır. Geçici hatada 3 kez dener; yine olmazsa SESSİZCE yutmaz, kayda yazar.
 * Katılımcı odada değilse (404) yapılacak bir şey yoktur: yetki bir sonraki anahtarda veritabanından zaten hesaplanır.
 * Dönüş: true = uygulandı ya da katılımcı bağlı değil; false = uygulanamadı (yetki iptali eksik kalmış olabilir).
 */
export async function setCanPublish(room, identity, canPublish) {
  if (!configured()) return true;
  const r = await retry(
    () => client().updateParticipant(room, identity, undefined, { canPublish, canSubscribe: true, canPublishData: false }),
    { attempts: 3, baseMs: 150, shouldRetry: (e) => !notConnected(e) },
  );
  if (r.ok || notConnected(r.error)) return true;
  log.warn('livekit_permission_update_failed', { room, identity, canPublish, attempts: r.attempts, error: r.error });
  return false;
}

export async function removeParticipant(room, identity) {
  if (!configured()) return;
  try { await client().removeParticipant(room, identity); } catch (_) { /* yoksay */ }
}

export async function deleteRoom(room) {
  if (!configured()) return;
  try { await client().deleteRoom(room); } catch (_) { /* yoksay */ }
}

/** Yönetim paneli için: LiveKit'e ulaşılabiliyor mu, kaç oda/katılımcı var. 4 sn'de yanıt yoksa "ulaşılamıyor". */
export async function livekitHealth() {
  if (!configured()) return { configured: false, ok: false };
  const started = Date.now();
  try {
    const rooms = await Promise.race([
      client().listRooms(),
      new Promise((_, reject) => { setTimeout(() => reject(new Error('zaman aşımı')), 4000).unref?.(); }),
    ]);
    return {
      configured: true, ok: true, latencyMs: Date.now() - started,
      rooms: rooms.length, participants: rooms.reduce((s, r) => s + Number(r.numParticipants ?? 0), 0),
    };
  } catch (e) {
    return { configured: true, ok: false, latencyMs: Date.now() - started, error: String(e?.message ?? e).slice(0, 120) };
  }
}
