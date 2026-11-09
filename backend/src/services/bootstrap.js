import { query, tx } from '../database.js';
import { bootstrapDecision } from '../staff_logic.js';
import { logSecurityEvent } from '../firewall.js';

// İlk kurulum / veritabanı taşıma kolaylığı: ADMIN_USERNAMES ortam değişkenindeki kullanıcı adları (virgülle ayrılmış)
// yönetici yapılır. Yalnızca sunucu sahibi (sunucu paneli / ortam değişkenleri) ayarlayabilir; listeden çıkarmak yetkiyi
// geri almaz. Güvenlik (v2.92): ad yalnızca bir kez, o anda zaten var olan hesaba yetki verir (bootstrap_admins).
const names = () => [...new Set(String(process.env.ADMIN_USERNAMES || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))];

/**
 * username verilirse (kayıt anı): yalnızca sistemde HİÇ aktif yönetici yokken (ilk kurulum) ve ad listedeyse yönetici
 * yapar. Verilmezse (sunucu açılışı): listedeki adlara sahip, ad listeye eklenmeden önce açılmış hesaplar.
 * Yönetici yapılan varsa true.
 */
export async function promoteBootstrapAdmins(username) {
  const list = names();
  if (!list.length) return false;
  if (username !== undefined) return promoteOnRegister(String(username).toLowerCase(), list);
  return promoteListed(list);
}

async function promoteOnRegister(name, list) {
  if (!list.includes(name)) return false;
  // Yönetici varken kayıtla kimse yönetici olmaz: silinen ya da adı değişen yöneticinin eski adını alan biri,
  // ya da listede olup henüz açılmamış adı kapan biri yönetici olamasın.
  const r = await query(
    `UPDATE users SET system_role = 'admin', updated_at = NOW()
     WHERE lower(username) = $1 AND account_status = 'active' AND system_role <> 'admin'
       AND NOT EXISTS (SELECT 1 FROM users WHERE system_role = 'admin' AND account_status = 'active')
       AND NOT EXISTS (SELECT 1 FROM bootstrap_admins g WHERE g.username = $1 AND g.user_id IS NOT NULL AND g.user_id <> users.id)
     RETURNING id, username`,
    [name],
  );
  if (!r.rowCount) return false;
  await query(
    `INSERT INTO bootstrap_admins(username, user_id, granted_at) VALUES($1,$2,NOW())
     ON CONFLICT (username) DO UPDATE SET user_id = EXCLUDED.user_id, granted_at = NOW()`,
    [name, r.rows[0].id],
  );
  console.log(`Yönetici yapıldı (ADMIN_USERNAMES, ilk kurulum): ${r.rows[0].username}`);
  return true;
}

async function promoteListed(list) {
  // Listeden çıkarılan, hiç yetki vermemiş ve şu an kimsenin kullanmadığı adların kaydı silinir (yeniden eklenince "ilk
  // görülme" baştan başlar). Adı bir hesap tutuyorsa kayıt kalır: adı kapan kişi listeden çıkar-ekle ile yönetici olamaz.
  await query(
    `DELETE FROM bootstrap_admins b WHERE b.user_id IS NULL AND NOT (b.username = ANY($1::text[]))
       AND NOT EXISTS (SELECT 1 FROM users u WHERE lower(u.username) = b.username)`,
    [list],
  );
  // Listedeki her adın ilk görüldüğü an (yalnızca ilk kez).
  await query(`INSERT INTO bootstrap_admins(username) SELECT unnest($1::text[]) ON CONFLICT (username) DO NOTHING`, [list]);
  const rows = (await query(
    `SELECT b.username AS listed, b.user_id AS granted_to, b.first_listed_at, u.id, u.username, u.system_role, u.created_at
     FROM bootstrap_admins b JOIN users u ON lower(u.username) = b.username AND u.account_status = 'active'
     WHERE b.username = ANY($1::text[])`,
    [list],
  )).rows;
  let promoted = false;
  for (const x of rows) {
    const decision = bootstrapDecision({ grantedTo: x.granted_to, accountId: x.id, accountCreatedAt: x.created_at, firstListedAt: x.first_listed_at });
    if (decision !== 'grant') {
      if (x.system_role !== 'admin') {
        const why = decision === 'other'
          ? 'bu ad daha önce başka bir hesaba yönetici yetkisi verdi'
          : 'hesap, ad listeye eklendikten sonra açılmış';
        console.warn(`[güvenlik] ADMIN_USERNAMES: "${x.username}" yönetici yapılmadı (${why}).`);
        logSecurityEvent('bootstrap_admin_refused', null, x.id, { username: x.username, reason: decision });
      }
      continue;
    }
    const changed = await tx(async (c) => {
      await c.query(`UPDATE bootstrap_admins SET user_id = $2, granted_at = COALESCE(granted_at, NOW()) WHERE username = $1`, [x.listed, x.id]);
      const u = await c.query(
        `UPDATE users SET system_role = 'admin', updated_at = NOW() WHERE id = $1 AND system_role <> 'admin' AND account_status = 'active' RETURNING username`,
        [x.id],
      );
      return u.rowCount > 0;
    });
    if (changed) {
      promoted = true;
      console.log(`Yönetici yapıldı (ADMIN_USERNAMES): ${x.username}`);
    }
  }
  return promoted;
}
