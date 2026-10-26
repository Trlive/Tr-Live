// Ajans işlemleri: yetki (sahip / asistan), transferler (katılma, ajans değiştirme, ayrılma), asistan davet süresi.
import { query, tx } from '../database.js';
import { fail } from '../http.js';
import { notifyUser } from './notify.js';
import { hub } from '../realtime.js';

export const ASSISTANT_INVITE_DAYS = 7;
export const ESCALATE_DAYS = 7; // reddedilen transfer bu kadar gün içinde platforma taşınabilir

/** Ajansa erişim: sahip, etkin asistan ya da yönetici. */
export async function agencyAccess(agencyId, user, run = query) {
  const a = (await run(`SELECT * FROM agencies WHERE id = $1`, [agencyId])).rows[0];
  if (!a) throw fail('Ajans bulunamadı.', 404);
  if (a.owner_id === user.id) return { agency: a, role: 'owner', assistant: null };
  const as = (await run(
    `SELECT id, share_bps FROM agency_assistants WHERE agency_id = $1 AND user_id = $2 AND status = 'active'`, [agencyId, user.id],
  )).rows[0];
  if (as) return { agency: a, role: 'assistant', assistant: as };
  if (user.system_role === 'admin') return { agency: a, role: 'admin', assistant: null };
  throw fail('Bu ajansı görme yetkiniz yok.', 403);
}

export function requireOwner(access) {
  if (access.role !== 'owner' && access.role !== 'admin') throw fail('Bu işlemi yalnızca ajans sahibi yapabilir.', 403);
}

/** Süresi geçen asistan davetlerini kapatır (benzersiz indeksi serbest bırakmak için). */
export async function expireAssistantInvites(run = query) {
  await run(
    `UPDATE agency_assistants SET status = 'cancelled', ended_at = NOW()
     WHERE status = 'pending' AND created_at < NOW() - ($1::int * INTERVAL '1 day')`, [ASSISTANT_INVITE_DAYS],
  );
}

/** Onaylanmış (anında) bir hareketi geçmişe yazar. */
export async function logTransfer(c, { userId, from = null, to = null, kind, invitedBy = null, decidedBy = null, note = null }) {
  await c.query(
    `INSERT INTO agency_transfers(user_id, from_agency_id, to_agency_id, kind, status, invited_by, note, decided_at, decided_by)
     VALUES($1,$2,$3,$4,'approved',$5,$6,NOW(),$7)`,
    [userId, from, to, kind, invitedBy, note, decidedBy],
  );
}

/** Bekleyen transferi uygular (transaction içinde). Yayıncı artık kaynak ajansta değilse iptal edilir. */
export async function applyTransfer(c, t, decidedBy = null) {
  const b = (await c.query(`SELECT agency_id, status FROM broadcasters WHERE user_id = $1 FOR UPDATE`, [t.user_id])).rows[0];
  const cancel = async (note) => {
    await c.query(`UPDATE agency_transfers SET status = 'cancelled', decided_at = NOW(), decided_by = $2, note = $3 WHERE id = $1`, [t.id, decidedBy, note]);
    return { ok: false, note };
  };
  if (!b || b.status !== 'approved') return cancel('Yayıncılık artık etkin değil.');
  if ((b.agency_id ?? null) !== (t.from_agency_id ?? null)) return cancel('Yayıncı artık kaynak ajansta değil.');
  if (t.kind === 'transfer') {
    const to = (await c.query(`SELECT status FROM agencies WHERE id = $1`, [t.to_agency_id])).rows[0];
    if (!to || to.status !== 'active') return cancel('Hedef ajans aktif değil.');
    await c.query(
      `UPDATE broadcasters SET agency_id = $2, joined_agency_at = NOW(), invited_by = $3 WHERE user_id = $1`,
      [t.user_id, t.to_agency_id, t.invited_by ?? null],
    );
  } else if (t.kind === 'leave') {
    await c.query(`UPDATE broadcasters SET agency_id = NULL, joined_agency_at = NULL, invited_by = NULL WHERE user_id = $1`, [t.user_id]);
  } else {
    return cancel('Geçersiz transfer.');
  }
  await c.query(`UPDATE agency_transfers SET status = 'approved', decided_at = NOW(), decided_by = $2 WHERE id = $1`, [t.id, decidedBy]);
  await c.query(`UPDATE agency_requests SET status = 'cancelled', responded_at = NOW() WHERE user_id = $1 AND status = 'pending'`, [t.user_id]);
  return { ok: true };
}

const KIND_TEXT = { transfer: 'ajans değişikliği', leave: 'ajanstan ayrılma' };

/** Sonuç bildirimleri (transaction dışında, hata asıl işlemi bozmaz). */
export async function notifyTransferResult(t, approved, note = null) {
  try {
    const names = (await query(`SELECT id, name FROM agencies WHERE id = ANY($1::uuid[])`, [[t.from_agency_id, t.to_agency_id].filter(Boolean)])).rows;
    const nm = (id) => names.find((x) => x.id === id)?.name ?? 'ajans';
    const what = KIND_TEXT[t.kind] ?? 'transfer';
    const body = approved
      ? (t.kind === 'transfer' ? `Artık "${nm(t.to_agency_id)}" ajansının yayıncısısın.` : `"${nm(t.from_agency_id)}" ajansından ayrıldın.`)
      : `${what[0].toUpperCase()}${what.slice(1)} isteğin onaylanmadı.${note ? ` (${note})` : ''}`;
    await notifyUser(t.user_id, 'agency_transfer', approved ? 'Transfer onaylandı' : 'Transfer onaylanmadı', body, { transferId: t.id });
    hub.sendToUser(t.user_id, { type: 'agency_update' });
  } catch (error) {
    console.error('[ajans] transfer bildirimi:', error.message);
  }
}

/** Kaynak ajans süresi içinde yanıt vermezse bekleyen transferler otomatik onaylanır. */
export async function processDueTransfers() {
  const due = (await query(
    `SELECT id FROM agency_transfers WHERE status = 'pending_source' AND auto_at IS NOT NULL AND auto_at <= NOW() ORDER BY auto_at LIMIT 50`,
  )).rows;
  for (const { id } of due) {
    try {
      const res = await tx(async (c) => {
        const t = (await c.query(`SELECT * FROM agency_transfers WHERE id = $1 AND status = 'pending_source' FOR UPDATE`, [id])).rows[0];
        if (!t) return null;
        return { t, r: await applyTransfer(c, t, null) };
      });
      if (res) await notifyTransferResult(res.t, res.r.ok, res.r.note);
    } catch (error) {
      console.error('[ajans] otomatik transfer:', error.message);
    }
  }
}

export function startTransferTicker() {
  let busy = false;
  const run = async () => {
    if (busy) return;
    busy = true;
    try {
      await processDueTransfers();
      await expireAssistantInvites();
    } catch (error) {
      console.error('[ajans] zamanlayıcı:', error.message);
    } finally {
      busy = false;
    }
  };
  setTimeout(run, 45e3).unref();
  const t = setInterval(run, 10 * 60e3);
  t.unref();
  return t;
}
