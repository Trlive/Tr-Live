// Yönetici paneli — şikâyetler.
// Ortak yardımcılar ve import'lar: admin.shared.js
import { Router } from 'express';
import { queue as moderationQueue, dossier as moderationDossier, act as moderationAct, summary as queueSummary } from '../moderation/queue.service.js';
import { fail, oneOf, query, text, uuid } from './admin.shared.js';

export const router = Router();

// ---------------- Şikâyetler (admin + support) ----------------
router.get('/reports', async (req, res) => {
  const status = oneOf(String(req.query.status ?? 'open'), ['open', 'resolved', 'dismissed'], 'Durum');
  // Şikâyet edilen mesajın metni (oda mesajı / özel mesaj) yalnızca o mesaj için gösterilir; konuşmanın geri kalanı açılmaz.
  const r = await query(
    `SELECT r.*, ru.username AS reporter_username, tu.username AS target_username, tu.display_name AS target_name, tu.public_id AS target_public_id,
            tu.account_status AS target_status, ro.name AS room_name, rb.username AS resolved_by_username,
            CASE WHEN r.kind = 'room_message' THEN rmsg.body WHEN r.kind = 'dm' THEN dm.body END AS message_text,
            CASE WHEN r.kind = 'room_message' THEN rmsg.user_id WHEN r.kind = 'dm' THEN dm.sender_id END AS message_sender_id,
            mu.username AS message_sender_username, r.evidence, r.action
     FROM reports r
     JOIN users ru ON ru.id = r.reporter_id LEFT JOIN users tu ON tu.id = r.target_user_id LEFT JOIN rooms ro ON ro.id = r.room_id
     LEFT JOIN users rb ON rb.id = r.resolved_by
     LEFT JOIN room_messages rmsg ON r.kind = 'room_message' AND rmsg.id = r.message_id
     -- Özel mesaj yalnızca şikâyet edenin taraf olduğu konuşmadansa gösterilir (başkasının mesajı kimlikle çekilemez).
     LEFT JOIN direct_messages dm ON r.kind = 'dm' AND dm.id = r.message_id AND r.reporter_id IN (dm.sender_id, dm.receiver_id)
     LEFT JOIN users mu ON mu.id = CASE WHEN r.kind = 'room_message' THEN rmsg.user_id WHEN r.kind = 'dm' THEN dm.sender_id END
     WHERE r.status = $1 ORDER BY r.created_at DESC LIMIT 200`,
    [status],
  );
  res.json({ reports: r.rows.map((x) => ({
    id: x.id, kind: x.kind, reason: x.reason, details: x.details, status: x.status, createdAt: x.created_at,
    reporter: x.reporter_username, reporterId: x.reporter_id, targetUserId: x.target_user_id, target: x.target_username,
    targetName: x.target_name ?? null, targetPublicId: x.target_public_id ?? null, targetStatus: x.target_status ?? null,
    roomId: x.room_id, roomName: x.room_name ?? null, messageId: x.message_id,
    // Canlı mesaj silinmişse şikâyet anındaki kopya gösterilir. Eskiden bu durumda ekranda
    // hiçbir şey görünmüyordu: kötü niyetli kullanıcı yazıp, şikâyet edilince siliyordu.
    messageText: x.message_text ?? x.evidence?.text ?? null,
    evidenceOnly: !x.message_text && !!x.evidence?.text,
    evidence: x.evidence ?? null, action: x.action ?? null,
    // Mesajı yazan, şikâyet edilen kişiden farklı olabilir (şikâyet eden yanlış kişiyi seçmiş olabilir): panel bunu ayrıca gösterir.
    messageSenderId: x.message_sender_id ?? null, messageSender: x.message_sender_username ?? null,
    resolvedAt: x.resolved_at ?? null, resolvedNote: x.resolved_note ?? null, resolvedBy: x.resolved_by_username ?? null,
  })) });
});

router.post('/reports/:id/resolve', async (req, res) => {
  const status = oneOf(req.body?.status, ['resolved', 'dismissed'], 'Durum');
  const r = await query(
    `UPDATE reports SET status = $2, resolved_by = $3, resolved_note = $4, resolved_at = NOW() WHERE id = $1 AND status = 'open' RETURNING id`,
    [uuid(req.params.id, 'Şikâyet'), status, req.user.id, text(req.body?.note, 'Not', { max: 300 })],
  );
  if (!r.rowCount) throw fail('Açık şikâyet bulunamadı.', 404);
  res.json({ ok: true });
});

// ---------------- Güvenlik duvarı (yalnızca yönetici) ----------------


// ---------------- Moderasyon kuyruğu (denetim S-06) ----------------
//
// Şikâyetler ve otomatik ihlaller tek ekranda, hedef kullanıcıya göre gruplanmış ve aciliyet
// sırasına dizilmiş olarak gelir. Tek tek liste yerine gruplama bilinçli: karar kişi hakkındadır,
// aynı kişiyle ilgili sekiz şikâyet sekiz ayrı karar gerektirmez.

router.get('/moderation/queue', async (req, res, next) => {
  try {
    res.json({
      summary: await queueSummary(),
      items: await moderationQueue({ limit: Number.parseInt(req.query.limit, 10) || 100 }),
    });
  } catch (e) { next(e); }
});

router.get('/moderation/queue/:userId', async (req, res, next) => {
  try { res.json(await moderationDossier(uuid(req.params.userId, 'Kullanıcı'))); } catch (e) { next(e); }
});

router.post('/moderation/queue/:userId/act', async (req, res, next) => {
  try {
    res.json(await moderationAct({
      moderatorId: req.user.id,
      moderatorRole: req.user.system_role,
      targetUserId: uuid(req.params.userId, 'Kullanıcı'),
      action: String(req.body?.action || ''),
      reason: req.body?.reason,
      days: req.body?.days,
      roomId: req.body?.roomId ? uuid(req.body.roomId, 'Oda') : null,
    }));
  } catch (e) { next(e); }
});
