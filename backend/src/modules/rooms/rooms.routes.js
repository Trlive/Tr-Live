// rooms modülünün rota girişi.
//
// Dosya 1196 satırdı; konularına bölündü. Burada yalnızca ortak ara katmanlar ve alt
// router'ların bağlanması var. Alt router'lar **ön ek olmadan** bağlanır: adresler değişmez.
//
// Alt dosyalar: rooms_mic.routes.js, rooms_moderation.routes.js, rooms_scoreboard.routes.js, rooms_media.routes.js
import { Router } from 'express';
import { ACTIVE_ROOM_BY_HOST, CUSTOM_KEY, IMAGE_TYPES, LIVE_SEATS, ROOM_HOT_COINS, SUPPORTED_SEATS, USER_PUBLIC_COLUMNS, USER_PUBLIC_JOINS, activeBan, activeEntranceEffect, activeRoom, assertRoomVisible, banMessage, checkPassword, cleanPublic, cleanTags, clientIp, closeMicSessions, closeRoom, express, fail, featuresFor, hashPassword, hitLimit, hub, isGhost, leaveOtherRooms, leaveRoom, leaveStaleRooms, loadPublicRow, loadPublicRows, memberOf, newRoomNumber, noteTask, noteViolation, notifyFriendsRoomOpen, openFromProfile, optionalAuth, ownerFamily, ownerPublic, profileOf, publicUser, query, recentlyKicked, refreshGhost, removeUpload, requireAuth, requireFeature, resolveRoomTheme, roomDiamonds, roomJson, roomUser, saveUpload, setCanPublish, skinUntil, syncProfile, text, tx, uniqueCode, userLimit, uuid } from './rooms.shared.js';
import { router as micRouter } from './rooms_mic.routes.js';
import { router as moderationRouter } from './rooms_moderation.routes.js';
import { router as scoreboardRouter } from './rooms_scoreboard.routes.js';
import { router as mediaRouter } from './rooms_media.routes.js';

export const router = Router();

router.get('/', optionalAuth, async (req, res) => {
  const type = req.query.type === 'video' ? 'video' : req.query.type === 'audio' ? 'audio' : null;
  const tag = req.query.tag ? String(req.query.tag).trim().toLocaleLowerCase('tr').slice(0, 20) : null;
  const q = String(req.query.q ?? '').trim().toLowerCase().slice(0, 40);
  const like = q ? `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%` : null;
  // Yoho gibi: oda kimliği = sahibinin kimliği. Rakamla aranınca sahibin normal / özel ID'si (veya eski oda numarası) tam eşleşir.
  const idq = /^\d{3,12}$/.test(q) ? q : null;
  // Bölge sekmeleri (uz / ar / in / eu: oda sahibinin bölgesi), eski 'tr' / 'other', takip ettiklerim, yakındakiler.
  const region = ['uz', 'ar', 'in', 'eu', 'tr', 'other', 'friends', 'near'].includes(req.query.region) ? req.query.region : null;
  if ((region === 'friends' || region === 'near') && !req.user) throw fail('Arkadaşları görmek için giriş yapın.', 401);
  // "Yeni yayıncı" süzgeci (Yoho): hesabı son 30 günde açılmış kişilerin odaları.
  const fresh = req.query.fresh === '1' || req.query.fresh === 'true';
  const r = await query(
    `SELECT r.id AS room_id, r.room_number, r.cover_url, r.announcement, r.theme_image_url,
       (SELECT COUNT(*)::int FROM lucky_bags lb WHERE lb.room_id = r.id AND lb.status = 'open' AND lb.expires_at > NOW()) AS bag_count, r.name AS room_name, r.room_type, r.layout AS room_layout, r.seat_count, r.owner_id, r.created_at AS room_created_at, r.tags,
       (r.password_hash IS NOT NULL) AS locked, r.theme, ${USER_PUBLIC_COLUMNS},
       -- Hayalet (SWIP) dinleyiciler sayılmaz; mikrofona çıkınca görünür olurlar.
       (SELECT COUNT(*)::int FROM room_members rm WHERE rm.room_id = r.id AND (rm.microphone OR rm.user_id NOT IN (SELECT id FROM active_ghosts))) AS member_count,
       (SELECT COUNT(*)::int FROM room_members rm WHERE rm.room_id = r.id AND rm.microphone = TRUE) AS mic_count,
       -- Sıralama (Yoho / Mico): son 30 ve 5 dakikada odada atılan hediyeler, PK sürüyor mu.
       (SELECT COALESCE(SUM(COALESCE(gt.diamond_amount, gt.coin_amount)), 0)::bigint FROM gift_transactions gt WHERE gt.room_id = r.id AND gt.created_at > NOW() - INTERVAL '30 minutes') AS gifts_30m,
       (SELECT COALESCE(SUM(COALESCE(gt.diamond_amount, gt.coin_amount)), 0)::bigint FROM gift_transactions gt WHERE gt.room_id = r.id AND gt.created_at > NOW() - INTERVAL '5 minutes') AS gifts_5m,
       (EXISTS (SELECT 1 FROM room_pk rp WHERE rp.room_id = r.id AND rp.status IN ('preparing','active'))
        OR EXISTS (SELECT 1 FROM pk_battles pb WHERE (pb.room_a = r.id OR pb.room_b = r.id) AND pb.status = 'active')) AS in_pk,
       -- Kartta üst üste binen üye avatarları (Yoho): önce mikrofondakiler; gizli kullanıcı ve hayalet dinleyici hariç.
       (SELECT COALESCE(json_agg(a.avatar_url), '[]'::json) FROM (
          SELECT mu.avatar_url FROM room_members rm2 JOIN users mu ON mu.id = rm2.user_id
          WHERE rm2.room_id = r.id AND mu.account_status = 'active' AND mu.is_hidden = FALSE AND mu.avatar_url IS NOT NULL
            AND (rm2.microphone OR rm2.user_id NOT IN (SELECT id FROM active_ghosts))
          ORDER BY rm2.microphone DESC, rm2.joined_at LIMIT 8) a) AS avatars
     FROM rooms r JOIN users u ON u.id = r.owner_id ${USER_PUBLIC_JOINS}
     WHERE r.is_active = TRUE AND ($1::text IS NULL OR r.room_type = $1) AND ($2::text IS NULL OR $2 = ANY(r.tags))
       AND (r.is_hidden = FALSE OR r.owner_id = $3::uuid OR EXISTS (SELECT 1 FROM room_members hm WHERE hm.room_id = r.id AND hm.user_id = $3::uuid))
       -- Gizli sahibin adıyla odası bulunmaz (gizli kimlik adla eşleşmesin).
       AND ($4::text IS NULL OR lower(r.name) LIKE $4 ESCAPE '\\' OR (u.is_hidden = FALSE AND (lower(u.display_name) LIKE $4 ESCAPE '\\' OR lower(u.username) LIKE $4 ESCAPE '\\'))
            OR EXISTS (SELECT 1 FROM unnest(r.tags) t WHERE lower(t) LIKE $4 ESCAPE '\\')
            OR ($7::text IS NOT NULL AND (r.room_number = $7
              -- Gizli kullanıcının kimliği odasıyla eşleştirilmez.
              OR (u.is_hidden = FALSE AND (u.public_id = $7
                OR EXISTS (SELECT 1 FROM special_ids si WHERE si.user_id = u.id AND si.special_id = $7 AND si.expires_at > NOW()))))))
       AND ($5::text IS NULL
            OR ($5 IN ('uz', 'ar', 'in', 'eu') AND u.region = $5)
            OR ($5 = 'tr' AND lower(COALESCE(u.country, '')) IN ('türkiye', 'turkiye', 'turkey', 'tr', 'türkiye cumhuriyeti'))
            OR ($5 = 'other' AND lower(COALESCE(u.country, '')) NOT IN ('türkiye', 'turkiye', 'turkey', 'tr', 'türkiye cumhuriyeti'))
            OR ($5 = 'friends' AND u.is_hidden = FALSE AND EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = $3::uuid AND f.followed_id = r.owner_id))
            OR ($5 = 'near' AND EXISTS (SELECT 1 FROM users me WHERE me.id = $3::uuid AND me.city IS NOT NULL AND lower(me.city) = lower(COALESCE(u.city, '')))))
       AND ($6::boolean IS FALSE OR u.created_at > NOW() - INTERVAL '30 days')
     ORDER BY member_count DESC, r.created_at DESC LIMIT 300`,
    [type, tag, req.user?.id ?? null, like, region, fresh, idq],
  );
  // Odalar puana göre sıralanır: kişi sayısı, mikrofondakiler, son 30 dakikadaki hediyeler ve PK; son 5 dakikada büyük
  // hediye atılan oda "yükseliyor" olur ve anında en üste çıkar.
  const scored = r.rows.map((x) => {
    const g30 = Number(x.gifts_30m ?? 0);
    const hot = Number(x.gifts_5m ?? 0) >= ROOM_HOT_COINS;
    const score = x.member_count * 10 + x.mic_count * 4 + Math.min(g30 / 500, 400) + (x.in_pk ? 60 : 0) + (hot ? 1000 : 0);
    return { x, hot, score };
  });
  scored.sort((a, b) => b.score - a.score || new Date(b.x.room_created_at) - new Date(a.x.room_created_at));
  // Kullanıcı sütunlarındaki "id" (= sahip kimliği) oda kimliğiyle karışmasın diye oda alanları takma adla alınır.
  res.json({
    rooms: scored.slice(0, 100).map(({ x, hot }) => ({
      id: x.room_id, roomNumber: x.room_number ?? null, coverUrl: x.cover_url ?? null, bagCount: x.bag_count, name: x.room_name, roomType: x.room_type, layout: x.room_layout === 'live' ? 'live' : 'grid', seatCount: x.seat_count, ownerId: x.owner_id, createdAt: x.room_created_at,
      memberCount: x.member_count, micCount: x.mic_count, tags: x.tags ?? [], locked: x.locked, theme: x.theme ?? 'default', themeImageUrl: x.theme_image_url ?? null,
      avatars: Array.isArray(x.avatars) ? x.avatars : [],
      inPk: x.in_pk === true, hot, recentGiftCoins: String(x.gifts_30m ?? 0),
      // Oda kartı oda bağlamıdır: gizli sahip "Gizli Kullanıcı" görünür.
      owner: roomUser(x, req.user?.id ?? null),
    })),
  });
});

