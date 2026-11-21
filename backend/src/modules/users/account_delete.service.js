// Hesap silme (kişinin kendisi Ayarlar'dan ya da yönetim, e-posta ile gelen talep / 18 yaş altı hesap gibi durumlarda).
// Kişisel bilgiler silinir veya anonim hâle getirilir; yasal saklama gereken kayıtlar (ödeme, işlem, güvenlik) kalır.
import { query, tx } from '../../infrastructure/database/database.js';
import { fail } from '../../shared/errors/http.js';
import { hub } from '../../infrastructure/websocket/realtime.js';
import { closeRoom, leaveRoom } from '../rooms/rooms.service.js';
import { forgetMedia } from '../media/images.service.js';
import { revokeAllSessions } from './sessions.service.js';

export async function deleteAccount(userId) {
  const owned = await query(`SELECT 1 FROM families WHERE owner_id = $1 AND is_active = TRUE`, [userId]);
  if (owned.rowCount) throw fail('Önce ailenin sahipliği devredilmeli veya aile dağıtılmalı.', 409);
  const agency = await query(`SELECT 1 FROM agencies WHERE owner_id = $1 AND status IN ('pending','active','suspended')`, [userId]);
  if (agency.rowCount) throw fail('Önce ajans sahipliği için destek ile iletişime geçin.', 409);
  // Açık odaları kapat, bulunduğu odalardan çıkar (ses/görüntü bağlantısı da kesilir).
  for (const r of (await query(`SELECT id FROM rooms WHERE owner_id = $1 AND is_active = TRUE`, [userId])).rows) {
    await closeRoom(r.id).catch((e) => console.error('Hesap silme oda kapatma:', e.message));
  }
  for (const r of (await query(`SELECT room_id FROM room_members WHERE user_id = $1`, [userId])).rows) {
    await leaveRoom(userId, r.room_id).catch(() => {});
  }
  await tx(async (c) => {
    // Kullanıcı adı tam kimlikten türetilir (8 karakterlik kısaltma çakışıp silmeyi engelleyebiliyordu).
    await c.query(
      `UPDATE users SET account_status = 'deleted', username = 'del_' || replace(id::text, '-', ''), display_name = 'Silinmiş Kullanıcı',
         password_hash = NULL, phone = NULL, avatar_url = NULL, cover_url = NULL, bio = NULL, birth_date = NULL, gender = NULL,
         country = NULL, city = NULL, is_hidden = FALSE, token_version = token_version + 1, updated_at = NOW() WHERE id = $1`,
      [userId],
    );
    await c.query(`DELETE FROM room_members WHERE user_id = $1`, [userId]);
    // Google/Facebook bağlantısı kaldırılır: aynı hesapla yeniden kayıt olunabilir.
    await c.query(`DELETE FROM user_identities WHERE user_id = $1`, [userId]);
    await c.query(`DELETE FROM family_members WHERE user_id = $1`, [userId]);
    await c.query(`DELETE FROM follows WHERE follower_id = $1 OR followed_id = $1`, [userId]);
    await c.query(`UPDATE broadcasters SET agency_id = NULL, status = 'suspended' WHERE user_id = $1`, [userId]);
    // Kişisel içerik: gönderiler yayından kaldırılır, yüklenen fotoğraflar veritabanından silinir.
    await c.query(`UPDATE posts SET is_removed = TRUE WHERE user_id = $1`, [userId]);
    const gone = await c.query(
      `DELETE FROM media_files WHERE created_by = $1 AND (kind = 'upload' OR meta->>'purpose' = 'avatar_animated') RETURNING id`,
      [userId],
    );
    for (const row of gone.rows) forgetMedia(row.id); // sunucu önbelleğinden de çıkar
  });
  await revokeAllSessions(userId, 'deleted');
  hub.disconnectUser(userId, 'deleted');
}
