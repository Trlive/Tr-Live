import { Router } from 'express';
import { addMessageExp } from '../services/cp.js';
import express from 'express';
import { query } from '../database.js';
import { requireAuth } from '../auth.js';
import { fail, uuid, positiveInt } from '../http.js';
import { userLimit } from '../firewall.js';
import { hub } from '../realtime.js';
import { cleanMultiline } from '../text_safety.js';
import { screenText } from '../services/moderation.js';
import { presenceView } from '../services/presence.js';
import { areFriends } from './friends.js';
import { publicUser, USER_PUBLIC_COLUMNS, USER_PUBLIC_JOINS } from '../views.js';
import { saveUpload, IMAGE_TYPES, OWN_IMAGE_RE } from '../services/images.js';

export const router = Router();
router.use(requireAuth);

const msgJson = (m) => ({ id: m.id, senderId: m.sender_id, receiverId: m.receiver_id, text: m.body, imageUrl: m.image_url ?? null, createdAt: m.created_at, readAt: m.read_at });
// Sohbet listesinde fotoğraf mesajının önizlemesi.
const PREVIEW = `CASE WHEN body = '' AND image_url IS NOT NULL THEN '📷 Fotoğraf' ELSE body END`;

router.get('/unread-count', async (req, res) => {
  const r = await query(`SELECT COUNT(*)::int AS n FROM direct_messages WHERE receiver_id = $1 AND read_at IS NULL`, [req.user.id]);
  res.json({ unread: r.rows[0].n });
});

// Mesajlar sekmesindeki her şey (özel mesaj, bildirim, arkadaşlık/CP isteği, destek, resmî kanallar, ajans daveti,
// aile sohbeti) tek sorguda: sekme rozeti normal mesajdaki gibi hepsinde uyarı verir.
export const INBOX_ALERTS_SQL = `SELECT
    (SELECT COUNT(*)::int FROM direct_messages WHERE receiver_id = u.id AND read_at IS NULL) AS dm,
    (SELECT COUNT(*)::int FROM user_notifications n WHERE n.user_id = u.id AND n.id > u.notify_seen_id
        AND n.created_at > NOW() - INTERVAL '30 days'
        AND n.kind NOT IN ('friend_request', 'relation_request')) AS notify, -- istekler aşağıda zaten sayılır
    ((SELECT COUNT(*)::int FROM friend_requests WHERE target_id = u.id AND status = 'pending' AND created_at > NOW() - INTERVAL '7 days')
      + (SELECT COUNT(*)::int FROM cp_pairs WHERE (user_a = u.id OR user_b = u.id) AND request_kind IS NOT NULL
           AND request_from <> u.id AND request_at > NOW() - INTERVAL '24 hours'
           AND EXISTS (SELECT 1 FROM users ru WHERE ru.id = request_from AND ru.account_status = 'active'))) AS friends,
    (SELECT COUNT(*)::int FROM support_messages WHERE user_id = u.id AND from_staff = TRUE AND read_at IS NULL) AS support,
    (SELECT COUNT(*)::int FROM announcements a WHERE a.kind IN ('team', 'event', 'reward')
        AND a.created_at > COALESCE((u.inbox_seen->>a.kind)::timestamptz, u.announcements_seen_at)) AS official,
    ((SELECT COUNT(*)::int FROM agency_requests q JOIN agencies ag ON ag.id = q.agency_id AND ag.status = 'active'
        WHERE q.user_id = u.id AND q.direction = 'invite' AND q.status = 'pending')
     + (SELECT COUNT(*)::int FROM agency_assistants s JOIN agencies ag ON ag.id = s.agency_id AND ag.status = 'active'
        WHERE s.user_id = u.id AND s.status = 'pending' AND s.created_at > NOW() - INTERVAL '7 days')) AS agency,
    (SELECT COUNT(*)::int FROM family_messages m JOIN family_members fm ON fm.family_id = m.family_id AND fm.user_id = u.id
        WHERE m.id > fm.chat_seen_id AND m.user_id <> u.id) AS family
  FROM users u WHERE u.id = $1`;

router.get('/alerts', async (req, res) => {
  const x = (await query(INBOX_ALERTS_SQL, [req.user.id])).rows[0] ?? {};
  const keys = ['dm', 'notify', 'friends', 'support', 'official', 'agency', 'family'];
  const out = Object.fromEntries(keys.map((k) => [k, Number(x[k] ?? 0)]));
  res.json({ ...out, total: keys.reduce((a, k) => a + out[k], 0) });
});