// ---------- Kalıcı oda ----------
// Kullanıcı sesli ve görüntülü için birer kez oda kurar (ad, etiketler, koltuk düzeni, tema). Sonraki "oda aç"lar bu bilgilerle
// tek adımda açar; ad ve etiketler yalnızca oda içinden (oda adına dokunarak) değiştirilir.

// Kayıtlı odalarım ve şu an açık olanlar.
router.get('/mine', requireAuth, async (req, res) => {
  const profiles = (await query(`SELECT * FROM room_profiles WHERE owner_id = $1`, [req.user.id])).rows;
  const active = (await query(`SELECT id, room_type FROM rooms WHERE owner_id = $1 AND is_active = TRUE`, [req.user.id])).rows;
  const out = {};
  for (const type of ['audio', 'video']) {
    const p = profiles.find((x) => x.room_type === type);
    out[type] = p ? { ...profileJson(p), activeRoomId: active.find((x) => x.room_type === type)?.id ?? null } : null;
  }
  res.json({ rooms: out });
});

// Oda aç: kayıtlı oda varsa doğrudan açar; yoksa gövdedeki bilgilerle bir kez kurar.
// "Yayın başlat" ekranı setup: true gönderir: kayıtlı odanın bilgileri (ad, etiket, duyuru, koltuk, düzen, tema) de güncellenir.
// setup gönderilmeyen eski istekler kayıtlı bilgilere dokunmaz (gövdedeki ad yok sayılır).

