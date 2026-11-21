import { query, tx } from '../../infrastructure/database/database.js';
import { fail } from '../../shared/errors/http.js';
import { suspendUser } from '../users/ban.service.js';

/// Moderasyon kuyruğu: tek ekranda, aciliyet sırasına göre.
///
/// ## Niçin kullanıcıya göre gruplanıyor
///
/// Şikâyetler tek tek listelenseydi, aynı kişiyle ilgili sekiz şikâyet sekiz ayrı satır olurdu ve
/// moderatör sekiz kez aynı kararı verirdi. Oysa karar kişi hakkındadır. Gruplayınca moderatör
/// bir kez bakıp bir kez karar veriyor; sekiz şikâyet birlikte kapanıyor.
///
/// ## Risk puanı — en önemli ayrım: kaç KİŞİ şikâyet etti
///
/// Beş ayrı kullanıcının bir kez şikâyet etmesi ile bir kullanıcının beş kez şikâyet etmesi aynı
/// şey değildir. İkincisi genellikle husumettir. Bu yüzden puanda **ayrı şikâyetçi sayısı**
/// ağırlıklı; toplam şikâyet sayısı değil.
///
/// Bu ayrım olmasaydı, bir kişiyi hedef alan organize şikâyet kampanyası onu kuyruğun tepesine
/// çıkarır ve masum kullanıcı cezalandırılırdı.
///
/// Puan bileşenleri:
/// * ayrı şikâyetçi sayısı × 10 — asıl sinyal
/// * otomatik ihlal (link/telefon filtresi) × 3 — makine kararı, insan kararından hafif
/// * ağır nedenler (taciz, müstehcen, çocuk güvenliği) × 25 — beklemesi en pahalı olanlar
/// * en eski açık şikâyetin yaşı (saat) × 0,5 — hiçbir şikâyet kuyrukta unutulmasın

/// Beklemesi en pahalı nedenler. Bunlarda tek şikâyet bile tepeye çıkar.
const SEVERE = ['child_safety', 'sexual', 'harassment', 'violence', 'self_harm'];

const QUEUE_SQL = `
  WITH open_reports AS (
    SELECT target_user_id AS uid,
           COUNT(*)::int                           AS reports,
           COUNT(DISTINCT reporter_id)::int        AS reporters,
           COUNT(*) FILTER (WHERE reason = ANY($1::text[]))::int AS severe,
           MIN(created_at)                         AS oldest,
           MAX(created_at)                         AS newest,
           (ARRAY_AGG(reason ORDER BY created_at DESC))[1] AS last_reason
      FROM reports
     WHERE status = 'open' AND target_user_id IS NOT NULL
     GROUP BY target_user_id
  ),
  strikes AS (
    SELECT user_id AS uid, COUNT(*)::int AS n
      FROM moderation_strikes
     WHERE created_at > NOW() - INTERVAL '7 days'
     GROUP BY user_id
  )
  SELECT u.id, u.display_name, u.username, u.avatar_url, u.banned_until, u.account_status,
         r.reports, r.reporters, r.severe, r.oldest, r.newest, r.last_reason,
         COALESCE(s.n, 0) AS strikes,
         (
           r.reporters * 10
           + COALESCE(s.n, 0) * 3
           + r.severe * 25
           + LEAST(EXTRACT(EPOCH FROM (NOW() - r.oldest)) / 3600 * 0.5, 100)
         )::numeric(10,1) AS score
    FROM open_reports r
    JOIN users u ON u.id = r.uid
    LEFT JOIN strikes s ON s.uid = r.uid
   ORDER BY score DESC, r.oldest
   LIMIT $2
`;

export async function queue({ limit = 100 } = {}) {
  const r = await query(QUEUE_SQL, [SEVERE, Math.max(1, Math.min(300, limit))]);
  return r.rows.map((x) => ({
    userId: x.id,
    displayName: x.display_name,
    username: x.username,
    avatarUrl: x.avatar_url,
    // Süresiz ban'da banned_until null olur; o yüzden hesap durumuna da bakılır.
    banned: x.account_status === 'banned',
    bannedUntil: x.banned_until,
    reports: x.reports,
    reporters: x.reporters,
    severe: x.severe,
    strikes: x.strikes,
    lastReason: x.last_reason,
    oldest: x.oldest,
    newest: x.newest,
    score: Number(x.score),
  }));
}

