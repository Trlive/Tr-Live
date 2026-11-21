// Yönetici paneli — müşteri hizmetleri.
// Ortak yardımcılar ve import'lar: admin.shared.js
import { Router } from 'express';
import { assertUser, hub, query, text, uuid } from './admin.shared.js';

export const router = Router();

// ---------------- Müşteri hizmetleri (admin + yardımcı admin) ----------------
router.get('/support/threads', async (_req, res) => {
  const r = await query(
    `SELECT DISTINCT ON (m.user_id) m.user_id, m.body, m.from_staff, m.created_at, u.username, u.display_name, u.public_id, u.avatar_url,
            (SELECT COUNT(*)::int FROM support_messages x WHERE x.user_id = m.user_id AND x.from_staff = FALSE
               AND x.created_at > COALESCE((SELECT MAX(created_at) FROM support_messages y WHERE y.user_id = m.user_id AND y.from_staff = TRUE), 'epoch')) AS waiting
     FROM support_messages m JOIN users u ON u.id = m.user_id
     ORDER BY m.user_id, m.created_at DESC`,
  );
  const threads = r.rows.sort((a, b) => (b.waiting > 0) - (a.waiting > 0) || new Date(b.created_at) - new Date(a.created_at)).slice(0, 100);
  res.json({ threads: threads.map((t) => ({
    userId: t.user_id, username: t.username, displayName: t.display_name, publicId: t.public_id, avatarUrl: t.avatar_url,
    lastMessage: t.body, lastFromStaff: t.from_staff, lastAt: t.created_at, waiting: t.waiting,
  })) });
});

router.get('/support/:userId', async (req, res) => {
  const userId = uuid(req.params.userId, 'Kullanıcı');
  const r = await query(`SELECT * FROM support_messages WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200`, [userId]);
  res.json({ messages: r.rows.reverse().map((m) => ({ id: m.id, fromStaff: m.from_staff, category: m.category, text: m.body, createdAt: m.created_at })) });
});

router.post('/support/:userId/reply', async (req, res) => {
  const userId = uuid(req.params.userId, 'Kullanıcı');
  const body = text(req.body?.text, 'Mesaj', { min: 1, max: 1500, required: true });
  await assertUser(userId);
  const m = (await query(`INSERT INTO support_messages(user_id, from_staff, staff_id, body) VALUES($1,TRUE,$2,$3) RETURNING id`, [userId, req.user.id, body])).rows[0];
  hub.sendToUser(userId, { type: 'support_message' });
  res.status(201).json({ id: m.id });
});

// ---------------- Coin paketleri (yönetici) ----------------
