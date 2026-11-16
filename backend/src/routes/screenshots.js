import { Router } from 'express';
import { query } from '../database.js';
import { requireAuth, requireStaff } from '../auth.js';
import { userLimit } from '../firewall.js';
import { fail, uuid, positiveInt } from '../http.js';

// Uygulama içi ekran görüntüsü olayları. Görüntü gönderilmez; yalnızca zaman, ekran ve (varsa) oda / profil kaydedilir.
// Profil fotoğrafı ekranlarında ekran görüntüsü cihazda engellenir (Android FLAG_SECURE), o yüzden olay oluşmaz.
export const SCREENS = ['room', 'profile', 'chat', 'feed', 'messages', 'home', 'store', 'other'];

export const router = Router();
router.use(requireAuth);

router.post('/', userLimit('screenshot', 30, 3600e3), async (req, res) => {
  const b = req.body ?? {};
  const screen = SCREENS.includes(b.screen) ? b.screen : 'other';
  const roomId = b.roomId ? uuid(b.roomId, 'Oda') : null;
  const targetUserId = b.targetUserId ? uuid(b.targetUserId, 'Kullanıcı') : null;
  const platform = ['android', 'ios'].includes(b.platform) ? b.platform : null;
  const appVersion = typeof req.get('X-App-Version') === 'string' ? req.get('X-App-Version').slice(0, 20) : null;
  // Aynı ekranda art arda gelen olaylar (çoklu bildirim) 5 sn içinde tek sayılır.
  // Türler açık yazılır: aynı değişken hem SELECT listesinde hem karşılaştırmada geçince PostgreSQL türü çıkaramayıp
  // sorguyu reddediyordu ("inconsistent types deduced for parameter") ve bu uç her çağrıda "Sunucu hatası" veriyordu.
  await query(
    `INSERT INTO screenshot_events(user_id, screen, room_id, target_user_id, platform, app_version)
     SELECT $1::uuid, $2::text, (SELECT id FROM rooms WHERE id = $3::uuid), (SELECT id FROM users WHERE id = $4::uuid), $5::text, $6::text
     WHERE NOT EXISTS (SELECT 1 FROM screenshot_events WHERE user_id = $1::uuid AND screen = $2::text AND created_at > NOW() - INTERVAL '5 seconds')`,
    [req.user.id, screen, roomId, targetUserId, platform, appVersion],
  );
  res.json({ ok: true });
});

const person = (id, username, name) => (id ? { id, username, displayName: name } : null);

// Yönetim: son olaylar (kullanıcıya / hedefe göre süzülebilir).
export const adminRouter = Router();
adminRouter.use(requireAuth, requireStaff);
adminRouter.get('/', async (req, res) => {
  const limit = req.query.limit ? positiveInt(req.query.limit, 'Limit', 200) : 100;
  const userId = req.query.userId ? uuid(String(req.query.userId), 'Kullanıcı') : null;
  const targetId = req.query.targetUserId ? uuid(String(req.query.targetUserId), 'Kullanıcı') : null;
  const screen = req.query.screen ? String(req.query.screen) : null;
  if (screen && !SCREENS.includes(screen)) throw fail('Ekran geçersiz.');
  const r = await query(
    `SELECT e.id, e.screen, e.platform, e.app_version, e.created_at, e.room_id, r.name AS room_name, r.room_number,
        u.id AS u_id, u.username AS u_username, u.display_name AS u_name,
        t.id AS t_id, t.username AS t_username, t.display_name AS t_name
       FROM screenshot_events e
       JOIN users u ON u.id = e.user_id
       LEFT JOIN users t ON t.id = e.target_user_id
       LEFT JOIN rooms r ON r.id = e.room_id
      WHERE ($2::uuid IS NULL OR e.user_id = $2) AND ($3::uuid IS NULL OR e.target_user_id = $3) AND ($4::text IS NULL OR e.screen = $4)
      ORDER BY e.created_at DESC LIMIT $1`,
    [limit, userId, targetId, screen],
  );
  const today = (await query(`SELECT COUNT(*)::int AS n FROM screenshot_events WHERE created_at > NOW() - INTERVAL '24 hours'`)).rows[0].n;
  res.json({
    last24h: today,
    items: r.rows.map((x) => ({
      id: String(x.id), screen: x.screen, platform: x.platform, appVersion: x.app_version, createdAt: x.created_at,
      user: person(x.u_id, x.u_username, x.u_name),
      target: person(x.t_id, x.t_username, x.t_name),
      room: x.room_id ? { id: x.room_id, name: x.room_name, roomNumber: x.room_number } : null,
    })),
  });
});

/** 90 günden eski olayları siler. */
export async function pruneScreenshots() {
  await query(`DELETE FROM screenshot_events WHERE created_at < NOW() - INTERVAL '90 days'`);
}
