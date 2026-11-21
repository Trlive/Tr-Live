import { Router } from 'express';
import { query, tx } from '../../infrastructure/database/database.js';
import { requireAuth } from '../../middleware/authentication/auth.js';
import { fail, uuid, oneOf, text } from '../../shared/errors/http.js';
import { userLimit } from '../../middleware/security/firewall.js';
import { publicUser, USER_PUBLIC_COLUMNS, USER_PUBLIC_JOINS } from '../../shared/utils/views.js';
import { hub } from '../../infrastructure/websocket/realtime.js';
import { forgetTyping } from '../rooms/presence.service.js';

export const router = Router();
router.use(requireAuth);

export const REPORT_REASONS = ['spam', 'harassment', 'nudity', 'hate', 'scam', 'underage', 'violence', 'other'];

// ---------------- Kullanıcı engelleme ----------------
router.get('/blocks', async (req, res) => {
  const r = await query(
    `SELECT ${USER_PUBLIC_COLUMNS} FROM user_blocks b JOIN users u ON u.id = b.blocked_id ${USER_PUBLIC_JOINS}
     WHERE b.blocker_id = $1 ORDER BY b.created_at DESC LIMIT 200`,
    [req.user.id],
  );
  // Engellediğiniz kişiyi yönetebilmeniz için gizli kullanıcı maskesi uygulanmaz.
  res.json({ users: r.rows.map((x) => ({ ...publicUser({ ...x, is_hidden: false }, req.user.id), id: x.id })) });
});

router.post('/blocks/:userId', userLimit('block', 30, 3600e3), async (req, res) => {
  const targetId = uuid(req.params.userId, 'Kullanıcı');
  if (targetId === req.user.id) throw fail('Kendinizi engelleyemezsiniz.');
  const t = (await query(`SELECT 1 FROM users WHERE id = $1 AND account_status = 'active'`, [targetId])).rows[0];
  if (!t) throw fail('Kullanıcı bulunamadı.', 404);
  await tx(async (c) => {
    await c.query(`INSERT INTO user_blocks(blocker_id, blocked_id) VALUES($1,$2) ON CONFLICT (blocker_id, blocked_id) DO NOTHING`, [req.user.id, targetId]);
    await c.query(`DELETE FROM follows WHERE (follower_id = $1 AND followed_id = $2) OR (follower_id = $2 AND followed_id = $1)`, [req.user.id, targetId]);
  });
  hub.unwatchPair(req.user.id, targetId); // çevrimiçi durumu karşılıklı görünmez
  forgetTyping(req.user.id, targetId);
  res.json({ ok: true });
});

router.delete('/blocks/:userId', async (req, res) => {
  await query(`DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2`, [req.user.id, uuid(req.params.userId, 'Kullanıcı')]);
  res.json({ ok: true });
});

