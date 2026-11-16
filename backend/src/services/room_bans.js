import { query } from '../database.js';

/** Odadan atılan kişi bu kadar saat aynı odaya giremez. */
export const KICK_BAN_HOURS = 24;

/** Yönetici kayıtlarında tutulan en fazla satır (kalıcı oda başına). */
const LOG_KEEP = 500;

// Yasak ve yönetici kayıtları "kalıcı oda"ya (sahip + oda türü) bağlıdır: oda her açılışta yeni kimlik alır; yasak ise
// oda kapatılıp açılınca da sürmelidir. `room`: rooms satırı (owner_id, room_type, id).

/**
 * Yasak koyar. kind 'kick' → KICK_BAN_HOURS saat, 'block' → süresiz. Süresiz engel, sonradan gelen bir atılmayla
 * kısaltılmaz (engel kalır). Dönen değer: yazılan kayıt ya da (süresiz engel korunduysa) null.
 */
export async function banFromRoom(room, userId, kind, bannedBy, run = query) {
  const hours = kind === 'kick' ? KICK_BAN_HOURS : null;
  const r = await run(
    `INSERT INTO room_bans(owner_id, room_type, user_id, kind, banned_by, until)
     VALUES($1, $2, $3, $4, $5, CASE WHEN $6::int IS NULL THEN NULL ELSE NOW() + ($6::int * INTERVAL '1 hour') END)
     ON CONFLICT (owner_id, room_type, user_id) DO UPDATE
       SET kind = EXCLUDED.kind, banned_by = EXCLUDED.banned_by, until = EXCLUDED.until, created_at = NOW()
       WHERE EXCLUDED.kind = 'block' OR room_bans.until IS NOT NULL
     RETURNING kind, until`,
    [room.owner_id, room.room_type, userId, kind, bannedBy, hours],
  );
  return r.rows[0] ?? null;
}

/** Süren yasak (yoksa null). minutes_left: süreli yasakta kalan dakika. */
export async function activeBan(room, userId, run = query) {
  const r = await run(
    `SELECT kind, banned_by, until, created_at,
            CASE WHEN until IS NULL THEN NULL ELSE GREATEST(1, CEIL(EXTRACT(EPOCH FROM (until - NOW())) / 60))::int END AS minutes_left
     FROM room_bans WHERE owner_id = $1 AND room_type = $2 AND user_id = $3 AND (until IS NULL OR until > NOW())`,
    [room.owner_id, room.room_type, userId],
  );
  return r.rows[0] ?? null;
}

export async function unbanFromRoom(room, userId, run = query) {
  const r = await run(
    `DELETE FROM room_bans WHERE owner_id = $1 AND room_type = $2 AND user_id = $3 RETURNING kind, banned_by, until`,
    [room.owner_id, room.room_type, userId],
  );
  return r.rows[0] ?? null;
}

/** "3 saat 20 dakika" / "45 dakika" / "24 saat". */
export function remainingText(minutes) {
  const m = Math.max(1, Math.round(Number(minutes) || 0));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h && rest) return `${h} saat ${rest} dakika`;
  if (h) return `${h} saat`;
  return `${rest} dakika`;
}

/** Yasaklı kişinin odaya girmeye çalışınca gördüğü yazı. */
export function banMessage(ban) {
  if (!ban || ban.until === null || ban.until === undefined) return 'Bu odaya girişiniz engellenmiş.';
  return `Bu odadan çıkarıldınız. ${remainingText(ban.minutes_left)} sonra tekrar girebilirsiniz.`;
}

/** Yönetici kaydı. Kayıt yazılamasa da asıl işlem (atma, susturma…) bozulmaz. */
export async function logModeration(room, actorId, targetId, action, detail = {}, run = query) {
  try {
    await run(
      `INSERT INTO room_mod_logs(owner_id, room_type, room_id, actor_id, target_id, action, detail) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [room.owner_id, room.room_type, room.id ?? null, actorId, targetId, String(action).slice(0, 20), JSON.stringify(detail ?? {})],
    );
  } catch (_) { /* yoksay */ }
}

/** Süren yasaklar + son kayıtlar (ham satırlar; kullanıcı bilgisi rotada eklenir). */
export async function moderationRows(room, { limit = 80 } = {}, run = query) {
  const bans = (await run(
    `SELECT user_id, kind, banned_by, until, created_at FROM room_bans
     WHERE owner_id = $1 AND room_type = $2 AND (until IS NULL OR until > NOW()) ORDER BY created_at DESC LIMIT 200`,
    [room.owner_id, room.room_type],
  )).rows;
  const logs = (await run(
    `SELECT id, actor_id, target_id, action, detail, created_at FROM room_mod_logs
     WHERE owner_id = $1 AND room_type = $2 ORDER BY id DESC LIMIT $3`,
    [room.owner_id, room.room_type, Math.max(1, Math.min(Number(limit) || 80, 200))],
  )).rows;
  return { bans, logs };
}

/** Süresi dolmuş yasakları ve eski kayıtları siler (sunucu açılışında ve günde bir). */
export async function pruneRoomBans(run = query) {
  await run(`DELETE FROM room_bans WHERE until IS NOT NULL AND until < NOW() - INTERVAL '1 day'`);
  await run(
    `DELETE FROM room_mod_logs l USING (
       SELECT id FROM (
         SELECT id, ROW_NUMBER() OVER (PARTITION BY owner_id, room_type ORDER BY id DESC) AS n FROM room_mod_logs
       ) x WHERE x.n > $1
     ) old WHERE l.id = old.id`,
    [LOG_KEEP],
  );
}