router.get('/conversations', async (req, res) => {
  const r = await query(
    `WITH mine AS (
       SELECT CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END AS peer,
              id AS message_id, ${PREVIEW} AS body, created_at AS message_at, sender_id
       FROM direct_messages WHERE sender_id = $1 OR receiver_id = $1
     ), latest AS (
       SELECT DISTINCT ON (peer) peer, message_id, body, message_at, sender_id FROM mine ORDER BY peer, message_at DESC
     )
     SELECT l.message_id, l.body, l.message_at, l.sender_id,
            (SELECT COUNT(*)::int FROM direct_messages d WHERE d.sender_id = l.peer AND d.receiver_id = $1 AND d.read_at IS NULL) AS unread,
            u.show_presence, u.last_seen_at, is_ghost(u.id) AS ghost, ${USER_PUBLIC_COLUMNS}
     FROM latest l JOIN users u ON u.id = l.peer ${USER_PUBLIC_JOINS}
     WHERE u.account_status = 'active' AND NOT EXISTS (
       SELECT 1 FROM user_blocks b WHERE (b.blocker_id = $1 AND b.blocked_id = l.peer) OR (b.blocker_id = l.peer AND b.blocked_id = $1))
     ORDER BY l.message_at DESC LIMIT 50`,
    [req.user.id],
  );
  res.json({
    conversations: r.rows.map((x) => ({
      peer: publicUser(x, req.user.id), lastMessage: x.body, lastMessageAt: x.message_at, lastFromMe: x.sender_id === req.user.id, unread: x.unread,
      presence: presenceView(x),
    })),
  });
});

// Konuşma geçmişi (en yeni 50, eskiden yeniye). Karşı tarafın mesajları okundu işaretlenir.
router.get('/with/:userId', async (req, res) => {
  const peerId = uuid(req.params.userId, 'Kullanıcı');
  const limit = req.query.limit ? positiveInt(req.query.limit, 'Limit', 100) : 50;
  const r = await query(
    `SELECT * FROM direct_messages WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)
     ORDER BY created_at DESC LIMIT $3`,
    [req.user.id, peerId, limit],
  );
  const read = await query(`UPDATE direct_messages SET read_at = NOW() WHERE receiver_id = $1 AND sender_id = $2 AND read_at IS NULL`, [req.user.id, peerId]);
  // Gönderen sohbet ekranındaysa mesajlarının altında "Görüldü" görünür.
  if (read.rowCount) hub.sendToUser(peerId, { type: 'dm_read', userId: req.user.id, at: new Date().toISOString() });
  res.json({ messages: r.rows.reverse().map(msgJson) });
});

// Sohbete fotoğraf: önce yüklenir, dönen adres mesajla gönderilir.
router.put('/image', userLimit('dm_image', 30, 3600e3), express.raw({ type: Object.keys(IMAGE_TYPES), limit: '3mb' }), async (req, res) => {
  res.json({ url: await saveUpload(req, 'dm') });
});

router.post('/with/:userId', userLimit('dm10s', 6, 10e3), userLimit('dm1h', 200, 3600e3), async (req, res) => {
  const peerId = uuid(req.params.userId, 'Kullanıcı');
  if (peerId === req.user.id) throw fail('Kendinize mesaj gönderemezsiniz.');
  const body = cleanMultiline(req.body?.text ?? '', 1000) ?? '';
  let imageUrl = null;
  if (req.body?.imageUrl) {
    imageUrl = String(req.body.imageUrl);
    if (!OWN_IMAGE_RE.test(imageUrl)) throw fail('Görsel adresi geçersiz.');
    const own = await query(`SELECT 1 FROM upload_owners WHERE url = $1 AND owner_id = $2`, [imageUrl, req.user.id]);
    if (!own.rowCount) throw fail('Yalnızca kendi yüklediğin fotoğrafı gönderebilirsin.', 403);
  }
  if (!body && !imageUrl) throw fail('Mesaj boş olamaz.');

  const peer = (await query(`SELECT who_can_dm, account_status FROM users WHERE id = $1`, [peerId])).rows[0];
  if (!peer || peer.account_status !== 'active') throw fail('Kullanıcı bulunamadı.', 404);
  const blocked = await query(
    `SELECT 1 FROM user_blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`, [req.user.id, peerId],
  );
  // Engelleme durumu karşı tarafa belli edilmez: genel bir ret mesajı döner.
  if (blocked.rowCount) throw fail('Bu kullanıcıya mesaj gönderemezsiniz.', 403);
  if (peer.who_can_dm === 'nobody') throw fail('Bu kullanıcı özel mesaj almıyor.', 403);
  // Yalnızca arkadaş olan kişiler mesajlaşabilir.
  if (!(await areFriends(req.user.id, peerId))) throw fail('Mesajlaşmak için önce arkadaş olmalısınız.', 403);
  // İçerik denetimi alıcı kontrollerinden sonra: var olmayan / engelli kişiye yazma denemesi ihlal sayılmasın.
  if (body) await screenText(req.user, body, 'dm');
  const m = (await query(`INSERT INTO direct_messages(sender_id, receiver_id, body, image_url) VALUES($1,$2,$3,$4) RETURNING *`, [req.user.id, peerId, body, imageUrl])).rows[0];
  const message = msgJson(m);
  hub.sendToUser(peerId, { type: 'dm', message });
  // CP yakınlığı: çift başına günde ilk 10 mesaj 10'ar exp. Hata mesajı engellemesin.
  addMessageExp(req.user.id, peerId).catch((e) => console.error('CP mesaj puanı:', e.message));
  res.status(201).json({ message });
});
