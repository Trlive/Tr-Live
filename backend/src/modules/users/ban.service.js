import { query, tx } from '../../infrastructure/database/database.js';
import { auditStaff } from '../admin/admin.shared.js';
import { revokeAllSessions } from './sessions.service.js';
import { hub } from '../../infrastructure/websocket/realtime.js';
import { closeRoom, leaveRoom } from '../rooms/rooms.service.js';

/// Hesap askıya alma — **tek uygulama**.
///
/// ## Niçin ayrı servis
///
/// Bu mantık yönetim rotasının içinde gömülüydü. Moderasyon kuyruğu da askıya alma yapacağı için
/// ikinci bir kopya çıkacaktı — ve kopyalar birbirinden ayrı düşer. Burada ayrı düşmenin bedeli
/// somut: bir yol oturumları iptal etmeyi unutursa, **askıya alınan kullanıcı uygulamada açık
/// kalmaya devam eder**; odadan atılmazsa konuşmaya devam eder. Yani ceza uygulanmamış olur.
///
/// Modül standardımız da bunu yasaklıyor: *"aynı iş mantığının farklı modüllerde kopyalanması"*.
///
/// ## Sıra önemli
///
/// Veritabanı değişikliği transaction içinde; yan etkiler (oturum iptali, bağlantı kesme, oda
/// kapatma) **commit'ten sonra**. Tersi olsaydı, transaction geri alındığında kullanıcı atılmış
/// ama ceza kaydı yazılmamış olurdu.

/**
 * @param {object} o
 * @param {string} o.userId        askıya alınan
 * @param {string} o.byUserId      işlemi yapan yönetici/moderatör
 * @param {string} o.byRole        yapanın rolü (denetim kaydı için)
 * @param {Date|null} o.until      bitiş; null = süresiz
 * @param {string} o.reason        gerekçe
 * @param {string} o.auditAction   denetim kaydındaki işlem adı
 * @param {Function} [o.lock]      ban durumunu kilitleyen işlev (yetki yarışını önler)
 */
export async function suspendUser({ userId, byUserId, byRole, until, reason, auditAction = 'account_ban', lock = null }) {
  await tx(async (c) => {
    if (lock) await lock(c);
    await c.query(
      `UPDATE users SET account_status = 'banned', banned_until = $2, ban_reason = $3, banned_by = $4,
              token_version = token_version + 1, updated_at = NOW()
        WHERE id = $1`,
      [userId, until, reason, byUserId],
    );
    await auditStaff(c, byUserId, userId, auditAction, { until, reason, by: byRole });
  });

  // --- Commit sonrası yan etkiler ---
  //
  // Her biri ayrı ayrı korunuyor: biri başarısız olursa diğerleri yine çalışsın. Oda kapatma
  // hatası yüzünden oturumların iptal edilmemesi, cezanın yarım uygulanması olurdu.
  await revokeAllSessions(userId, 'banned').catch((e) => console.error('Ban: oturum iptali:', e.message));
  try {
    hub.disconnectUser(userId, 'banned');
  } catch (e) {
    console.error('Ban: bağlantı kesme:', e.message);
  }

  // Sahibi olduğu açık odalar kapanır (içeride yardımcı sahip olsa da).
  for (const r of (await query(`SELECT id FROM rooms WHERE owner_id = $1 AND is_active = TRUE`, [userId])).rows) {
    await closeRoom(r.id).catch((e) => console.error('Ban sonrası oda kapatma:', e.message));
  }
  // Üye olduğu odalardan çıkarılır; ses/görüntü bağlantısı da kesilir.
  for (const r of (await query(`SELECT room_id FROM room_members WHERE user_id = $1`, [userId])).rows) {
    await leaveRoom(userId, r.room_id).catch((e) => console.error('Ban sonrası odadan çıkarma:', e.message));
  }
}