// Oda aç: kayıtlı oda varsa doğrudan açar; yoksa gövdedeki bilgilerle bir kez kurar.
// "Yayın başlat" ekranı setup: true gönderir: kayıtlı odanın bilgileri (ad, etiket, duyuru, koltuk, düzen, tema) de güncellenir.
// setup gönderilmeyen eski istekler kayıtlı bilgilere dokunmaz (gövdedeki ad yok sayılır).
router.post('/', requireAuth, userLimit('room_create', 20, 3600e3), async (req, res) => {
  const b = req.body ?? {};
  const roomType = b.roomType === 'video' ? 'video' : 'audio';
  const userId = req.user.id;
  let profile = await profileOf(userId, roomType);
  let setupThemeImage; // özel tema görseli (undefined: dokunma)
  if (!profile || b.setup === true) {
    const name = cleanPublic(text(b.name, 'Oda adı', { min: 2, max: 60, required: true }), 'Oda adı');
    const tags = cleanTags(b.tags);
    const layout = roomType === 'video' && b.layout === 'live' ? 'live' : 'grid';
    let seatCount = Number(b.seatCount ?? profile?.seat_count ?? (roomType === 'video' ? 9 : 8));
    if (layout === 'live') seatCount = LIVE_SEATS;
    if (!SUPPORTED_SEATS.has(seatCount)) throw fail('Geçersiz koltuk sayısı.');
    // Tema: sahibin kullanabildiği bir tema olmalı (Coin'li → süresi devam eden hak; özel → onaylı özel tema).
    const rt = b.theme === undefined ? null : await resolveRoomTheme(userId, b.theme, query, { preferImage: profile?.theme === CUSTOM_KEY ? profile.theme_image_url : null });
    const theme = rt ? rt.theme : (profile?.theme ?? 'default');
    setupThemeImage = rt ? (rt.imageUrl ?? (profile?.theme === CUSTOM_KEY ? null : undefined)) : undefined;
    const announcement = b.announcement === undefined
      ? (profile?.announcement ?? null)
      : (cleanPublic(text(b.announcement ?? '', 'Duyuru', { min: 0, max: 200 }), 'Duyuru') || null);
    profile = (await query(
      `INSERT INTO room_profiles(owner_id, room_type, name, tags, seat_count, theme, room_number, announcement, layout) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (owner_id, room_type) DO UPDATE SET name = EXCLUDED.name, tags = EXCLUDED.tags, seat_count = EXCLUDED.seat_count, theme = EXCLUDED.theme,
         announcement = EXCLUDED.announcement, layout = EXCLUDED.layout, updated_at = NOW()
       RETURNING *`,
      [userId, roomType, name, tags, seatCount, theme, profile?.room_number ?? await newRoomNumber(), announcement, layout],
    )).rows[0];
  }
  if (setupThemeImage !== undefined && profile) {
    profile = (await query(`UPDATE room_profiles SET theme_image_url = $3, updated_at = NOW() WHERE owner_id = $1 AND room_type = $2 RETURNING *`, [userId, roomType, setupThemeImage])).rows[0] ?? profile;
  }
  // Tek oda kuralı: kendi odasını açan kişi bulunduğu diğer odalardan çıkar (açık odasına dönüyorsa o oda hariç).
  const already = (await query(`SELECT id FROM rooms WHERE owner_id = $1 AND room_type = $2 AND is_active = TRUE LIMIT 1`, [userId, roomType])).rows[0];
  await leaveOtherRooms(userId, already?.id ?? null);
  const { room, created } = await openFromProfile(userId, profile, b.hidden === true);
  res.status(created ? 201 : 200).json({ room: roomJson(room, { showCode: true }), created });
  // Yeni açılan (gizli olmayan) odada arkadaşlara bildirim. Gizli kullanıcı / hayalet modda gönderilmez.
  if (created && !room.is_hidden && !req.user.is_hidden && !(await isGhost(userId).catch(() => true))) {
    notifyFriendsRoomOpen(req.user, room);
  }
});

// Oda yöneticileri (oda kapalıyken de kalıcı). Oda sahibi ilk sırada.

// Oda yöneticileri (oda kapalıyken de kalıcı). Oda sahibi ilk sırada.
router.get('/:roomId/managers', requireAuth, async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  const room = await activeRoom(roomId);
  await assertRoomVisible(room, req.user.id);
  const r = await query(
    `SELECT s.role, ${USER_PUBLIC_COLUMNS}
     FROM room_staff s JOIN users u ON u.id = s.user_id ${USER_PUBLIC_JOINS}
     WHERE s.owner_id = $1 AND s.room_type = $2 AND u.account_status = 'active'
     ORDER BY (s.role = 'cohost') DESC, s.created_at`,
    [room.owner_id, room.room_type],
  );
  const owner = (await loadPublicRows([room.owner_id]))[0];
  res.json({
    managers: [
      ...(owner ? [{ role: 'owner', user: roomUser(owner, req.user.id) }] : []),
      ...r.rows.map((m) => ({ role: m.role, user: roomUser(m, req.user.id) })),
    ],
  });
});

// ---------- Favori yayıncılar ve son girilen odalar ----------
// Oda kapanınca silindiği için favori "oda" değil "yayıncı"dır; yayıncı yeni oda açınca listede açık görünür.

router.get('/favorites', requireAuth, async (req, res) => {
  const r = await query(
    `SELECT ${USER_PUBLIC_COLUMNS}, ${ACTIVE_ROOM_BY_HOST} AS room, f.created_at AS fav_at
     FROM favorite_hosts f JOIN users u ON u.id = f.host_id ${USER_PUBLIC_JOINS}
     CROSS JOIN LATERAL (SELECT f.host_id) h
     WHERE f.user_id = $1 AND u.account_status = 'active'
     ORDER BY (SELECT 1 FROM rooms r WHERE r.owner_id = f.host_id AND r.is_active = TRUE AND r.is_hidden = FALSE AND NOT u.is_hidden LIMIT 1) NULLS LAST, f.created_at DESC LIMIT 200`,
    [req.user.id],
  );
  // Gizli moddaki yayıncının açık odası gösterilmez (kim olduğu bilinen listede hangi odada olduğu anlaşılmasın).
  res.json({ hosts: r.rows.map((x) => ({ user: publicUser(x, req.user.id), room: x.is_hidden ? null : x.room })) });
});

router.get('/recent', requireAuth, async (req, res) => {
  const r = await query(
    `SELECT ${USER_PUBLIC_COLUMNS}, rr.room_name, rr.room_type, rr.visited_at, ${ACTIVE_ROOM_BY_HOST} AS room
     FROM recent_rooms rr JOIN users u ON u.id = rr.host_id ${USER_PUBLIC_JOINS}
     CROSS JOIN LATERAL (SELECT rr.host_id) h
     WHERE rr.user_id = $1 AND u.account_status = 'active' ORDER BY rr.visited_at DESC LIMIT 30`,
    [req.user.id],
  );
  res.json({ recent: r.rows.map((x) => ({ user: publicUser(x, req.user.id), roomName: x.room_name, roomType: x.room_type, visitedAt: x.visited_at, room: x.is_hidden ? null : x.room })) });
});

