// Gizlilik ayarlarının WIP ayrıcalığına bağlı olması (Ayarlar → Gizlilik).
// Ayar açılırken ayrıcalık PATCH /api/me'de denetlenir; üyelik bitince / kademe düşünce bu temizlik ayarı kapatır.
import { query } from '../database.js';
import { refreshGhost } from './ghost.js';
import { announceUserChange } from './users.js';

// Ayar → gereken ayrıcalık: isHidden → hiddenUser, showPresence=false → hideOnline, hideCountry → hideCountry,
// hideVisits → invisibleVisit. Yöneticiler (admin) her zaman kullanabilir.
const has = (feature) => `(u.system_role = 'admin' OR EXISTS (
  SELECT 1 FROM user_wip uw JOIN wip_tiers wt ON wt.level = uw.level
  WHERE uw.user_id = u.id AND uw.is_active = TRUE AND uw.expires_at > NOW() AND COALESCE((wt.features->>'${feature}')::boolean, FALSE)))`;

/** Ayrıcalığı kalmayan kişilerin gizlilik ayarlarını kapatır; görünürlükleri hemen güncellenir. */
export async function sweepPrivacy(run = query) {
  const r = await run(
    `UPDATE users u SET
       is_hidden = u.is_hidden AND ${has('hiddenUser')},
       show_presence = (u.show_presence IS NOT FALSE) OR NOT ${has('hideOnline')},
       hide_country = u.hide_country AND ${has('hideCountry')},
       updated_at = NOW()
     WHERE (u.is_hidden AND NOT ${has('hiddenUser')})
        OR (u.show_presence = FALSE AND NOT ${has('hideOnline')})
        OR (u.hide_country AND NOT ${has('hideCountry')})
     RETURNING u.id`,
  );
  for (const { id } of r.rows) {
    await refreshGhost(id);
    announceUserChange(id);
  }
  return r.rowCount;
}

/**
 * Saklama süresi dolan teknik kayıtları siler (Gizlilik Politikası → Saklama süreleri): 2 yılı geçen güvenlik/giriş
 * olayları ve 2 yıldan uzun süre önce kapanmış ya da süresi dolmuş oturum kayıtları (IP, cihaz bilgisi).
 */
export async function purgeExpiredRecords(run = query) {
  const ev = await run(`DELETE FROM security_events WHERE created_at < NOW() - INTERVAL '2 years'`);
  const ss = await run(
    `DELETE FROM user_sessions WHERE COALESCE(revoked_at, expires_at) < NOW() - INTERVAL '2 years'`,
  );
  return ev.rowCount + ss.rowCount;
}

/** Açılışta ve 5 dakikada bir (eski kayıt temizliği günde bir). */
export function startPrivacySweeper() {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const n = await sweepPrivacy();
      if (n) console.log(`[gizlilik] ayrıcalığı biten ${n} kişinin gizlilik ayarı kapatıldı.`);
    } catch (e) {
      console.error('[gizlilik] temizlik:', e.message);
    } finally {
      busy = false;
    }
  };
  let lastPurge = 0;
  const purge = async () => {
    if (Date.now() - lastPurge < 24 * 3600e3) return;
    lastPurge = Date.now();
    try {
      const n = await purgeExpiredRecords();
      if (n) console.log(`[gizlilik] saklama süresi dolan ${n} kayıt silindi.`);
    } catch (e) {
      console.error('[gizlilik] eski kayıt temizliği:', e.message);
    }
  };
  setTimeout(() => { tick(); purge(); }, 5000).unref();
  const t = setInterval(() => { tick(); purge(); }, 5 * 60e3);
  t.unref();
  return t;
}
