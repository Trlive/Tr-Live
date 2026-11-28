// LiveKit webhook'u (rapor K-04): ses sunucusunda olan biteni sunucu da görür ve kurala aykırı yayını keser.
//
// Neden: yayın izni LiveKit anahtarının içinde taşınır ve koltuktan indirme / susturma LiveKit'e ayrı bir çağrıyla bildirilir.
// O çağrı ulaşmazsa ya da değiştirilmiş bir uygulama elindeki anahtarla yeniden bağlanırsa, sunucu bunu hiç bilmiyordu.
// Artık LiveKit her katılım ve her yeni yayın izinde buraya haber verir; durum veritabanıyla karşılaştırılır:
//  - participant_joined: odanın üyesi olmayan (atılmış, çıkmış, oda kapanmış) katılımcı çıkarılır.
//  - track_published: koltuk / susturma kuralına (publish_policy.rules.js) aykırı iz için izin yeniden uygulanır;
//    LiveKit izinsiz kalan izi kendisi yayından kaldırır.
// Kimlik doğrulama: LiveKit isteği API anahtarıyla imzalar (Authorization: JWT, gövdenin sha256'sı içinde). İmzasız ya da
// bozuk istek 401 alır. Ayar: deploy/oracle/install.sh → livekit.yaml "webhook".
import express, { Router } from 'express';
import { query } from '../../infrastructure/database/database.js';
import { webhookReceiver, setPublishPermission, removeParticipant } from '../../infrastructure/livekit/livekit.js';
import { log } from '../../infrastructure/observability/log.js';
import { publishPolicy, sourceAllowed } from './publish_policy.rules.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const defaultDeps = {
  roomOf: async (roomId) => (await query(`SELECT id, room_type, muted_seats FROM rooms WHERE id = $1 AND is_active = TRUE`, [roomId])).rows[0] ?? null,
  memberOf: async (roomId, userId) => (await query(`SELECT seat_index FROM room_members WHERE room_id = $1 AND user_id = $2`, [roomId, userId])).rows[0] ?? null,
  setPermission: setPublishPermission,
  remove: removeParticipant,
};

/**
 * Tek bir webhook olayını işler. Dönüş, ne yapıldığını anlatan kısa bir etiket (test ve kayıt için).
 * Görüntülü PK izleyicileri ("pk-<kullanıcı>") rakip odada yalnızca izler: yayın açarlarsa çıkarılırlar.
 */
export async function handleLivekitEvent(ev, deps = defaultDeps) {
  const roomId = ev?.room?.name;
  const identity = ev?.participant?.identity;
  if (!roomId || !identity || !UUID_RE.test(roomId)) return 'ignored';
  if (ev.event !== 'participant_joined' && ev.event !== 'track_published') return 'ignored';

  if (identity.startsWith('pk-')) {
    if (ev.event !== 'track_published') return 'ok';
    await deps.remove(roomId, identity);
    log.warn('livekit_unauthorized_publish', { roomId, identity, reason: 'pk_viewer' });
    return 'removed';
  }
  if (!UUID_RE.test(identity)) return 'ignored';

  const room = await deps.roomOf(roomId);
  const member = room ? await deps.memberOf(roomId, identity) : null;
  if (!member) {
    await deps.remove(roomId, identity);
    log.warn('livekit_non_member', { roomId, identity, event: ev.event, roomOpen: Boolean(room) });
    return 'removed';
  }
  if (ev.event === 'participant_joined') return 'ok';

  const policy = publishPolicy(room, member);
  if (sourceAllowed(policy, ev.track?.source)) return 'ok';
  await deps.setPermission(roomId, identity, policy);
  log.warn('livekit_unauthorized_publish', { roomId, identity, source: ev.track?.source ?? null, seatIndex: member.seat_index });
  return 'revoked';
}

export const router = Router();

// Gövde HAM okunur: imza, gövdenin baytları üzerinden doğrulanır (JSON ayrıştırıp yeniden üretmek imzayı bozar).
router.post('/', express.raw({ type: () => true, limit: '256kb' }), async (req, res) => {
  const receiver = webhookReceiver();
  if (!receiver) return res.status(503).end();
  let ev;
  try {
    ev = await receiver.receive(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '', req.get('Authorization'));
  } catch {
    return res.status(401).end();
  }
  // LiveKit yanıtı beklemesin (zaman aşımında aynı olayı yeniden gönderir); iş arka planda yapılır.
  res.status(200).end();
  handleLivekitEvent(ev).catch((e) => log.error('livekit_webhook_failed', { event: ev?.event, message: e.message }));
});