/// Bir kullanıcının dosyası: açık şikâyetler (kanıtlarıyla), otomatik ihlaller, geçmiş aksiyonlar.
///
/// Moderatör karar vermeden önce buna bakar. Kanıt burada gösterilir — mesaj silinmiş olsa bile,
/// çünkü şikâyet anında kopyası alınmıştır.
export async function dossier(userId) {
  const [reports, strikes, actions, user] = await Promise.all([
    query(
      `SELECT r.id, r.kind, r.reason, r.details, r.evidence, r.created_at, r.room_id, r.message_id,
              rep.display_name AS reporter_name
         FROM reports r LEFT JOIN users rep ON rep.id = r.reporter_id
        WHERE r.target_user_id = $1 AND r.status = 'open'
        ORDER BY r.created_at DESC LIMIT 100`, [userId]),
    query(
      `SELECT kind, context, sample, created_at FROM moderation_strikes
        WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, [userId]),
    query(
      `SELECT a.action, a.reason, a.reports_closed, a.created_at, m.display_name AS moderator_name
         FROM moderation_actions a LEFT JOIN users m ON m.id = a.moderator_id
        WHERE a.target_user_id = $1 ORDER BY a.id DESC LIMIT 50`, [userId]),
    query(`SELECT id, display_name, username, avatar_url, account_status, banned_until, ban_reason,
                  chat_restricted_until, created_at FROM users WHERE id = $1`, [userId]),
  ]);
  if (!user.rowCount) throw fail('Kullanıcı bulunamadı.', 404);
  return { user: user.rows[0], reports: reports.rows, strikes: strikes.rows, actions: actions.rows };
}

const ACTIONS = ['dismiss', 'warn', 'mute', 'room_ban', 'suspend', 'delete_messages'];

/**
 * Karar uygular: aksiyonu çalıştırır, **o kullanıcıyla ilgili bütün açık şikâyetleri kapatır**
 * ve kaydı yazar. Hepsi tek transaction içinde.
 *
 * Şikâyetleri birlikte kapatmak bilinçli: karar kişi hakkında verilir. Tek tek kapatmak
 * moderatörü aynı kararı tekrar tekrar verdirir ve bir şikâyeti unutması kaçınılmaz olur.
 *
 * `dismiss` de bir karardır ve kaydedilir: "bakıldı, sorun yok" bilgisi, aynı kişi tekrar
 * şikâyet edildiğinde moderatöre bağlam verir.
 */
export async function act({ moderatorId, moderatorRole = 'admin', targetUserId, action, reason = '', days = 0, roomId = null }) {
  if (!ACTIONS.includes(action)) throw fail('Bilinmeyen moderasyon işlemi.');
  const note = String(reason || '').slice(0, 300);
  if (action !== 'dismiss' && !note) throw fail('Gerekçe yazın — karar sonradan denetlenebilmeli.');

  // Askıya alma, oturum iptali ve oda kapatma gibi commit sonrası yan etkiler gerektirir:
  // yönetim panelindeki ban ile AYNI servisten geçer, ikinci bir kopya çıkmasın.
  if (action === 'suspend') {
    const d = Math.max(1, Math.min(3650, Number(days) || 1));
    await suspendUser({
      userId: targetUserId, byUserId: moderatorId, byRole: moderatorRole,
      until: new Date(Date.now() + d * 86400e3), reason: note, auditAction: 'moderation_suspend',
    });
  }

  return tx(async (c) => {
    const detail = { days, roomId };

    switch (action) {
      case 'suspend':
        // Askıya alma transaction'ın DIŞINDA, ortak servisle yapılır (aşağıya bakın):
        // oturum iptali ve oda kapatma gibi yan etkiler commit sonrası olmalı.
        detail.days = Math.max(1, Math.min(3650, Number(days) || 1));
        break;
      case 'room_ban': {
        if (!roomId) throw fail('Oda seçilmedi.');
        await c.query(
          `INSERT INTO room_bans(room_id, user_id, banned_by, reason) VALUES($1,$2,$3,$4)
           ON CONFLICT DO NOTHING`,
          [roomId, targetUserId, moderatorId, note],
        );
        break;
      }
      case 'delete_messages': {
        // Yalnızca ŞİKÂYET EDİLEN mesajlar silinir, kullanıcının tüm geçmişi değil.
        // Kanıt kopyası `reports.evidence` içinde durduğu için silme, denetimi engellemez.
        const r = await c.query(
          `UPDATE room_messages SET deleted = true
            WHERE id IN (SELECT message_id FROM reports
                          WHERE target_user_id = $1 AND status = 'open' AND message_id IS NOT NULL)
            RETURNING id`,
          [targetUserId],
        );
        detail.deleted = r.rowCount;
        break;
      }
      case 'mute': {
        // Sohbet kısıtı mevcut alan üzerinden: uygulamadaki otomatik susturma da aynı alanı
        // kullanıyor, ikinci bir mekanizma kurmak iki ayrı "susturuldu" durumu yaratırdı.
        const mins = Math.max(1, Math.min(10080, Number(days) || 60));
        await c.query(
          `UPDATE users SET chat_restricted_until =
             GREATEST(COALESCE(chat_restricted_until, NOW()), NOW() + make_interval(mins => $2::int))
            WHERE id = $1`, [targetUserId, mins]);
        await c.query(
          `INSERT INTO moderation_strikes(user_id, kind, context, sample) VALUES($1,'mute','moderator',$2)`,
          [targetUserId, note.slice(0, 300)]);
        detail.minutes = mins;
        break;
      }
      default:
        break; // dismiss / warn: kayıt dışında bir şey yapılmaz
    }

    const closed = await c.query(
      `UPDATE reports SET status = $3, resolved_by = $2, resolved_note = $4, resolved_at = NOW(), action = $5
        WHERE target_user_id = $1 AND status = 'open' RETURNING id`,
      [targetUserId, moderatorId, action === 'dismiss' ? 'dismissed' : 'resolved', note, action],
    );

    await c.query(
      `INSERT INTO moderation_actions(moderator_id, target_user_id, action, reason, reports_closed, detail)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [moderatorId, targetUserId, action, note, closed.rowCount, JSON.stringify(detail)],
    );

    return { action, reportsClosed: closed.rowCount, detail };
  });
}

/// Kuyruk özeti: panel başlığındaki sayaç ve "en eski bekleyen" uyarısı.
export async function summary() {
  const r = await query(
    `SELECT COUNT(*)::int AS open,
            COUNT(DISTINCT target_user_id)::int AS users,
            COUNT(*) FILTER (WHERE reason = ANY($1::text[]))::int AS severe,
            MIN(created_at) AS oldest
       FROM reports WHERE status = 'open'`,
    [SEVERE],
  );
  return r.rows[0];
}