router.post('/hosts/:userId/favorite', requireAuth, userLimit('favorite', 60, 60e3), async (req, res) => {
  const hostId = uuid(req.params.userId, 'Yayıncı');
  if (hostId === req.user.id) throw fail('Kendinizi favorilere ekleyemezsiniz.');
  const h = (await query(`SELECT is_hidden FROM users WHERE id = $1 AND account_status = 'active'`, [hostId])).rows[0];
  if (!h) throw fail('Kullanıcı bulunamadı.', 404);
  // Gizli sahibin odasından favoriye eklenemez (favoriler listesi gizli kimliği ele vermesin).
  if (h.is_hidden) throw fail('Bu yayıncı şu an favorilere eklenemez.', 403);
  const n = (await query(`SELECT COUNT(*)::int AS n FROM favorite_hosts WHERE user_id = $1`, [req.user.id])).rows[0].n;
  if (n >= 200) throw fail('En fazla 200 favori ekleyebilirsiniz.', 409);
  await query(`INSERT INTO favorite_hosts(user_id, host_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, [req.user.id, hostId]);
  res.json({ ok: true, favorite: true });
});

router.delete('/hosts/:userId/favorite', requireAuth, async (req, res) => {
  const hostId = uuid(req.params.userId, 'Yayıncı');
  await query(`DELETE FROM favorite_hosts WHERE user_id = $1 AND host_id = $2`, [req.user.id, hostId]);
  res.json({ ok: true, favorite: false });
});

router.get('/hosts/:userId/favorite', requireAuth, async (req, res) => {
  const hostId = uuid(req.params.userId, 'Yayıncı');
  const r = await query(`SELECT 1 FROM favorite_hosts WHERE user_id = $1 AND host_id = $2`, [req.user.id, hostId]);
  res.json({ favorite: r.rowCount > 0 });
});

router.get('/:roomId', requireAuth, async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  const r = (await query(
    `SELECT r.id AS room_id, r.room_number, r.cover_url, r.announcement, r.name AS room_name, r.room_type, r.seat_count, r.owner_id, r.created_at AS room_created_at, r.tags, r.chat_enabled,
       r.is_hidden AS room_hidden, r.join_code, r.theme, r.theme_image_url, r.scoreboard_enabled, r.locked_seats, r.muted_seats, r.mic_request, r.mic_skin, r.mic_skin_text,
       (r.password_hash IS NOT NULL) AS locked, ${USER_PUBLIC_COLUMNS}
     FROM rooms r JOIN users u ON u.id = r.owner_id ${USER_PUBLIC_JOINS} WHERE r.id = $1 AND r.is_active = TRUE`,
    [roomId],
  )).rows[0];
  if (!r) throw fail('Oda bulunamadı.', 404);
  const me = await memberOf(roomId, req.user.id);
  if (r.room_hidden && !me && r.owner_id !== req.user.id) throw fail('Oda bulunamadı.', 404);
  const canSeeCode = me && ['owner', 'cohost'].includes(me.role);
  res.json({
    room: {
      id: r.room_id, roomNumber: r.room_number ?? null, coverUrl: r.cover_url ?? null, announcement: r.announcement ?? '', name: r.room_name, roomType: r.room_type, seatCount: r.seat_count, ownerId: r.owner_id, createdAt: r.room_created_at,
      tags: r.tags ?? [], locked: r.locked, chatEnabled: r.chat_enabled !== false,
      hidden: r.room_hidden, theme: r.theme, themeImageUrl: r.theme_image_url, scoreboardEnabled: r.scoreboard_enabled, lockedSeats: r.locked_seats ?? [], mutedSeats: r.muted_seats ?? [], micRequest: r.mic_request === true,
      micSkin: r.mic_skin ?? null, micSkinText: r.mic_skin_text ?? null,
      ...(canSeeCode && r.join_code ? { joinCode: r.join_code } : {}),
      owner: roomUser(r, req.user.id), ownerFamily: await ownerFamily(r.owner_id),
    },
    me: me ? { role: me.role, microphone: me.microphone, seatIndex: me.seat_index } : null,
  });
});

// ---------- Katılma / ayrılma ----------
// Gizli odaya davet koduyla ulaşılır. Kaba kuvvet denemelerine karşı sıkı sınır vardır.

// ---------- Katılma / ayrılma ----------
// Gizli odaya davet koduyla ulaşılır. Kaba kuvvet denemelerine karşı sıkı sınır vardır.
router.post('/by-code', requireAuth, userLimit('room_code', 15, 10 * 60e3), async (req, res) => {
  const code = String(req.body?.code ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) throw fail('Davet kodu 6 karakter olmalı.');
  const r = (await query(`SELECT id, name FROM rooms WHERE join_code = $1 AND is_active = TRUE`, [code])).rows[0];
  if (!r) {
    noteViolation(clientIp(req), 'room_code_guess', { userId: req.user.id, weight: 1 });
    throw fail('Bu koda ait oda bulunamadı.', 404);
  }
  res.json({ roomId: r.id, name: r.name });
});

router.post('/:roomId/join', requireAuth, userLimit('room_join', 40, 60e3), async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  const userId = req.user.id;
  const room = await activeRoom(roomId);
  if (room.is_hidden && room.owner_id !== userId && !(await memberOf(roomId, userId))) {
    const code = String(req.body?.code ?? '').trim().toUpperCase();
    if (!code || code !== room.join_code) throw fail('Bu oda gizli; davet kodu gerekli.', 403);
  }
  const blocked = await query(`SELECT 1 FROM room_blocks WHERE room_id = $1 AND blocked_user_id = $2`, [roomId, userId]);
  if (blocked.rowCount) throw fail('Bu odaya girişiniz engellenmiş.', 403);
  // Atılma (24 saat) ve engelleme yasağı kalıcı odaya bağlıdır: oda kapatılıp yeniden açılsa da sürer.
  if (room.owner_id !== userId) {
    const ban = await activeBan(room, userId);
    if (ban) throw fail(banMessage(ban), 403);
  }

  // Şifreli oda: zaten üye olanlar (yeniden bağlanma) ve oda sahibi şifre girmeden geçer.
  if (room.password_hash && room.owner_id !== userId && !(await memberOf(roomId, userId))) {
    if (!hitLimit(`roompw:${roomId}:${userId}`, 5, 10 * 60e3).allowed) {
      noteViolation(clientIp(req), 'room_password_bruteforce', { userId, weight: 3 });
      throw fail('Çok fazla hatalı şifre denemesi. Biraz sonra tekrar deneyin.', 429);
    }
    const pw = String(req.body?.password ?? '');
    if (!pw || !(await checkPassword(pw, room.password_hash))) throw fail('Oda şifresi hatalı.', 403);
  }

  // Tek oda kuralı (Yoho): yeni odaya giren kişi önceki odalarından çıkar; sahibi olduğu oda, içeride yönetici yoksa kapanır.
  // Uygulamanın kendiliğinden yeniden bağlanması (rejoin) ise kişi bu arada başka odaya geçtiyse onu geri çekmez.
  // Odadan atılan kişi de kendiliğinden geri girmez (atılma bildirimi kaçsa bile).
  if (req.body?.rejoin === true && !(await memberOf(roomId, userId))) {
    if (recentlyKicked(roomId, userId)) throw fail('Odadan çıkarıldınız.', 403);
    const elsewhere = await query(
      `SELECT 1 FROM room_members m JOIN rooms r ON r.id = m.room_id AND r.is_active WHERE m.user_id = $1 AND m.room_id <> $2 LIMIT 1`,
      [userId, roomId],
    );
    if (elsewhere.rowCount) throw fail('Başka bir odaya geçtiğin için bu odadan çıktın.', 409);
  }
  await leaveOtherRooms(userId, roomId);
  // WIP ayrıcalığı bitmiş gizli kullanıcı: hiçbir odada değilken (kimse eşleştiremez) gizlilik odaya girmeden kapanır;
  // böylece odadan odaya geçerek gizli kalınamaz.
  if (req.user.is_hidden && req.user.system_role !== 'admin' && !(await featuresFor(userId)).hiddenUser) {
    const off = await query(
      `UPDATE users SET is_hidden = FALSE, updated_at = NOW() WHERE id = $1 AND is_hidden = TRUE
         AND NOT EXISTS (SELECT 1 FROM room_members WHERE user_id = $1)
         AND NOT EXISTS (SELECT 1 FROM rooms WHERE owner_id = $1 AND is_active = TRUE)`,
      [userId],
    );
    if (off.rowCount) {
      req.user.is_hidden = false;
      await refreshGhost(userId);
    }
  }
  const staffRole = room.owner_id === userId ? null
    : (await query(`SELECT role FROM room_staff WHERE owner_id = $1 AND room_type = $2 AND user_id = $3`, [room.owner_id, room.room_type, userId])).rows[0]?.role ?? null;
  const ins = await query(
    `INSERT INTO room_members(room_id, user_id, role) VALUES($1,$2,$3) ON CONFLICT (room_id, user_id) DO NOTHING RETURNING user_id`,
    [roomId, userId, room.owner_id === userId ? 'owner' : (staffRole ?? 'user')],
  );
  // Zaten üyeydi (uygulama kapanıp açıldı / yeniden katıldı): "canlı" işareti tazelenir. Tazelenmezse eski işaretle
  // giren kişi, soket aboneliği kurulmadan çalışan temizleyiciye denk gelip odaya girer girmez çıkarılabiliyordu.
  if (!ins.rowCount) {
    await query(`UPDATE room_members SET last_seen_at = NOW() WHERE room_id = $1 AND user_id = $2`, [roomId, userId]);
  }
  // Sahip, yönetici sayesinde açık kalan odasına döndü: yayın süresi sayımı yeniden başlar (onaylı yayıncıysa).
  if (ins.rowCount && room.owner_id === userId) {
    await query(
      `INSERT INTO broadcast_sessions(user_id, room_id, agency_id)
       SELECT b.user_id, $2, b.agency_id FROM broadcasters b
       WHERE b.user_id = $1 AND b.status = 'approved'
         AND NOT EXISTS (SELECT 1 FROM broadcast_sessions s WHERE s.room_id = $2 AND s.user_id = $1 AND s.ended_at IS NULL)`,
      [userId, roomId],
    );
  }
  // Giren kişi kendi aracını da görsün: duyuru, uygulama odaya abone olmadan önce gittiği için yanıtla da döner.
  let myEntrance = null;
  if (ins.rowCount && !(await isGhost(userId))) {
    const row = await loadPublicRow(userId);
    // Gizli kullanıcı odaya giriş efektiyle duyurulmaz. Hayalet (SWIP) kullanıcı hiç duyurulmaz.
    const effect = row.is_hidden ? null : await activeEntranceEffect(userId);
    hub.broadcastRoom(roomId, { type: 'room_member_joined', roomId, user: roomUser(row, null), entranceEffect: effect });
    if (effect) myEntrance = { user: roomUser(row, userId), effect };
  } else if (!(await isGhost(userId))) {
    // Zaten üyeydi (ör. uygulama kapanıp açıldı): başkalarına tekrar duyurulmaz ama kişi kendi aracını görür.
    const row = await loadPublicRow(userId);
    const effect = row && !row.is_hidden ? await activeEntranceEffect(userId) : null;
    if (effect) myEntrance = { user: roomUser(row, userId), effect };
  }
  // Sahibi gizli moddaysa "son odalar"a yazılmaz (sonradan kimin odası olduğu anlaşılmasın).
  if (room.owner_id !== userId && !room.is_hidden) {
    await query(
      `INSERT INTO recent_rooms(user_id, host_id, room_name, room_type) SELECT $1,$2,$3,$4 WHERE NOT (SELECT is_hidden FROM users WHERE id = $2)
       ON CONFLICT (user_id, host_id) DO UPDATE SET room_name = EXCLUDED.room_name, room_type = EXCLUDED.room_type, visited_at = NOW()`,
      [userId, room.owner_id, room.name, room.room_type],
    );
    await query(
      `DELETE FROM recent_rooms WHERE user_id = $1 AND host_id NOT IN (SELECT host_id FROM recent_rooms WHERE user_id = $1 ORDER BY visited_at DESC LIMIT 30)`,
      [userId],
    );
  }
  // Birbirinden bağımsız 4 okuma aynı anda (odaya giriş yanıtı daha çabuk döner).
  const [me, totalDiamonds, family, owner] = await Promise.all([
    memberOf(roomId, userId), roomDiamonds(room), ownerFamily(room.owner_id), ownerPublic(room.owner_id, userId),
  ]);
  noteTask(userId, 'join_room');
  res.json({
    room: {
      ...roomJson(room, { showCode: ['owner', 'cohost'].includes(me.role) }), totalDiamonds,
      ownerFamily: family,
      // Oda kimliği = sahibin güncel kimliği (Yoho): sahip odada olmasa da başlıkta onun ID'si görünsün.
      owner,
    },
    me: { role: me.role, microphone: me.microphone, seatIndex: me.seat_index },
    joined: ins.rowCount > 0,
    entrance: myEntrance,
  });
});

// Oda ayarları: ad, etiketler, şifre, sohbet açık/kapalı (oda sahibi ve yardımcı sahip).

// Oda ayarları: ad, etiketler, şifre, sohbet açık/kapalı (oda sahibi ve yardımcı sahip).
router.patch('/:roomId', requireAuth, userLimit('room_settings', 20, 60e3), async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  const before = await activeRoom(roomId);
  const me = await memberOf(roomId, req.user.id);
  if (!me || !['owner', 'cohost'].includes(me.role)) throw fail('Oda ayarlarını yalnızca oda sahibi ve yardımcı sahip değiştirebilir.', 403);
  const sets = []; const values = [];
  const set = (col, v) => { values.push(v); sets.push(`${col} = $${values.length}`); };
  const b = req.body ?? {};
  if (b.name !== undefined) set('name', cleanPublic(text(b.name, 'Oda adı', { min: 2, max: 60, required: true }), 'Oda adı'));
  if (b.tags !== undefined) set('tags', cleanTags(b.tags));
  if (b.announcement !== undefined) set('announcement', cleanPublic(text(b.announcement ?? '', 'Duyuru', { min: 0, max: 200 }), 'Duyuru') || null);
  if (b.chatEnabled !== undefined) { if (typeof b.chatEnabled !== 'boolean') throw fail('chatEnabled true/false olmalı.'); set('chat_enabled', b.chatEnabled); }
  // Tema hakları odanın sahibine aittir (yardımcı sahip, sahibin temalarını kullanabilir).
  let themeImg; // undefined: görsele dokunma
  // "custom:<id>": başka bir özel temaya geçiş (theme yine "custom", görsel değişir).
  if (b.theme !== undefined && (b.theme !== before.theme || String(b.theme).startsWith(`${CUSTOM_KEY}:`))) {
    const rt = await resolveRoomTheme(before.owner_id, b.theme);
    set('theme', rt.theme);
    if (rt.imageUrl) themeImg = rt.imageUrl;
    else if (before.theme === CUSTOM_KEY) themeImg = null; // özel temadan çıkınca özel görsel kalkar
  }
  // Ayar penceresi mevcut görseli geri gönderebilir: değişmemişse yok sayılır; özel temada görseli tema belirler.
  if (b.themeImageUrl !== undefined && (themeImg !== undefined || (b.themeImageUrl ?? null) === (before.theme_image_url ?? null))) delete b.themeImageUrl;
  if (b.micRequest !== undefined) { if (typeof b.micRequest !== 'boolean') throw fail('micRequest true/false olmalı.'); set('mic_request', b.micRequest); }
  let newSeats = null;
  if (b.seatCount !== undefined) {
    if (before.layout === 'live') throw fail('Canlı yayında konuk sayısı sabittir.');
    newSeats = Number(b.seatCount);
    if (!SUPPORTED_SEATS.has(newSeats)) throw fail('Geçersiz koltuk sayısı.');
    if (newSeats !== before.seat_count && (await query(`SELECT 1 FROM room_pk WHERE room_id = $1 AND status IN ('preparing','active')`, [roomId])).rowCount) {
      throw fail('PK modu açıkken mikrofon modu değiştirilemez; önce PK modunu kapatın.', 409);
    }
    set('seat_count', newSeats);
    set('locked_seats', (before.locked_seats ?? []).filter((i) => i < newSeats)); // kalkan koltukların kilidi de kalkar
    set('muted_seats', (before.muted_seats ?? []).filter((i) => i < newSeats));
  }
  // Özel mikrofon modu tasarımı (ör. Doğum günü): yalnızca oda sahibi, süresi olan hakla. Koltuk sayısı tasarıma göre ayarlanır.
  if (b.micSkin !== undefined) {
    if (me.role !== 'owner') throw fail('Mikrofon tasarımını yalnızca oda sahibi seçebilir.', 403);
    if (b.micSkin === null || b.micSkin === '') {
      set('mic_skin', null); set('mic_skin_text', null)
    } else {
      if (before.layout === 'live') throw fail('Canlı yayında mikrofon tasarımı kullanılamaz.');
      if (b.seatCount !== undefined) throw fail('Tasarım ve koltuk sayısı birlikte değiştirilemez.');
      const skin = (await query(`SELECT * FROM mic_skins WHERE key = $1 AND is_active = TRUE`, [String(b.micSkin)])).rows[0];
      if (!skin) throw fail('Tasarım bulunamadı.', 404);
      if (!(await skinUntil(req.user.id, skin.key))) throw fail('Bu tasarımın süresi yok. Önce satın alın.', 403);
      newSeats = skin.seat_count;
      if (newSeats !== before.seat_count && (await query(`SELECT 1 FROM room_pk WHERE room_id = $1 AND status IN ('preparing','active')`, [roomId])).rowCount) {
        throw fail('PK modu açıkken mikrofon modu değiştirilemez; önce PK modunu kapatın.', 409);
      }
      set('mic_skin', skin.key);
      set('seat_count', newSeats);
      set('locked_seats', (before.locked_seats ?? []).filter((i) => i < newSeats));
      set('muted_seats', (before.muted_seats ?? []).filter((i) => i < newSeats));
    }
  } else if (b.seatCount !== undefined && before.mic_skin) {
    // Normal bir mikrofon moduna geçilince özel tasarım kapanır.
    set('mic_skin', null); set('mic_skin_text', null)
  }
  if (b.micSkinText !== undefined) {
    if (me.role !== 'owner') throw fail('Yazıyı yalnızca oda sahibi değiştirebilir.', 403);
    set('mic_skin_text', cleanPublic(text(b.micSkinText ?? '', 'Yazı', { min: 0, max: 40 }), 'Yazı') || null);
  }
  if (b.themeImageUrl !== undefined) {
    if (b.themeImageUrl !== null && b.themeImageUrl !== '') {
      await requireFeature(req.user.id, 'customRoomTheme', 'Özel tema görseli');
      const u = String(b.themeImageUrl);
      if (u.length > 500 || !/^https:\/\//.test(u)) throw fail('Tema görseli https adresi olmalı.');
      set('theme_image_url', u);
    } else set('theme_image_url', null);
  }
  if (themeImg !== undefined) set('theme_image_url', themeImg);
  if (b.scoreboardEnabled !== undefined) { if (typeof b.scoreboardEnabled !== 'boolean') throw fail('scoreboardEnabled true/false olmalı.'); set('scoreboard_enabled', b.scoreboardEnabled); }
  if (b.hidden !== undefined) {
    if (typeof b.hidden !== 'boolean') throw fail('hidden true/false olmalı.');
    if (me.role !== 'owner') throw fail('Odayı yalnızca oda sahibi gizleyebilir.', 403);
    const cur = await activeRoom(roomId);
    set('is_hidden', b.hidden);
    if (!b.hidden) set('join_code', null);
    else if (!cur.is_hidden || cur.join_code === null || b.regenerateCode === true) set('join_code', await uniqueCode(query));
  } else if (b.regenerateCode === true) {
    const cur = await activeRoom(roomId);
    if (!cur.is_hidden) throw fail('Davet kodu yalnızca gizli odalarda vardır.');
    if (me.role !== 'owner') throw fail('Kodu yalnızca oda sahibi yenileyebilir.', 403);
    set('join_code', await uniqueCode(query));
  }
  if (b.password !== undefined) {
    if (me.role !== 'owner') throw fail('Oda şifresini yalnızca oda sahibi değiştirebilir.', 403);
    set('password_hash', b.password === null || b.password === '' ? null : await hashPassword(text(b.password, 'Oda şifresi', { min: 4, max: 12, required: true })));
  }
  if (!sets.length) throw fail('Değiştirilecek alan yok.');
  values.push(roomId);
  const r = await tx(async (c) => {
    if (newSeats !== null && newSeats !== before.seat_count) {
      // Oda satırı kilitlenip PK yeniden denetlenir: aynı anda açılan PK modu ile yarışmasın (PK 9'lu koltuk ister).
      await c.query(`SELECT 1 FROM rooms WHERE id = $1 FOR UPDATE`, [roomId]);
      if ((await c.query(`SELECT 1 FROM room_pk WHERE room_id = $1 AND status IN ('preparing','active')`, [roomId])).rowCount) {
        throw fail('PK modu açıkken mikrofon modu değiştirilemez; önce PK modunu kapatın.', 409);
      }
    }
    return (await c.query(`UPDATE rooms SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`, values)).rows[0];
  });
  // Kalıcı oda bilgisi: oda içindeki tüm ayarlar bir sonraki açılış için saklanır.
  await syncProfile(r);
  // Koltuk sayısı azaldıysa taşan koltuklardakiler dinleyiciye iner (mikrofonları kapanır).
  if (newSeats !== null && newSeats < before.seat_count) {
    const gone = (await query(
      `UPDATE room_members SET seat_index = NULL, microphone = FALSE WHERE room_id = $1 AND seat_index >= $2 RETURNING user_id`,
      [roomId, newSeats],
    )).rows;
    for (const g of gone) {
      await closeMicSessions(g.user_id, roomId);
      await setCanPublish(roomId, g.user_id, false);
      hub.broadcastRoom(roomId, { type: 'room_seat_changed', roomId, userId: g.user_id, seatIndex: null, microphone: false });
      if (await isGhost(g.user_id)) hub.broadcastRoom(roomId, { type: 'room_member_left', roomId, userId: g.user_id, ghost: true });
    }
  }
  hub.broadcastRoom(roomId, {
    type: 'room_settings', roomId, name: r.name, tags: r.tags, locked: Boolean(r.password_hash), chatEnabled: r.chat_enabled,
    theme: r.theme, themeImageUrl: r.theme_image_url, scoreboardEnabled: r.scoreboard_enabled, hidden: r.is_hidden,
    seatCount: r.seat_count, lockedSeats: r.locked_seats ?? [], announcement: r.announcement ?? '', coverUrl: r.cover_url ?? null, micRequest: r.mic_request === true,
    micSkin: r.mic_skin ?? null, micSkinText: r.mic_skin_text ?? null,
  });
  res.json({ room: roomJson(r, { showCode: true }) });
});

// Oda kapak fotoğrafı (oda sahibi / yardımcı sahip).

// Oda kapak fotoğrafı (oda sahibi / yardımcı sahip).
router.put('/:roomId/cover', requireAuth, userLimit('room_cover', 10, 10 * 60e3), async (req, _res, next) => {
  // Yetki, gövde belleğe alınmadan önce denetlenir.
  const me = await memberOf(uuid(req.params.roomId, 'Oda'), req.user.id);
  if (!me || !['owner', 'cohost'].includes(me.role)) throw fail('Kapak fotoğrafını yalnızca oda sahibi ve yardımcı sahip değiştirebilir.', 403);
  next();
}, express.raw({ type: Object.keys(IMAGE_TYPES), limit: '3mb' }), async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  const before = await activeRoom(roomId);
  const me = await memberOf(roomId, req.user.id);
  if (!me || !['owner', 'cohost'].includes(me.role)) throw fail('Kapak fotoğrafını yalnızca oda sahibi ve yardımcı sahip değiştirebilir.', 403);
  const url = await saveUpload(req, 'room_cover');
  await query(`UPDATE rooms SET cover_url = $2 WHERE id = $1`, [roomId, url]);
  await query(`UPDATE room_profiles SET cover_url = $3, updated_at = NOW() WHERE owner_id = $1 AND room_type = $2`, [before.owner_id, before.room_type, url]);
  await removeUpload(before.cover_url);
  hub.broadcastRoom(roomId, { type: 'room_settings', roomId, name: before.name, tags: before.tags, locked: Boolean(before.password_hash), chatEnabled: before.chat_enabled,
    theme: before.theme, themeImageUrl: before.theme_image_url, scoreboardEnabled: before.scoreboard_enabled, hidden: before.is_hidden,
    seatCount: before.seat_count, lockedSeats: before.locked_seats ?? [], announcement: before.announcement ?? '', coverUrl: url, micRequest: before.mic_request === true });
  res.json({ url });
});

// Yönetici silme: odada olmasa da kalıcı yönetici listesinden çıkarır (yalnızca oda sahibi).

// Yönetici silme: odada olmasa da kalıcı yönetici listesinden çıkarır (yalnızca oda sahibi).
router.delete('/:roomId/staff/:userId', requireAuth, userLimit('moderate', 60, 60e3), async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  const targetId = uuid(req.params.userId, 'Kullanıcı');
  const room = await activeRoom(roomId);
  if (room.owner_id !== req.user.id) throw fail('Yöneticileri yalnızca oda sahibi çıkarabilir.', 403);
  await query(`DELETE FROM room_staff WHERE owner_id = $1 AND room_type = $2 AND user_id = $3`, [room.owner_id, room.room_type, targetId]);
  const upd = await query(`UPDATE room_members SET role = 'user' WHERE room_id = $1 AND user_id = $2 AND role IN ('moderator','cohost')`, [roomId, targetId]);
  if (upd.rowCount) hub.broadcastRoom(roomId, { type: 'room_role_changed', roomId, userId: targetId, role: 'user' });
  res.json({ ok: true });
});

// Katkı listesi: odaya en çok hediye gönderenler (son 24 saat / toplam = ömür boyu).
// Oda her açılışta yeni kayıt aldığı için toplam, aynı sahibin aynı tür odalarının hepsinden hesaplanır
// (oda kapanıp açılınca liste sıfırlanmaz).

// Katkı listesi: odaya en çok hediye gönderenler (son 24 saat / toplam = ömür boyu).
// Oda her açılışta yeni kayıt aldığı için toplam, aynı sahibin aynı tür odalarının hepsinden hesaplanır
// (oda kapanıp açılınca liste sıfırlanmaz).
router.get('/:roomId/contributions', requireAuth, async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  const room = await activeRoom(roomId);
  await assertRoomVisible(room, req.user.id);
  const day = req.query.range === 'day';
  const r = await query(
    `SELECT ${USER_PUBLIC_COLUMNS}, g.total
     FROM (SELECT gt.sender_id, SUM(COALESCE(gt.diamond_amount, gt.coin_amount))::bigint AS total FROM gift_transactions gt
           WHERE gt.room_id IN (SELECT id FROM rooms WHERE owner_id = $1 AND room_type = $2)
             AND ($3::boolean = FALSE OR gt.created_at > NOW() - INTERVAL '24 hours')
           GROUP BY gt.sender_id ORDER BY total DESC LIMIT 50) g
     JOIN users u ON u.id = g.sender_id ${USER_PUBLIC_JOINS} WHERE u.account_status = 'active' ORDER BY g.total DESC`,
    [room.owner_id, room.room_type, day],
  );
  res.json({ contributions: r.rows.map((x) => ({ user: roomUser(x, req.user.id), total: String(x.total) })) });
});

router.post('/:roomId/leave', requireAuth, async (req, res) => {
  await leaveRoom(req.user.id, uuid(req.params.roomId, 'Oda'));
  res.json({ ok: true });
});

// Uygulama açılışında: bu kişinin, hiçbir cihazında bağlı olmadığı eski oda üyelikleri temizlenir (uygulama kapanınca
// eski odada asılı kalmasın; sahibi olduğu oda içeride yönetici yoksa kapanır). Başka cihazda gerçekten odadaysa dokunulmaz.

// Uygulama açılışında: bu kişinin, hiçbir cihazında bağlı olmadığı eski oda üyelikleri temizlenir (uygulama kapanınca
// eski odada asılı kalmasın; sahibi olduğu oda içeride yönetici yoksa kapanır). Başka cihazda gerçekten odadaysa dokunulmaz.
router.post('/leave-stale', requireAuth, userLimit('room_leave_stale', 10, 60e3), async (req, res) => {
  res.json({ ok: true, left: await leaveStaleRooms(req.user.id) });
});

router.post('/:roomId/close', requireAuth, async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  const room = await activeRoom(roomId);
  if (room.owner_id !== req.user.id) throw fail('Odayı yalnızca sahibi kapatabilir.', 403);
  await closeRoom(roomId);
  res.json({ ok: true });
});

router.get('/:roomId/members', requireAuth, async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  await assertRoomVisible(await activeRoom(roomId), req.user.id);
  // Üst sınır: kalabalık odada bu uç her çağrıldığında binlerce satır dönüyordu — üstelik
  // uygulama listeyi düzenli yeniliyor. Popüler bir yayında tek odanın trafiği sunucunun
  // tamamını yavaşlatabilirdi.
  //
  // Sıralama koltuktakileri EN BAŞA koyuyor (seat_index NULLS LAST), bu yüzden kesme yalnızca
  // dinleyicilerin kuyruğunu etkiler: koltuk çizimi, "boş koltuk var mı" ve "çıkınca oda kapanır
  // mı" hesapları olduğu gibi doğru kalır.
  //
  // `total` ile birlikte döner: arayüz "+1.742 dinleyici" diye gösterebilsin, sayı kaybolmasın.
  const limit = Math.max(50, Math.min(500, Number.parseInt(req.query.limit, 10) || 300));
  const isAdmin = req.user.system_role === 'admin';
  const visible = `(rm.microphone OR rm.user_id = $2 OR $3 OR NOT is_ghost(rm.user_id))`;
  const [r, c] = await Promise.all([
    query(
      `SELECT rm.role, rm.microphone, rm.seat_index, rm.joined_at, ${USER_PUBLIC_COLUMNS}
       FROM room_members rm JOIN users u ON u.id = rm.user_id ${USER_PUBLIC_JOINS}
       WHERE rm.room_id = $1
         -- Hayalet (SWIP) dinleyiciler listede görünmez (kendisi ve uygulama yöneticisi hariç); mikrofondaysa görünür.
         AND ${visible}
       ORDER BY rm.seat_index NULLS LAST, rm.joined_at
       LIMIT $4`,
      [roomId, req.user.id, isAdmin, limit],
    ),
    query(
      `SELECT COUNT(*)::int AS n FROM room_members rm WHERE rm.room_id = $1 AND ${visible}`,
      [roomId, req.user.id, isAdmin],
    ),
  ]);
  res.json({
    total: c.rows[0].n,
    truncated: c.rows[0].n > r.rowCount,
    members: r.rows.map((m) => ({
      userId: m.id, role: m.role, microphone: m.microphone, seatIndex: m.seat_index, joinedAt: m.joined_at,
      user: roomUser(m, req.user.id),
    })),
  });
});

// Uygulamadan düzenli gelen "oda açık" sinyali: üyeyi canlı tutar ve oda arada kapanmışsa istemciye hemen 404 döner.

// Uygulamadan düzenli gelen "oda açık" sinyali: üyeyi canlı tutar ve oda arada kapanmışsa istemciye hemen 404 döner.
router.post('/:roomId/heartbeat', requireAuth, userLimit('heartbeat', 12, 60e3), async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  const room = await activeRoom(roomId);
  const r = await query(`UPDATE room_members SET last_seen_at = NOW() WHERE room_id = $1 AND user_id = $2`, [roomId, req.user.id]);
  if (!r.rowCount) {
    // Başka odaya geçmiş (ör. başka cihazdan): bu ekran kapanır, geri katılmaya çalışmaz.
    const elsewhere = await query(
      `SELECT 1 FROM room_members m JOIN rooms r ON r.id = m.room_id AND r.is_active WHERE m.user_id = $1 LIMIT 1`, [req.user.id],
    );
    if (elsewhere.rowCount) throw fail('Başka bir odaya geçtiğin için bu odadan çıktın.', 409);
    throw fail('Bu odanın üyesi değilsiniz.', 403);
  }
  res.json({ ok: true, seatCount: room.seat_count });
});

// ---------- Mikrofon / koltuk ----------

router.use(micRouter);
router.use(moderationRouter);
router.use(scoreboardRouter);
router.use(mediaRouter);