// ---------------- Şikâyet ----------------
router.post('/reports', userLimit('report', 10, 3600e3), async (req, res) => {
  const kind = oneOf(req.body?.kind, ['user', 'room', 'room_message', 'dm'], 'Tür');
  const reason = oneOf(req.body?.reason, REPORT_REASONS, 'Neden');
  const details = text(req.body?.details, 'Ayrıntı', { max: 500 });
  const targetUserId = req.body?.targetUserId ? uuid(req.body.targetUserId, 'Kullanıcı') : null;
  const roomId = req.body?.roomId ? uuid(req.body.roomId, 'Oda') : null;
  const messageId = req.body?.messageId ? uuid(req.body.messageId, 'Mesaj') : null;
  if (kind === 'user' && !targetUserId) throw fail('Şikâyet edilen kullanıcı gerekli.');
  if (kind === 'room' && !roomId) throw fail('Şikâyet edilen oda gerekli.');
  if ((kind === 'room_message' || kind === 'dm') && !messageId) throw fail('Şikâyet edilen mesaj gerekli.');
  if (targetUserId === req.user.id) throw fail('Kendinizi şikâyet edemezsiniz.');

  // Aynı konuda tekrar eden açık şikâyeti engelle.
  const dup = await query(
    `SELECT 1 FROM reports WHERE reporter_id = $1 AND status = 'open' AND kind = $2
       AND target_user_id IS NOT DISTINCT FROM $3 AND room_id IS NOT DISTINCT FROM $4 AND message_id IS NOT DISTINCT FROM $5`,
    [req.user.id, kind, targetUserId, roomId, messageId],
  );
  if (dup.rowCount) return res.json({ ok: true, duplicate: true });

  // Şikâyet anında içeriğin kopyası alınır.
  //
  // Eskiden yalnızca mesajın KİMLİĞİ saklanıyordu. Kullanıcı mesajı silince (ya da saklama
  // temizliği süpürünce) moderatör ekranında şikâyet duruyor ama neyin şikâyet edildiği
  // görünmüyordu — göremediğin kanıta göre karar veremezsin. Kötü niyetli kullanıcı tam da
  // bunu yapar: yaz, şikâyet edilince sil.
  const evidence = await snapshot({ kind, messageId, roomId, targetUserId });

  await query(
    `INSERT INTO reports(reporter_id, kind, target_user_id, room_id, message_id, reason, details, evidence)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
    [req.user.id, kind, targetUserId, roomId, messageId, reason, details, evidence ? JSON.stringify(evidence) : null],
  );
  res.status(201).json({ ok: true });
});


/// Şikâyet edilen içeriğin anlık kopyası.
///
/// Kopya **yalnızca şikâyet edilen tek öğeyi** içerir — sohbetin tamamını değil. Gereğinden
/// fazlasını saklamak, moderasyon ihtiyacını aşan bir veri birikimi olurdu.
///
/// Kopya alınamazsa (mesaj zaten silinmiş, oda kapanmış) şikâyet yine de kaydedilir: eksik
/// kanıtla bir şikâyet, hiç şikâyet olmamasından iyidir.
async function snapshot({ kind, messageId, roomId, targetUserId }) {
  try {
    const at = new Date().toISOString();
    if (kind === 'room_message' && messageId) {
      const r = await query(
        `SELECT m.body, m.created_at, u.display_name, r.name AS room_name
           FROM room_messages m
           LEFT JOIN users u ON u.id = m.user_id
           LEFT JOIN rooms r ON r.id = m.room_id
          WHERE m.id = $1`, [messageId]);
      const x = r.rows[0];
      return x ? { at, type: 'room_message', text: x.body, authorName: x.display_name, roomName: x.room_name, sentAt: x.created_at } : null;
    }
    if (kind === 'dm' && messageId) {
      const r = await query(
        `SELECT d.body, d.created_at, u.display_name
           FROM direct_messages d LEFT JOIN users u ON u.id = d.sender_id
          WHERE d.id = $1`, [messageId]);
      const x = r.rows[0];
      return x ? { at, type: 'dm', text: x.body, authorName: x.display_name, sentAt: x.created_at } : null;
    }
    if (kind === 'room' && roomId) {
      const r = await query(`SELECT name, announcement FROM rooms WHERE id = $1`, [roomId]);
      const x = r.rows[0];
      return x ? { at, type: 'room', roomName: x.name, text: x.announcement } : null;
    }
    if (kind === 'user' && targetUserId) {
      // Kullanıcı şikâyetinde kanıt profilin kendisidir: ad ve biyografi sonradan değiştirilebilir.
      const r = await query(`SELECT display_name, bio, avatar_url FROM users WHERE id = $1`, [targetUserId]);
      const x = r.rows[0];
      return x ? { at, type: 'user', authorName: x.display_name, text: x.bio, avatarUrl: x.avatar_url } : null;
    }
  } catch {
    // Kopya alınamadı: şikâyet yine kaydedilir.
  }
  return null;
}
