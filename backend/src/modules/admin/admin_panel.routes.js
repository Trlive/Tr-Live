// Web yönetim paneli uçları (v2.70): tam kullanıcı listesi (sayfalı, filtreli), kullanıcı ayrıntısı ve geçmişi,
// odalar (liste, ayrıntı, kapatma, odadan çıkarma), platform geneli hediye / cüzdan hareketleri, günlük istatistik,
// aileler ve bekleyen iş sayıları. Kimlik ve yetki denetimi admin.js'teki ortak katmandadır (requireAuth + requireStaff
// + yardımcı admin izin listesi); yalnızca yöneticiye açık uçlar ayrıca requireSuperAdmin taşır.
import { query } from '../../infrastructure/database/database.js';
import { hiddenTxTypes } from '../wallet/coin_budgets.service.js';
import { requireSuperAdmin } from '../../middleware/authentication/auth.js';
import { fail, uuid, oneOf, text } from '../../shared/errors/http.js';
import { normalizePhone } from '../auth/auth.routes.js';
import { hub } from '../../infrastructure/websocket/realtime.js';
import { closeRoom, leaveRoom } from '../rooms/rooms.service.js';
import { roomStaffShield } from '../agencies/staff.rules.js';

export const PANEL_PAGE = 50;
const pageNo = (v) => Math.max(1, Math.min(Math.floor(Number(v)) || 1, 10000));
const str = (v) => (v === null || v === undefined ? null : String(v));
const likeArg = (q) => `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
const futureOrNull = (d) => (d && new Date(d) > new Date() ? d : null);

const USER_SORTS = {
  new: 'u.created_at DESC',
  old: 'u.created_at ASC',
  seen: 'u.last_seen_at DESC NULLS LAST',
  coins: 'u.coins DESC',
  diamonds: 'u.diamonds DESC',
  spent: 'u.total_sent_coins DESC',
  received: 'u.total_received_diamonds DESC',
  name: 'u.username ASC',
};

const WALLET_TYPES = [
  'admin_adjustment', 'gift_sent', 'gift_received', 'store_purchase', 'wip_purchase', 'diamond_exchange', 'lucky_gift_win',
  'lucky_bag_sent', 'lucky_bag_received', 'lucky_bag_refund', 'family_cashback', 'family_reward', 'fly_text', 'guardian_card',
  'relation_invite', 'relation_refund', 'salary_conversion', 'salary_conversion_refund', 'dealer_credit', 'daily_bonus',
  // Basım bütçesi türleri (system_test, event_reward, vip_compensation, marketing) bilerek YOK:
  // panelde süzülemezler, çünkü listede hiç görünmüyorlar.
];

const userBrief = (p, x) => (x[`${p}id`] ? {
  id: x[`${p}id`], username: x[`${p}username`], displayName: x[`${p}name`], avatarUrl: x[`${p}avatar`] ?? null, publicId: x[`${p}public_id`] ?? null,
} : null);

/** Bir sayfa satır alır (limit + 1 ile "devamı var mı" anlaşılır). */
function paged(rows, page) {
  const hasMore = rows.length > PANEL_PAGE;
  return { rows: hasMore ? rows.slice(0, PANEL_PAGE) : rows, page, hasMore };
}

export function mountPanelRoutes(router) {
  // ---------------- Kullanıcı listesi ----------------
  // q: kullanıcı adı / görünen ad (parça), ID, özel ID, telefon (yalnızca yönetici). Filtre: durum, rol, WIP, yayıncı, cinsiyet,
  // son 24 saatte aktif / yeni üye. Sıralama: yeni, eski, son görülme, Coin, Elmas, harcama, kazanç, ad.
  router.get('/users/list', async (req, res) => {
    const admin = req.user.system_role === 'admin';
    const page = pageNo(req.query.page);
    const raw = String(req.query.q ?? '').trim().toLowerCase().slice(0, 60);
    const q = raw.length ? raw : null;
    const phone = admin && q ? normalizePhone(q) : null;
    const status = req.query.status ? oneOf(String(req.query.status), ['active', 'banned', 'deleted'], 'Durum') : null;
    const role = req.query.role ? oneOf(String(req.query.role), ['user', 'support', 'admin', 'staff'], 'Rol') : null;
    const gender = req.query.gender ? oneOf(String(req.query.gender), ['male', 'female'], 'Cinsiyet') : null;
    const wip = req.query.wip === '1';
    const host = req.query.broadcaster === '1';
    const recent = req.query.recent === '1';
    const restricted = req.query.restricted === '1';
    const joined = req.query.joined === '1';
    const sortArg = String(req.query.sort ?? 'new');
    let sort = Object.hasOwn(USER_SORTS, sortArg) ? sortArg : 'new';
    if (!admin && ['coins', 'diamonds', 'spent', 'received'].includes(sort)) sort = 'new';
    const r = await query(
      `SELECT u.id, u.public_id, u.username, u.display_name, u.avatar_url, u.coins, u.diamonds, u.system_role, u.account_status,
              u.banned_until, u.chat_restricted_until, u.created_at, u.last_seen_at, u.country, u.gender, u.kyc_status,
              u.total_sent_coins, u.total_received_diamonds, u.coin_level, u.gift_level,
              w.level AS wip_level, b.status AS broadcaster_status, a.name AS agency_name, si.special_id,
              COUNT(*) OVER() AS total
       FROM users u
       LEFT JOIN user_wip w ON w.user_id = u.id AND w.is_active AND w.expires_at > NOW()
       LEFT JOIN broadcasters b ON b.user_id = u.id
       LEFT JOIN agencies a ON a.id = b.agency_id
       LEFT JOIN special_ids si ON si.user_id = u.id AND si.expires_at > NOW()
       WHERE ($1::text IS NULL OR lower(u.username) LIKE $2 ESCAPE '\\' OR lower(u.display_name) LIKE $2 ESCAPE '\\'
              OR u.public_id = $1 OR u.id::text = $1 OR si.special_id = $1 OR ($3::text IS NOT NULL AND u.phone = $3))
         AND ($4::text IS NULL OR u.account_status = $4)
         AND ($5::text IS NULL OR u.system_role = $5 OR ($5 = 'staff' AND u.system_role IN ('admin','support')))
         AND ($6::text IS NULL OR u.gender = $6)
         AND (NOT $7::boolean OR w.level IS NOT NULL)
         AND (NOT $8::boolean OR b.status = 'approved')
         AND (NOT $9::boolean OR u.last_seen_at > NOW() - INTERVAL '24 hours')
         AND (NOT $10::boolean OR u.chat_restricted_until > NOW())
         AND (NOT $11::boolean OR u.created_at > NOW() - INTERVAL '24 hours')
       ORDER BY ${USER_SORTS[sort]}, u.id
       LIMIT ${PANEL_PAGE} OFFSET $12`,
      [q, q ? likeArg(q) : null, phone, status, role, gender, wip, host, recent, restricted, joined, (page - 1) * PANEL_PAGE],
    );
    const counts = await userCounts();
    const total = r.rows.length ? Number(r.rows[0].total) : 0;
    res.json({
      page, pageSize: PANEL_PAGE, total, pages: Math.max(1, Math.ceil(total / PANEL_PAGE)), counts,
      users: r.rows.map((u) => userRow(u, admin)),
    });
  });

  // Liste başındaki özet sayılar: tüm tabloyu taradığı için 30 saniye önbellekte tutulur.
  let countsCache = null;
  let countsAt = 0;
  async function userCounts() {
    if (countsCache && Date.now() - countsAt < 30e3) return countsCache;
    countsCache = (await query(
      `SELECT COUNT(*)::int AS all,
              COUNT(*) FILTER (WHERE account_status = 'active')::int AS active,
              COUNT(*) FILTER (WHERE account_status = 'banned')::int AS banned,
              COUNT(*) FILTER (WHERE account_status = 'deleted')::int AS deleted,
              COUNT(*) FILTER (WHERE system_role IN ('admin','support'))::int AS staff,
              COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '24 hours')::int AS recent,
              COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int AS new24h
       FROM users`,
    )).rows[0];
    countsAt = Date.now();
    return countsCache;
  }

  const userRow = (u, admin) => ({
    id: u.id, publicId: u.public_id ?? null, specialId: u.special_id ?? null, username: u.username, displayName: u.display_name,
    avatarUrl: u.avatar_url ?? null, systemRole: u.system_role, accountStatus: u.account_status,
    bannedUntil: u.banned_until, chatRestrictedUntil: futureOrNull(u.chat_restricted_until),
    createdAt: u.created_at, lastSeenAt: u.last_seen_at, online: hub.isOnline(u.id),
    country: u.country ?? null, gender: u.gender ?? null, coinLevel: u.coin_level, giftLevel: u.gift_level,
    wipLevel: u.wip_level ?? null, broadcasterStatus: u.broadcaster_status ?? null, agencyName: u.agency_name ?? null,
    ...(admin ? {
      coins: String(u.coins), diamonds: String(u.diamonds), totalSentCoins: String(u.total_sent_coins ?? 0),
      totalReceivedDiamonds: String(u.total_received_diamonds ?? 0), kycStatus: u.kyc_status,
    } : {}),
  });

  // ---------------- Kullanıcı ayrıntısı ----------------
  // Yardımcı admin: profil, durum, şikâyet / ihlal, oda ve aile bilgisi. Yönetici ayrıca bakiye, telefon, doğum tarihi,
  // bağlı hesaplar (Google / Facebook e-postası), envanter, ajans ve KYC bilgilerini görür.
  router.get('/users/:userId/detail', async (req, res) => {
    const id = uuid(req.params.userId, 'Kullanıcı');
    const admin = req.user.system_role === 'admin';
    const u = (await query(
      `SELECT u.*, cp.username AS cp_username, cp.display_name AS cp_name, bu.username AS banned_by_username,
              w.level AS wip_level, w.expires_at AS wip_expires_at, w.starts_at AS wip_starts_at,
              si.special_id, si.expires_at AS special_id_expires_at, hb.badge AS host_badge, hb.expires_at AS host_badge_expires_at
       FROM users u
       LEFT JOIN users cp ON cp.id = u.cp_partner_id
       LEFT JOIN users bu ON bu.id = u.banned_by
       LEFT JOIN user_wip w ON w.user_id = u.id AND w.is_active AND w.expires_at > NOW()
       LEFT JOIN special_ids si ON si.user_id = u.id AND si.expires_at > NOW()
       LEFT JOIN host_badges hb ON hb.user_id = u.id AND hb.expires_at > NOW()
       WHERE u.id = $1`, [id],
    )).rows[0];
    if (!u) throw fail('Kullanıcı bulunamadı.', 404);
    const [stats, family, broadcaster, owned, assistant, rooms, ownedRooms, reports, strikes, inventory, identities] = await Promise.all([
      query(
        `SELECT (SELECT COUNT(*)::int FROM follows WHERE followed_id = $1) AS followers,
                (SELECT COUNT(*)::int FROM follows WHERE follower_id = $1) AS following,
                (SELECT COUNT(*)::int FROM gift_transactions WHERE sender_id = $1) AS gifts_sent,
                (SELECT COUNT(*)::int FROM gift_transactions WHERE receiver_id = $1) AS gifts_received,
                (SELECT COUNT(*)::int FROM rooms WHERE owner_id = $1) AS rooms_opened,
                (SELECT COUNT(*)::int FROM reports WHERE target_user_id = $1) AS reports_against,
                (SELECT COUNT(*)::int FROM reports WHERE target_user_id = $1 AND status = 'open') AS reports_open,
                (SELECT COUNT(*)::int FROM reports WHERE reporter_id = $1) AS reports_made,
                (SELECT COUNT(*)::int FROM moderation_strikes WHERE user_id = $1) AS strikes,
                (SELECT COUNT(*)::int FROM support_messages WHERE user_id = $1) AS support_messages`, [id],
      ),
      query(
        `SELECT f.id, f.name, f.public_id, f.level, fm.role, fm.joined_at FROM family_members fm JOIN families f ON f.id = fm.family_id
         WHERE fm.user_id = $1 LIMIT 1`, [id],
      ),
      query(
        `SELECT b.status, b.applied_at, b.approved_at, b.joined_agency_at, b.contract_tier, a.id AS agency_id, a.name AS agency_name
         FROM broadcasters b LEFT JOIN agencies a ON a.id = b.agency_id WHERE b.user_id = $1`, [id],
      ),
      query(`SELECT id, name, status, agency_code, commission_bps FROM agencies WHERE owner_id = $1 AND status <> 'rejected' LIMIT 1`, [id]),
      query(
        `SELECT s.status, s.share_bps, a.id, a.name FROM agency_assistants s JOIN agencies a ON a.id = s.agency_id
         WHERE s.user_id = $1 AND s.status IN ('active','pending') ORDER BY s.created_at DESC LIMIT 1`, [id],
      ),
      query(
        `SELECT r.id, r.name, r.room_type, rm.role, rm.microphone, rm.seat_index, rm.joined_at FROM room_members rm JOIN rooms r ON r.id = rm.room_id
         WHERE rm.user_id = $1`, [id],
      ),
      query(`SELECT id, name, room_type, room_number, is_active, created_at, closed_at FROM rooms WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 10`, [id]),
      query(
        `SELECT r.id, r.kind, r.reason, r.details, r.status, r.created_at, r.resolved_note, ru.id AS reporter_id, ru.username AS reporter_username
         FROM reports r JOIN users ru ON ru.id = r.reporter_id WHERE r.target_user_id = $1 ORDER BY r.created_at DESC LIMIT 20`, [id],
      ),
      query(`SELECT id, kind, context, sample, created_at FROM moderation_strikes WHERE user_id = $1 ORDER BY id DESC LIMIT 20`, [id]),
      admin ? query(
        `SELECT id, item_type, item_key, item_name, quantity, expires_at, created_at FROM inventory_items
         WHERE user_id = $1 AND is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY created_at DESC LIMIT 200`, [id],
      ) : { rows: [] },
      admin ? query(`SELECT provider, email, created_at FROM user_identities WHERE user_id = $1 ORDER BY created_at`, [id]) : { rows: [] },
    ]);
    const s = stats.rows[0];
    const f = family.rows[0];
    const b = broadcaster.rows[0];
    const o = owned.rows[0];
    const as = assistant.rows[0];
    res.json({
      viewer: { full: admin },
      user: {
        id: u.id, publicId: u.public_id ?? null, username: u.username, displayName: u.display_name, avatarUrl: u.avatar_url ?? null,
        coverUrl: u.cover_url ?? null, bio: u.bio ?? null, language: u.language ?? null, gender: u.gender ?? null,
        country: u.country ?? null, city: u.city ?? null, systemRole: u.system_role, accountStatus: u.account_status,
        bannedUntil: u.banned_until, banReason: u.ban_reason ?? null, bannedBy: u.banned_by_username ?? null,
        chatRestrictedUntil: futureOrNull(u.chat_restricted_until), createdAt: u.created_at, updatedAt: u.updated_at,
        lastSeenAt: u.last_seen_at, online: hub.isOnline(u.id), coinLevel: u.coin_level, giftLevel: u.gift_level, xp: str(u.xp),
        isHidden: Boolean(u.is_hidden), showPresence: u.show_presence !== false, ghostMode: Boolean(u.ghost_mode),
        hideCountry: Boolean(u.hide_country), hideVisits: Boolean(u.hide_visits), whoCanDm: u.who_can_dm ?? null,
        termsVersion: u.terms_version ?? null, termsAcceptedAt: u.terms_accepted_at ?? null,
        cpPartner: u.cp_partner_id ? { id: u.cp_partner_id, username: u.cp_username, displayName: u.cp_name } : null,
        wip: u.wip_level ? { level: u.wip_level, startsAt: u.wip_starts_at, expiresAt: u.wip_expires_at } : null,
        specialId: u.special_id ? { value: u.special_id, expiresAt: u.special_id_expires_at } : null,
        hostBadge: u.host_badge ? { badge: u.host_badge, expiresAt: u.host_badge_expires_at } : null,
        ...(admin ? {
          coins: String(u.coins), diamonds: String(u.diamonds), totalSentCoins: String(u.total_sent_coins ?? 0),
          totalReceivedDiamonds: String(u.total_received_diamonds ?? 0), phone: u.phone ?? null, birthDate: u.birth_date ?? null,
          kycStatus: u.kyc_status ?? 'none', hasPassword: Boolean(u.password_hash),
        } : {}),
      },
      stats: {
        followers: s.followers, following: s.following, giftsSent: s.gifts_sent, giftsReceived: s.gifts_received, roomsOpened: s.rooms_opened,
        reportsAgainst: s.reports_against, reportsOpen: s.reports_open, reportsMade: s.reports_made, strikes: s.strikes, supportMessages: s.support_messages,
      },
      family: f ? { id: f.id, name: f.name, publicId: f.public_id ?? null, level: f.level, role: f.role, joinedAt: f.joined_at } : null,
      broadcaster: b ? {
        status: b.status, appliedAt: b.applied_at, approvedAt: b.approved_at, joinedAgencyAt: b.joined_agency_at,
        contractTier: b.contract_tier ?? null, agency: b.agency_id ? { id: b.agency_id, name: b.agency_name } : null,
      } : null,
      agencyOwned: o && admin ? { id: o.id, name: o.name, status: o.status, agencyCode: o.agency_code ?? null, commissionBps: o.commission_bps } : (o ? { id: o.id, name: o.name, status: o.status } : null),
      assistantOf: as ? { id: as.id, name: as.name, status: as.status, shareBps: admin ? as.share_bps : undefined } : null,
      currentRooms: rooms.rows.map((r) => ({ id: r.id, name: r.name, roomType: r.room_type, role: r.role, microphone: r.microphone, seatIndex: r.seat_index, joinedAt: r.joined_at })),
      ownedRooms: ownedRooms.rows.map((r) => ({ id: r.id, name: r.name, roomType: r.room_type, roomNumber: r.room_number ?? null, isActive: r.is_active, createdAt: r.created_at, closedAt: r.closed_at })),
      reports: reports.rows.map((r) => ({
        id: r.id, kind: r.kind, reason: r.reason, details: r.details, status: r.status, createdAt: r.created_at, note: r.resolved_note ?? null,
        reporter: { id: r.reporter_id, username: r.reporter_username },
      })),
      strikes: strikes.rows.map((x) => ({ id: String(x.id), kind: x.kind, context: x.context, sample: x.sample, createdAt: x.created_at })),
      inventory: inventory.rows.map((x) => ({
        id: x.id, itemType: x.item_type, itemKey: x.item_key, itemName: x.item_name, quantity: x.quantity, expiresAt: x.expires_at, createdAt: x.created_at,
      })),
      identities: identities.rows.map((x) => ({ provider: x.provider, email: x.email ?? null, createdAt: x.created_at })),
    });
  });

  // Kullanıcı geçmişi (yalnızca yönetici): cüzdan hareketleri, gönderdiği / aldığı hediyeler, kayıtlar. Sayfa başına 50.
  router.get('/users/:userId/history', requireSuperAdmin, async (req, res) => {
    const id = uuid(req.params.userId, 'Kullanıcı');
    const kind = oneOf(String(req.query.kind ?? 'wallet'), ['wallet', 'gifts_sent', 'gifts_received', 'audit'], 'Tür');
    const page = pageNo(req.query.page);
    const off = (page - 1) * PANEL_PAGE;
    if (kind === 'wallet') {
      const r = await query(
        // Basım bütçesi satırları (test, etkinlik, telafi, pazarlama) panelde de gösterilmez.
        `SELECT id, transaction_type, coin_amount, diamond_amount, reference_id, description, created_at FROM wallet_transactions
         WHERE user_id = $1 AND NOT (transaction_type = ANY($3::text[]))
         ORDER BY created_at DESC, id LIMIT ${PANEL_PAGE + 1} OFFSET $2`, [id, off, await hiddenTxTypes()],
      );
      const p = paged(r.rows, page);
      return res.json({ ...p, rows: undefined, items: p.rows.map((x) => ({
        id: x.id, type: x.transaction_type, coins: str(x.coin_amount), diamonds: str(x.diamond_amount), referenceId: x.reference_id ?? null,
        description: x.description ?? null, createdAt: x.created_at,
      })) });
    }
    if (kind === 'audit') {
      const r = await query(
        `SELECT l.id, l.action, l.reference_type, l.reference_id, l.amount_coins, l.balance_before, l.balance_after, l.metadata, l.created_at,
                a.id AS a_id, a.username AS a_username, a.display_name AS a_name, t.id AS t_id, t.username AS t_username, t.display_name AS t_name
         FROM financial_audit_logs l LEFT JOIN users a ON a.id = l.admin_id LEFT JOIN users t ON t.id = l.user_id
         WHERE l.user_id = $1 OR l.admin_id = $1 ORDER BY l.created_at DESC, l.id LIMIT ${PANEL_PAGE + 1} OFFSET $2`, [id, off],
      );
      const p = paged(r.rows, page);
      return res.json({ ...p, rows: undefined, items: p.rows.map((x) => ({
        id: x.id, action: x.action, referenceType: x.reference_type, referenceId: x.reference_id, amountCoins: str(x.amount_coins),
        balanceBefore: str(x.balance_before), balanceAfter: str(x.balance_after), metadata: x.metadata, createdAt: x.created_at,
        actor: userBrief('a_', { a_id: x.a_id, a_username: x.a_username, a_name: x.a_name }),
        target: userBrief('t_', { t_id: x.t_id, t_username: x.t_username, t_name: x.t_name }),
      })) });
    }
    const sent = kind === 'gifts_sent';
    const r = await query(
      `SELECT g.id, g.quantity, g.coin_amount, g.diamond_amount, g.created_at, g.room_id, r.name AS room_name, gi.name AS gift_name, gi.icon_url,
              p.id AS p_id, p.username AS p_username, p.display_name AS p_name, p.avatar_url AS p_avatar, p.public_id AS p_public_id
       FROM gift_transactions g LEFT JOIN gifts gi ON gi.id = g.gift_id LEFT JOIN rooms r ON r.id = g.room_id
       LEFT JOIN users p ON p.id = ${sent ? 'g.receiver_id' : 'g.sender_id'}
       WHERE ${sent ? 'g.sender_id' : 'g.receiver_id'} = $1 ORDER BY g.created_at DESC, g.id LIMIT ${PANEL_PAGE + 1} OFFSET $2`, [id, off],
    );
    const p = paged(r.rows, page);
    res.json({ ...p, rows: undefined, items: p.rows.map((x) => ({
      id: x.id, giftName: x.gift_name ?? 'Hediye', iconUrl: x.icon_url ?? null, quantity: str(x.quantity), coins: str(x.coin_amount),
      diamonds: str(x.diamond_amount), createdAt: x.created_at, room: x.room_id ? { id: x.room_id, name: x.room_name } : null,
      peer: userBrief('p_', x),
    })) });
  });

  // ---------------- Odalar ----------------
  router.get('/rooms', requireSuperAdmin, async (req, res) => {
    const page = pageNo(req.query.page);
    const status = oneOf(String(req.query.status ?? 'active'), ['active', 'closed', 'all'], 'Durum');
    const raw = String(req.query.q ?? '').trim().toLowerCase().slice(0, 60);
    const q = raw.length ? raw : null;
    const type = req.query.type ? oneOf(String(req.query.type), ['audio', 'video'], 'Oda türü') : null;
    const r = await query(
      `SELECT r.id, r.name, r.room_type, r.seat_count, r.is_active, r.is_hidden, (r.password_hash IS NOT NULL) AS locked, r.room_number,
              r.created_at, r.closed_at, r.tags, r.cover_url,
              u.id AS o_id, u.username AS o_username, u.display_name AS o_name, u.avatar_url AS o_avatar, u.public_id AS o_public_id,
              CASE WHEN r.is_active THEN (SELECT COUNT(*)::int FROM room_members m WHERE m.room_id = r.id) ELSE 0 END AS members,
              CASE WHEN r.is_active THEN (SELECT COUNT(*)::int FROM room_members m WHERE m.room_id = r.id AND m.microphone) ELSE 0 END AS on_mic,
              COUNT(*) OVER() AS total
       FROM rooms r JOIN users u ON u.id = r.owner_id
       WHERE ($1 = 'all' OR ($1 = 'active' AND r.is_active) OR ($1 = 'closed' AND NOT r.is_active))
         AND ($2::text IS NULL OR lower(r.name) LIKE $3 ESCAPE '\\' OR r.room_number = $2 OR lower(u.username) LIKE $3 ESCAPE '\\'
              OR u.public_id = $2 OR r.id::text = $2)
         AND ($4::text IS NULL OR r.room_type = $4)
       ORDER BY r.is_active DESC, members DESC, r.created_at DESC, r.id
       LIMIT ${PANEL_PAGE} OFFSET $5`,
      [status, q, q ? likeArg(q) : null, type, (page - 1) * PANEL_PAGE],
    );
    const total = r.rows.length ? Number(r.rows[0].total) : 0;
    res.json({
      page, pageSize: PANEL_PAGE, total, pages: Math.max(1, Math.ceil(total / PANEL_PAGE)),
      rooms: r.rows.map((x) => ({
        id: x.id, name: x.name, roomType: x.room_type, seatCount: x.seat_count, isActive: x.is_active, isHidden: x.is_hidden, locked: x.locked,
        roomNumber: x.room_number ?? null, createdAt: x.created_at, closedAt: x.closed_at, tags: x.tags ?? [], coverUrl: x.cover_url ?? null,
        members: x.members, onMic: x.on_mic, owner: userBrief('o_', x),
      })),
    });
  });

  router.get('/rooms/:roomId/detail', requireSuperAdmin, async (req, res) => {
    const id = uuid(req.params.roomId, 'Oda');
    const room = (await query(
      `SELECT r.*, (r.password_hash IS NOT NULL) AS locked, u.id AS o_id, u.username AS o_username, u.display_name AS o_name,
              u.avatar_url AS o_avatar, u.public_id AS o_public_id
       FROM rooms r JOIN users u ON u.id = r.owner_id WHERE r.id = $1`, [id],
    )).rows[0];
    if (!room) throw fail('Oda bulunamadı.', 404);
    const [members, messages, gifts, top, reports] = await Promise.all([
      query(
        `SELECT m.role, m.microphone, m.seat_index, m.joined_at, m.chat_muted_until, u.id AS u_id, u.username AS u_username, u.display_name AS u_name,
                u.avatar_url AS u_avatar, u.public_id AS u_public_id, u.system_role, is_ghost(u.id) AS ghost
         FROM room_members m JOIN users u ON u.id = m.user_id WHERE m.room_id = $1 ORDER BY m.seat_index NULLS LAST, m.joined_at`, [id],
      ),
      query(
        `SELECT m.id, m.body, m.deleted, m.created_at, u.id AS u_id, u.username AS u_username, u.display_name AS u_name, u.avatar_url AS u_avatar,
                u.public_id AS u_public_id
         FROM room_messages m JOIN users u ON u.id = m.user_id WHERE m.room_id = $1 ORDER BY m.created_at DESC LIMIT 100`, [id],
      ),
      query(`SELECT COUNT(*)::int AS n, COALESCE(SUM(coin_amount),0)::text AS coins FROM gift_transactions WHERE room_id = $1 AND created_at >= $2`, [id, room.created_at]),
      query(
        `SELECT u.id AS u_id, u.username AS u_username, u.display_name AS u_name, u.avatar_url AS u_avatar, u.public_id AS u_public_id,
                SUM(g.coin_amount)::text AS coins
         FROM gift_transactions g JOIN users u ON u.id = g.sender_id WHERE g.room_id = $1 AND g.created_at >= $2
         GROUP BY u.id ORDER BY SUM(g.coin_amount) DESC LIMIT 10`, [id, room.created_at],
      ),
      query(
        `SELECT r.id, r.kind, r.reason, r.details, r.status, r.created_at, ru.username AS reporter_username FROM reports r JOIN users ru ON ru.id = r.reporter_id
         WHERE r.room_id = $1 ORDER BY r.created_at DESC LIMIT 20`, [id],
      ),
    ]);
    res.json({
      room: {
        id: room.id, name: room.name, roomType: room.room_type, seatCount: room.seat_count, isActive: room.is_active, isHidden: room.is_hidden,
        locked: room.locked, roomNumber: room.room_number ?? null, createdAt: room.created_at, closedAt: room.closed_at, tags: room.tags ?? [],
        announcement: room.announcement ?? null, coverUrl: room.cover_url ?? null, chatEnabled: room.chat_enabled !== false, layout: room.layout ?? null,
        owner: userBrief('o_', room),
      },
      members: members.rows.map((m) => ({
        role: m.role, microphone: m.microphone, seatIndex: m.seat_index, joinedAt: m.joined_at, ghost: m.ghost,
        chatMutedUntil: futureOrNull(m.chat_muted_until), systemRole: m.system_role, user: userBrief('u_', m),
      })),
      messages: messages.rows.map((m) => ({ id: m.id, text: m.body, deleted: m.deleted, createdAt: m.created_at, user: userBrief('u_', m) })),
      gifts: { count: gifts.rows[0].n, coins: gifts.rows[0].coins, topSenders: top.rows.map((t) => ({ coins: t.coins, user: userBrief('u_', t) })) },
      reports: reports.rows.map((r) => ({ id: r.id, kind: r.kind, reason: r.reason, details: r.details, status: r.status, createdAt: r.created_at, reporter: r.reporter_username })),
    });
  });

  // Odayı kapat (kural ihlali vb.). Üyelere "oda kapandı" gider, ses/görüntü bağlantısı kesilir.
  router.post('/rooms/:roomId/close', requireSuperAdmin, async (req, res) => {
    const id = uuid(req.params.roomId, 'Oda');
    const reason = text(req.body?.reason, 'Neden', { max: 300 });
    const room = (await query(`SELECT owner_id, name, is_active FROM rooms WHERE id = $1`, [id])).rows[0];
    if (!room) throw fail('Oda bulunamadı.', 404);
    if (!room.is_active) throw fail('Oda zaten kapalı.', 409);
    await closeRoom(id);
    await query(
      `INSERT INTO financial_audit_logs(admin_id, user_id, action, reference_type, reference_id, metadata) VALUES($1,$2,'room_close','room',$3,$4)`,
      [req.user.id, room.owner_id, id, JSON.stringify({ name: room.name, reason })],
    );
    res.json({ ok: true });
  });

  // Kişiyi odadan çıkar. Yönetim hesabına uygulanamaz.
  router.post('/rooms/:roomId/members/:userId/kick', requireSuperAdmin, async (req, res) => {
    const roomId = uuid(req.params.roomId, 'Oda');
    const userId = uuid(req.params.userId, 'Kullanıcı');
    if (userId === req.user.id) throw fail('Kendinizi odadan buradan çıkaramazsınız.');
    const t = (await query(`SELECT system_role FROM users WHERE id = $1`, [userId])).rows[0];
    if (!t) throw fail('Kullanıcı bulunamadı.', 404);
    const shield = roomStaffShield(req.user.system_role, t.system_role);
    if (shield) throw fail(shield, 403);
    if (!(await leaveRoom(userId, roomId))) throw fail('Kişi bu odada değil.', 404);
    hub.sendToUser(userId, { type: 'room_kicked', roomId });
    await query(
      `INSERT INTO financial_audit_logs(admin_id, user_id, action, reference_type, reference_id, metadata) VALUES($1,$2,'room_kick','room',$3,'{}')`,
      [req.user.id, userId, roomId],
    );
    res.json({ ok: true });
  });

  // Oda mesajını sil (herkesten). Sohbet ekranından hemen kalkar.
  router.post('/rooms/:roomId/messages/:messageId/delete', requireSuperAdmin, async (req, res) => {
    const roomId = uuid(req.params.roomId, 'Oda');
    const messageId = uuid(req.params.messageId, 'Mesaj');
    const r = await query(`UPDATE room_messages SET deleted = TRUE WHERE id = $1 AND room_id = $2 AND deleted = FALSE RETURNING user_id`, [messageId, roomId]);
    if (!r.rowCount) throw fail('Mesaj bulunamadı ya da zaten silinmiş.', 404);
    hub.broadcastRoom(roomId, { type: 'room_message_deleted', roomId, messageId });
    await query(
      `INSERT INTO financial_audit_logs(admin_id, user_id, action, reference_type, reference_id, metadata) VALUES($1,$2,'room_message_delete','room',$3,$4)`,
      [req.user.id, r.rows[0].user_id, roomId, JSON.stringify({ messageId })],
    );
    res.json({ ok: true });
  });

  // ---------------- Platform geneli hareketler ----------------
  router.get('/gift-transactions', requireSuperAdmin, async (req, res) => {
    const page = pageNo(req.query.page);
    const userId = req.query.userId ? uuid(String(req.query.userId), 'Kullanıcı') : null;
    const min = Math.max(0, Math.floor(Number(req.query.minCoins)) || 0);
    const r = await query(
      `SELECT g.id, g.quantity, g.coin_amount, g.diamond_amount, g.created_at, g.room_id, r.name AS room_name, gi.name AS gift_name, gi.icon_url,
              s.id AS s_id, s.username AS s_username, s.display_name AS s_name, s.avatar_url AS s_avatar, s.public_id AS s_public_id,
              t.id AS t_id, t.username AS t_username, t.display_name AS t_name, t.avatar_url AS t_avatar, t.public_id AS t_public_id
       FROM gift_transactions g LEFT JOIN gifts gi ON gi.id = g.gift_id LEFT JOIN rooms r ON r.id = g.room_id
       LEFT JOIN users s ON s.id = g.sender_id LEFT JOIN users t ON t.id = g.receiver_id
       WHERE ($1::uuid IS NULL OR g.sender_id = $1 OR g.receiver_id = $1) AND g.coin_amount >= $2
       ORDER BY g.created_at DESC, g.id LIMIT ${PANEL_PAGE + 1} OFFSET $3`,
      [userId, min, (page - 1) * PANEL_PAGE],
    );
    const p = paged(r.rows, page);
    res.json({ page, hasMore: p.hasMore, items: p.rows.map((x) => ({
      id: x.id, giftName: x.gift_name ?? 'Hediye', iconUrl: x.icon_url ?? null, quantity: str(x.quantity), coins: str(x.coin_amount),
      diamonds: str(x.diamond_amount), createdAt: x.created_at, room: x.room_id ? { id: x.room_id, name: x.room_name } : null,
      sender: userBrief('s_', x), receiver: userBrief('t_', x),
    })) });
  });

  router.get('/wallet-transactions', requireSuperAdmin, async (req, res) => {
    const page = pageNo(req.query.page);
    const type = req.query.type ? oneOf(String(req.query.type), WALLET_TYPES, 'Tür') : null;
    const r = await query(
      `SELECT w.id, w.transaction_type, w.coin_amount, w.diamond_amount, w.description, w.created_at,
              u.id AS u_id, u.username AS u_username, u.display_name AS u_name, u.avatar_url AS u_avatar, u.public_id AS u_public_id
       FROM wallet_transactions w LEFT JOIN users u ON u.id = w.user_id
       WHERE ($1::text IS NULL OR w.transaction_type = $1)
         AND NOT (w.transaction_type = ANY($3::text[]))
       ORDER BY w.created_at DESC, w.id LIMIT ${PANEL_PAGE + 1} OFFSET $2`,
      [type, (page - 1) * PANEL_PAGE, await hiddenTxTypes()],
    );
    const p = paged(r.rows, page);
    res.json({ page, hasMore: p.hasMore, types: WALLET_TYPES, items: p.rows.map((x) => ({
      id: x.id, type: x.transaction_type, coins: str(x.coin_amount), diamonds: str(x.diamond_amount), description: x.description ?? null,
      createdAt: x.created_at, user: userBrief('u_', x),
    })) });
  });

  // Günlük istatistik (Türkiye saatiyle): yeni üye, hediye sayısı / Coin, açılan oda, şikâyet.
  router.get('/stats/daily', requireSuperAdmin, async (req, res) => {
    const days = Math.max(2, Math.min(Math.floor(Number(req.query.days)) || 14, 90));
    const r = await query(
      `WITH d AS (
         SELECT g AS day, (g AT TIME ZONE 'Europe/Istanbul') AS s, ((g + INTERVAL '1 day') AT TIME ZONE 'Europe/Istanbul') AS e
         FROM generate_series(date_trunc('day', NOW() AT TIME ZONE 'Europe/Istanbul') - (($1::int - 1) * INTERVAL '1 day'),
                              date_trunc('day', NOW() AT TIME ZONE 'Europe/Istanbul'), INTERVAL '1 day') g)
       SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
         (SELECT COUNT(*)::int FROM users x WHERE x.created_at >= d.s AND x.created_at < d.e) AS new_users,
         (SELECT COUNT(*)::int FROM gift_transactions x WHERE x.created_at >= d.s AND x.created_at < d.e) AS gifts,
         (SELECT COALESCE(SUM(x.coin_amount),0)::text FROM gift_transactions x WHERE x.created_at >= d.s AND x.created_at < d.e) AS gift_coins,
         (SELECT COUNT(*)::int FROM rooms x WHERE x.created_at >= d.s AND x.created_at < d.e) AS rooms,
         (SELECT COUNT(*)::int FROM reports x WHERE x.created_at >= d.s AND x.created_at < d.e) AS reports
       FROM d ORDER BY d.day`,
      [days],
    );
    res.json({ days: r.rows.map((x) => ({ day: x.day, newUsers: x.new_users, gifts: x.gifts, giftCoins: x.gift_coins, rooms: x.rooms, reports: x.reports })) });
  });

  // ---------------- Aileler ----------------
  router.get('/families', requireSuperAdmin, async (req, res) => {
    const page = pageNo(req.query.page);
    const raw = String(req.query.q ?? '').trim().toLowerCase().slice(0, 60);
    const q = raw.length ? raw : null;
    const r = await query(
      `SELECT f.id, f.name, f.public_id, f.level, f.total_points, f.is_active, f.created_at, f.logo_url,
              u.id AS o_id, u.username AS o_username, u.display_name AS o_name, u.avatar_url AS o_avatar, u.public_id AS o_public_id,
              (SELECT COUNT(*)::int FROM family_members m WHERE m.family_id = f.id) AS members, COUNT(*) OVER() AS total
       FROM families f JOIN users u ON u.id = f.owner_id
       WHERE ($1::text IS NULL OR lower(f.name) LIKE $2 ESCAPE '\\' OR f.public_id = $1)
       ORDER BY f.is_active DESC, f.total_points DESC, f.id LIMIT ${PANEL_PAGE} OFFSET $3`,
      [q, q ? likeArg(q) : null, (page - 1) * PANEL_PAGE],
    );
    const total = r.rows.length ? Number(r.rows[0].total) : 0;
    res.json({
      page, total, pages: Math.max(1, Math.ceil(total / PANEL_PAGE)),
      families: r.rows.map((x) => ({
        id: x.id, name: x.name, publicId: x.public_id ?? null, level: x.level, totalPoints: str(x.total_points), isActive: x.is_active,
        createdAt: x.created_at, logoUrl: x.logo_url ?? null, members: x.members, owner: userBrief('o_', x),
      })),
    });
  });

  // ---------------- Bekleyen işler (menü rozetleri) ----------------
  router.get('/overview/pending', async (req, res) => {
    const support = (await query(
      `SELECT COUNT(*)::int AS n FROM (
         SELECT m.user_id FROM support_messages m WHERE m.from_staff = FALSE
           AND m.created_at > COALESCE((SELECT MAX(y.created_at) FROM support_messages y WHERE y.user_id = m.user_id AND y.from_staff = TRUE), 'epoch')
         GROUP BY m.user_id) x`,
    )).rows[0].n;
    if (req.user.system_role !== 'admin') return res.json({ support });
    const r = (await query(
      `SELECT (SELECT COUNT(*)::int FROM reports WHERE status = 'open') AS reports,
              (SELECT COUNT(*)::int FROM users WHERE kyc_status = 'pending') AS kyc,
              (SELECT COUNT(*)::int FROM agency_transfers WHERE status = 'pending_platform') AS transfers,
              (SELECT COUNT(*)::int FROM agency_applications WHERE status = 'pending') AS applications,
              (SELECT COUNT(*)::int FROM broadcasters WHERE status = 'pending') AS broadcasters,
              (SELECT COUNT(*)::int FROM client_errors WHERE created_at > NOW() - INTERVAL '24 hours') AS errors`,
    )).rows[0];
    res.json({ support, ...r });
  });
}
