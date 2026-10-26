// Maaş seviyesi ödülleri (VIP günü, yayıncı rozeti, özel ID) ve özel ID yardımcıları.
import { query } from '../database.js';
import { BADGES, badgeRank, prettyIdCandidate } from '../paytable.js';

const BADGE_DAYS = 35; // bir sonraki dönem kapanana kadar görünür

/** Kullanıcının etkin özel ID'si ve rozeti (profil / liste görünümü). */
export async function userMarks(userId, run = query) {
  const r = await run(
    `SELECT (SELECT special_id FROM special_ids WHERE user_id = $1 AND expires_at > NOW()) AS special_id,
            (SELECT expires_at FROM special_ids WHERE user_id = $1 AND expires_at > NOW()) AS special_until,
            (SELECT badge FROM host_badges WHERE user_id = $1 AND expires_at > NOW()) AS badge,
            (SELECT expires_at FROM host_badges WHERE user_id = $1 AND expires_at > NOW()) AS badge_until`,
    [userId],
  );
  return r.rows[0];
}

/** Yeni ya da var olan özel ID'nin süresini uzatır. value verilirse o numara atanır (yönetim). Dönüş: numara. */
export async function grantSpecialId(c, userId, days, { value = null, source = 'salary' } = {}) {
  const cur = (await c.query(`SELECT special_id, expires_at FROM special_ids WHERE user_id = $1 FOR UPDATE`, [userId])).rows[0];
  if (value) {
    // Başka birinin süresi bitmiş kaydı numarayı tutuyorsa serbest bırakılır; etkin ise hata.
    const holder = (await c.query(`SELECT user_id, expires_at FROM special_ids WHERE special_id = $1 FOR UPDATE`, [value])).rows[0];
    if (holder && holder.user_id !== userId) {
      if (new Date(holder.expires_at) > new Date()) throw Object.assign(new Error('Bu özel ID başka bir kullanıcıda.'), { status: 409 });
      await c.query(`DELETE FROM special_ids WHERE user_id = $1`, [holder.user_id]);
    }
    const r = await c.query(
      `INSERT INTO special_ids(user_id, special_id, expires_at, source) VALUES($1, $2, NOW() + ($3::int * INTERVAL '1 day'), $4)
       ON CONFLICT (user_id) DO UPDATE SET special_id = EXCLUDED.special_id,
         expires_at = CASE WHEN special_ids.special_id = EXCLUDED.special_id AND special_ids.expires_at > NOW()
                           THEN special_ids.expires_at + ($3::int * INTERVAL '1 day') ELSE EXCLUDED.expires_at END,
         source = EXCLUDED.source, updated_at = NOW()
       RETURNING special_id, expires_at`,
      [userId, value, days, source],
    );
    return r.rows[0];
  }
  if (cur) {
    const r = await c.query(
      `UPDATE special_ids SET expires_at = GREATEST(expires_at, NOW()) + ($2::int * INTERVAL '1 day'), updated_at = NOW()
       WHERE user_id = $1 RETURNING special_id, expires_at`,
      [userId, days],
    );
    return r.rows[0];
  }
  for (let i = 0; i < 40; i += 1) {
    const cand = prettyIdCandidate();
    const r = await c.query(
      `INSERT INTO special_ids(user_id, special_id, expires_at, source) VALUES($1, $2, NOW() + ($3::int * INTERVAL '1 day'), $4)
       ON CONFLICT DO NOTHING RETURNING special_id, expires_at`,
      [userId, cand, days, source],
    );
    if (r.rows[0]) return r.rows[0];
  }
  return null;
}

/** Rozet: daha yüksek etkin rozet varsa korunur; aynı rozet ise süresi yenilenir. */
export async function grantBadge(c, userId, badge, days = BADGE_DAYS, source = 'salary') {
  if (!BADGES.includes(badge)) return null;
  const cur = (await c.query(`SELECT badge, expires_at FROM host_badges WHERE user_id = $1 FOR UPDATE`, [userId])).rows[0];
  const active = cur && new Date(cur.expires_at) > new Date();
  if (active && badgeRank(cur.badge) > badgeRank(badge)) return { badge: cur.badge, kept: true };
  await c.query(
    `INSERT INTO host_badges(user_id, badge, expires_at, source) VALUES($1, $2, NOW() + ($3::int * INTERVAL '1 day'), $4)
     ON CONFLICT (user_id) DO UPDATE SET badge = EXCLUDED.badge,
       expires_at = GREATEST(CASE WHEN host_badges.badge = EXCLUDED.badge THEN host_badges.expires_at ELSE NOW() END, EXCLUDED.expires_at),
       source = EXCLUDED.source, updated_at = NOW()`,
    [userId, badge, days, source],
  );
  return { badge };
}

/** VIP (WIP) günü: daha yüksek etkin üyelik varsa dokunulmaz; aynı seviye ise süre uzar; değilse yeni seviye başlar. */
export async function grantWip(c, userId, level, days) {
  const cur = (await c.query(`SELECT level, expires_at, is_active FROM user_wip WHERE user_id = $1 FOR UPDATE`, [userId])).rows[0];
  const active = cur && cur.is_active && new Date(cur.expires_at) > new Date();
  if (active && cur.level > level) return { level: cur.level, skipped: true };
  if (active && cur.level === level) {
    await c.query(`UPDATE user_wip SET expires_at = expires_at + ($2::int * INTERVAL '1 day') WHERE user_id = $1`, [userId, days]);
    return { level, extended: true };
  }
  await c.query(
    `INSERT INTO user_wip(user_id, level, starts_at, expires_at, is_active) VALUES($1, $2, NOW(), NOW() + ($3::int * INTERVAL '1 day'), TRUE)
     ON CONFLICT (user_id) DO UPDATE SET level = EXCLUDED.level, starts_at = EXCLUDED.starts_at, expires_at = EXCLUDED.expires_at, is_active = TRUE`,
    [userId, level, days],
  );
  return { level };
}

/** Dönem kapanışında seviyenin ödülleri (transaction içinde). Dönüş: özet (hesap özetine yazılır). */
export async function grantLevelRewards(c, userId, level) {
  const out = {};
  if (!level) return out;
  if (level.vipLevel && level.vipDays > 0) {
    const r = await grantWip(c, userId, level.vipLevel, level.vipDays);
    out.vip = { level: level.vipLevel, days: level.vipDays, ...(r.skipped ? { skipped: true } : {}) };
  }
  if (level.badge) {
    const r = await grantBadge(c, userId, level.badge);
    if (r) out.badge = { badge: level.badge, ...(r.kept ? { kept: r.badge } : {}) };
  }
  if (level.specialIdDays > 0) {
    const days = level.specialIdDays * Math.max(1, level.specialIdCount ?? 1);
    const r = await grantSpecialId(c, userId, days);
    if (r) out.specialId = { id: r.special_id, days };
  }
  return out;
}
