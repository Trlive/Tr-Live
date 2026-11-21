import crypto from 'node:crypto';
import { query, tx } from '../../infrastructure/database/database.js';
import { fail } from '../../shared/errors/http.js';

/// Özellik bayrakları: bir özelliğin kimler için açık olduğunu sunucu söyler.
///
/// Staging kurmama kararının (ARCHITECTURE_AUDIT.md I-04) karşılığı budur: riskli bir özellik
/// önce %1 kullanıcıya açılır, sorun çıkmazsa %10, sonra herkese. Bir şey bozulursa panelden
/// sıfıra indirilir ve etki saniyeler içinde biter — yeni APK beklenmez, mağaza onayı beklenmez.

const TTL_MS = 10_000; // Bayraklar her istekte veritabanından okunmaz; 10 sn'lik önbellek yeter.
let cache = { at: 0, rows: [] };

export async function allFlags(force = false) {
  if (!force && Date.now() - cache.at < TTL_MS) return cache.rows;
  const r = await query(
    `SELECT key, description, enabled, rollout_percent, allow_user_ids, deny_user_ids,
            min_app_version, platforms, updated_at, updated_by
       FROM feature_flags ORDER BY key`,
  );
  cache = { at: Date.now(), rows: r.rows };
  return r.rows;
}

/** Panelden değişiklik yapıldığında önbellek beklenmeden tazelenir. */
export function invalidate() { cache = { at: 0, rows: [] }; }

/// Kullanıcıyı 0-99 arası bir kovaya yerleştirir.
///
/// Rastgele sayı KULLANILMAZ: aynı kullanıcı her istekte aynı kovaya düşmeli, yoksa özellik
/// ekran açılıp kapandıkça gelip gider ve kullanıcı "bazen çalışıyor" der. Karma, bayrak
/// anahtarıyla birlikte alınır; böylece %10'luk iki ayrı bayrak aynı kullanıcı grubuna denk gelmez.
export function bucketOf(userId, key) {
  const h = crypto.createHash('sha256').update(`${key}:${userId}`).digest();
  return h.readUInt32BE(0) % 100;
}

const verNum = (v) => String(v || '').split('.').map((x) => Number.parseInt(x, 10) || 0);
function versionAtLeast(have, want) {
  if (!want) return true;
  const a = verNum(have), b = verNum(want);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0, y = b[i] || 0;
    if (x !== y) return x > y;
  }
  return true;
}

/// Tek bayrağın bir kullanıcı için değeri.
export function evaluate(flag, { userId, appVersion, platform } = {}) {
  if (!flag) return false;
  // Yasaklı liste her şeyin önünde: bir kullanıcıda sorun çıkarsa yüzdeyi düşürmeden o kullanıcı kapatılır.
  if (userId && (flag.deny_user_ids || []).includes(userId)) return false;
  if (userId && (flag.allow_user_ids || []).includes(userId)) return true;
  if (!flag.enabled) return false;
  if (!versionAtLeast(appVersion, flag.min_app_version)) return false;
  const plats = flag.platforms || [];
  if (plats.length && platform && !plats.includes(platform)) return false;
  const pct = flag.rollout_percent ?? 0;
  if (pct >= 100) return true;
  if (pct <= 0) return false;
  // Girişsiz kullanıcı: kimlik yok, kova hesaplanamaz. Kademeli açılan özellik kapalı sayılır
  // (yanlışlıkla açmaktansa kapalı kalsın).
  if (!userId) return false;
  return bucketOf(userId, flag.key) < pct;
}

/// Uygulamaya gidecek harita: { anahtar: true/false }.
export async function flagsFor(ctx = {}) {
  const rows = await allFlags();
  const out = {};
  for (const f of rows) out[f.key] = evaluate(f, ctx);
  return out;
}

const FIELDS = ['description', 'enabled', 'rollout_percent', 'allow_user_ids', 'deny_user_ids', 'min_app_version', 'platforms'];

/// Panelden bayrak oluşturma/güncelleme. Her değişiklik önce/sonra değeriyle kaydedilir.
export async function upsertFlag(key, patch, adminId) {
  if (!/^[a-z][a-z0-9_]{2,48}$/.test(String(key || ''))) throw fail('Bayrak anahtarı geçersiz (küçük harf, alt çizgi).');
  const pct = patch.rollout_percent;
  if (pct !== undefined && (!Number.isInteger(pct) || pct < 0 || pct > 100)) throw fail('Oran 0-100 arası tam sayı olmalı.');
  if (patch.platforms !== undefined) {
    const ok = Array.isArray(patch.platforms) && patch.platforms.every((p) => p === 'android' || p === 'ios');
    if (!ok) throw fail('Platform yalnızca android/ios olabilir.');
  }
  for (const k of ['allow_user_ids', 'deny_user_ids']) {
    if (patch[k] === undefined) continue;
    const ok = Array.isArray(patch[k]) && patch[k].every((v) => /^[0-9a-f-]{36}$/i.test(String(v)));
    if (!ok) throw fail('Kullanıcı listesinde geçersiz kimlik var.');
  }

  const row = await tx(async (c) => {
    const prev = (await c.query(`SELECT * FROM feature_flags WHERE key = $1 FOR UPDATE`, [key])).rows[0] || null;
    const sets = [], vals = [key];
    for (const f of FIELDS) {
      if (patch[f] === undefined) continue;
      vals.push(patch[f]);
      sets.push(`${f} = $${vals.length}`);
    }
    let out;
    if (prev) {
      if (!sets.length) return prev;
      sets.push(`updated_at = NOW()`);
      vals.push(adminId || null);
      sets.push(`updated_by = $${vals.length}`);
      out = (await c.query(`UPDATE feature_flags SET ${sets.join(', ')} WHERE key = $1 RETURNING *`, vals)).rows[0];
    } else {
      out = (await c.query(
        `INSERT INTO feature_flags(key, description, enabled, rollout_percent, allow_user_ids, deny_user_ids, min_app_version, platforms, updated_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [key, patch.description ?? '', patch.enabled ?? false, patch.rollout_percent ?? 0,
         patch.allow_user_ids ?? [], patch.deny_user_ids ?? [], patch.min_app_version ?? '', patch.platforms ?? [], adminId || null],
      )).rows[0];
    }
    await c.query(
      `INSERT INTO feature_flag_audit(key, admin_id, action, before, after) VALUES($1,$2,$3,$4,$5)`,
      [key, adminId || null, prev ? 'update' : 'create', prev ? JSON.stringify(prev) : null, JSON.stringify(out)],
    );
    return out;
  });
  invalidate();
  return row;
}

export async function flagAudit(key, limit = 50) {
  const r = await query(
    `SELECT a.id, a.key, a.action, a.before, a.after, a.created_at, u.display_name AS admin_name
       FROM feature_flag_audit a LEFT JOIN users u ON u.id = a.admin_id
      ${key ? 'WHERE a.key = $1' : ''}
      ORDER BY a.id DESC LIMIT ${Number(limit) || 50}`,
    key ? [key] : [],
  );
  return r.rows;
}
