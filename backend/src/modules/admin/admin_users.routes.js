// Yönetici paneli — kullanıcı yönetimi.
// Ortak yardımcılar ve import'lar: admin.shared.js
import { Router } from 'express';
import { suspendUser } from '../users/ban.service.js';
import { BADGES, INVENTORY_TYPES, MAX_LEVEL, SPECIAL_ID_RE, SUPPORT_LEVEL_LIMIT, announceUserChange, assertStaffTarget, assertUser, auditStaff, banEnd, closeRoom, deleteAccount, expForLevel, fail, grantSpecialId, httpsUrl, hub, leaveRoom, levelExp, levelFromExp, lockBanState, mayActOnUser, oneOf, positiveInt, query, removeAnimatedAvatar, removeUpload, requireSuperAdmin, revokeAllSessions, text, tx, uuid } from './admin.shared.js';

export const router = Router();

// ---------------- Kullanıcı arama ve durum ----------------
router.get('/users', async (req, res) => {
  const q = String(req.query.q ?? '').trim().toLowerCase();
  if (q.length < 2) throw fail('Arama için en az 2 karakter girin.');
  const r = await query(
    `SELECT id, public_id, username, display_name, avatar_url, coins, diamonds, system_role, account_status, banned_until, ban_reason, chat_restricted_until,
            coin_level, gift_level
     FROM users WHERE lower(username) LIKE $1 ESCAPE '\\' OR lower(display_name) LIKE $1 ESCAPE '\\' OR id::text = $2 OR public_id = $2
       OR id = (SELECT si.user_id FROM special_ids si WHERE si.special_id = $2 AND si.expires_at > NOW())
     ORDER BY (public_id = $2) DESC, username LIMIT 20`,
    [`%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`, q],
  );
  res.json({
    users: r.rows.map((u) => ({
      id: u.id, publicId: u.public_id ?? null, username: u.username, displayName: u.display_name, coins: String(u.coins), diamonds: String(u.diamonds),
      coinLevel: u.coin_level, giftLevel: u.gift_level,
      systemRole: u.system_role, accountStatus: u.account_status, avatarUrl: u.avatar_url, bannedUntil: u.banned_until, banReason: u.ban_reason,
      chatRestrictedUntil: u.chat_restricted_until && new Date(u.chat_restricted_until) > new Date() ? u.chat_restricted_until : null,
      ...(req.user.system_role === 'admin' ? {} : { coins: undefined, diamonds: undefined }),
    })),
  });
});

// Yönetimin koyduğu (süresi dolmamış) banı yalnızca yönetim değiştirir ya da kaldırır: yardımcı admin banı kısa süreli
// yeni bir banla değiştirip sonra kaldırarak bu kuralı aşamaz. Satır kilitlenir (eşzamanlı ban / kaldırma ile yarışmasın).

// Süreli veya süresiz ban. hours yoksa/0 ise süresiz.
router.post('/users/:userId/ban', async (req, res) => {
  const userId = uuid(req.params.userId, 'Kullanıcı');
  if (userId === req.user.id) throw fail('Kendinizi banlayamazsınız.');
  const target = await assertUser(userId);
  if (target.account_status === 'deleted') throw fail('Silinmiş hesap değiştirilemez.', 409);
  if (!mayActOnUser(req.user.system_role, target.system_role)) throw fail('Bu hesap üzerinde işlem yetkiniz yok.', 403);
  const until = banEnd(req.body?.hours);
  if (until === undefined) throw fail('Süre 1 saat ile 1 yıl arasında olmalı (süresiz için boş bırakın).');
  const reason = text(req.body?.reason, 'Neden', { max: 300 });
  // Askıya alma mantığı tek yerde (modules/users/ban.service.js): oturum iptali, bağlantı
  // kesme ve oda kapatma yan etkileri ikinci bir kopyada unutulmasın.
  await suspendUser({
    userId, byUserId: req.user.id, byRole: req.user.system_role, until, reason,
    lock: (c) => lockBanState(c, userId, req.user.system_role),
  });
  res.json({ ok: true, status: 'banned', bannedUntil: until });
});

// Hesabı sil (yalnızca yönetici): e-posta ile gelen silme talepleri, 18 yaşından küçük olduğu anlaşılan hesaplar vb.
// Kişinin kendi silmesiyle aynı işlem yapılır; gerekçe kayıt altına alınır.

// Hesabı sil (yalnızca yönetici): e-posta ile gelen silme talepleri, 18 yaşından küçük olduğu anlaşılan hesaplar vb.
// Kişinin kendi silmesiyle aynı işlem yapılır; gerekçe kayıt altına alınır.
router.post('/users/:userId/delete', requireSuperAdmin, async (req, res) => {
  const userId = uuid(req.params.userId, 'Kullanıcı');
  if (userId === req.user.id) throw fail('Kendi hesabınızı buradan silemezsiniz.');
  const target = await assertUser(userId);
  if (target.account_status === 'deleted') throw fail('Hesap zaten silinmiş.', 409);
  if (target.system_role === 'admin') throw fail('Yönetici hesabı silinemez; önce yetkisini kaldırın.', 403);
  const reason = text(req.body?.reason, 'Neden', { min: 3, max: 300, required: true });
  await deleteAccount(userId);
  await auditStaff({ query }, req.user.id, userId, 'account_delete', { reason, username: target.username });
  res.json({ ok: true, status: 'deleted' });
});

router.post('/users/:userId/unban', async (req, res) => {
  const userId = uuid(req.params.userId, 'Kullanıcı');
  const target = await assertUser(userId);
  if (!mayActOnUser(req.user.system_role, target.system_role)) throw fail('Bu hesap üzerinde işlem yetkiniz yok.', 403);
  if (target.account_status !== 'banned') throw fail('Hesap banlı değil.', 409);
  await tx(async (c) => {
    // Yardımcı admin kendi koyduğu ya da otomatik banları kaldırır; yönetimin koyduğunu kaldıramaz.
    const cur = await lockBanState(c, userId, req.user.system_role);
    if (cur?.account_status !== 'banned') throw fail('Hesap banlı değil.', 409);
    await c.query(`UPDATE users SET account_status = 'active', banned_until = NULL, ban_reason = NULL, banned_by = NULL, updated_at = NOW() WHERE id = $1`, [userId]);
    await auditStaff(c, req.user.id, userId, 'account_unban', { by: req.user.system_role });
  });
  res.json({ ok: true, status: 'active' });
});

// Kullanıcının görünen adını (nick) değiştirir. Yasaklı kelime denetimi uygulanmaz (yetkili işlemi) ama uzunluk denetlenir.

// Kullanıcının görünen adını (nick) değiştirir. Yasaklı kelime denetimi uygulanmaz (yetkili işlemi) ama uzunluk denetlenir.
router.post('/users/:userId/display-name', async (req, res) => {
  const userId = uuid(req.params.userId, 'Kullanıcı');
  const name = text(req.body?.displayName, 'Görünen ad', { min: 2, max: 40, required: true });
  const target = await assertUser(userId);
  if (target.account_status === 'deleted') throw fail('Silinmiş hesap değiştirilemez.', 409);
  if (!mayActOnUser(req.user.system_role, target.system_role, userId === req.user.id)) throw fail('Bu hesap üzerinde işlem yetkiniz yok.', 403);
  await tx(async (c) => {
    const before = (await c.query(`SELECT display_name FROM users WHERE id = $1`, [userId])).rows[0]?.display_name;
    await c.query(`UPDATE users SET display_name = $2, updated_at = NOW() WHERE id = $1`, [userId, name]);
    await auditStaff(c, req.user.id, userId, 'profile_display_name', { before, after: name, by: req.user.system_role });
  });
  res.json({ ok: true, displayName: name });
});

// Profil fotoğrafını kaldırır (avatarUrl boş) veya https adresiyle değiştirir.

// Profil fotoğrafını kaldırır (avatarUrl boş) veya https adresiyle değiştirir.
router.post('/users/:userId/avatar', async (req, res) => {
  const userId = uuid(req.params.userId, 'Kullanıcı');
  const url = httpsUrl(req.body?.avatarUrl, 'Fotoğraf adresi');
  const target = await assertUser(userId);
  if (target.account_status === 'deleted') throw fail('Silinmiş hesap değiştirilemez.', 409);
  if (!mayActOnUser(req.user.system_role, target.system_role, userId === req.user.id)) throw fail('Bu hesap üzerinde işlem yetkiniz yok.', 403);
  const before = (await query(`SELECT avatar_url, static_avatar_url, avatar_animated FROM users WHERE id = $1`, [userId])).rows[0];
  await tx(async (c) => {
    await c.query(`UPDATE users SET avatar_url = $2, avatar_animated = FALSE, static_avatar_url = NULL, updated_at = NOW() WHERE id = $1`, [userId, url]);
    await auditStaff(c, req.user.id, userId, 'profile_avatar', { removed: !url, by: req.user.system_role });
  });
  // Kaldırılan fotoğrafın dosyası da silinir (yalnızca kullanıcının kendi yüklediği kayıt).
  await removeUpload(before?.avatar_url, userId);
  await removeUpload(before?.static_avatar_url, userId);
  if (before?.avatar_animated) await removeAnimatedAvatar(before.avatar_url, userId);
  res.json({ ok: true, avatarUrl: url });
});

// Yardımcı admin atama/alma: yalnızca yönetici, admin panelinden.

// Yardımcı admin atama/alma: yalnızca yönetici, admin panelinden.
router.post('/users/:userId/staff-role', requireSuperAdmin, async (req, res) => {
  const userId = uuid(req.params.userId, 'Kullanıcı');
  const role = oneOf(req.body?.role, ['user', 'support'], 'Rol');
  if (userId === req.user.id) throw fail('Kendi rolünüzü değiştiremezsiniz.');
  const target = await assertUser(userId);
  if (target.system_role === 'admin') throw fail('Yönetici rolü buradan değiştirilemez.', 403);
  if (target.account_status !== 'active') throw fail('Yalnızca aktif hesaplara yetki verilebilir.', 409);
  await tx(async (c) => {
    await c.query(`UPDATE users SET system_role = $2, updated_at = NOW() WHERE id = $1`, [userId, role]);
    await auditStaff(c, req.user.id, userId, 'staff_role', { role });
  });
  res.json({ ok: true, role });
});

router.get('/staff', requireSuperAdmin, async (req, res) => {
  const r = await query(`SELECT id, username, display_name, system_role FROM users WHERE system_role IN ('support','admin') ORDER BY system_role, username`);
  res.json({ staff: r.rows.map((u) => ({ id: u.id, username: u.username, displayName: u.display_name, systemRole: u.system_role })) });
});

// ---------------- Coin ----------------
// Yönetici: sınırsız ekler / düşer. Yardımcı admin: yalnızca normal kullanıcıya, tek seferde en fazla 100.000 Coin yükler (düşemez).

// ---------------- Seviye ----------------
// Kullanıcı seviyesi (gönderilen Coin) veya yayıncı seviyesi (alınan Elmas) verilir: seviye için gereken exp farkı
// level_exp_bonus / host_level_exp_bonus'a yazılır; gerçek harcama / kazanç değişmez, sonraki hediyeler üstüne eklenir.
// Yönetici: 1-300 arası her seviye (düşürebilir de). Yardımcı admin: yalnızca normal kullanıcıya, en fazla 100. seviye ve yalnızca yükseltir.
router.post('/users/:userId/level', async (req, res) => {
  const userId = uuid(req.params.userId, 'Kullanıcı');
  const kind = oneOf(req.body?.kind ?? 'user', ['user', 'host'], 'Seviye türü');
  const level = Number(req.body?.level);
  if (!Number.isInteger(level) || level < 1 || level > MAX_LEVEL) throw fail(`Seviye 1-${MAX_LEVEL} arasında olmalı.`);
  const admin = req.user.system_role === 'admin';
  if (!admin && level > SUPPORT_LEVEL_LIMIT) throw fail(`Yardımcı admin en fazla ${SUPPORT_LEVEL_LIMIT}. seviyeyi verebilir.`, 403);
  await assertStaffTarget(req, userId);
  const [total, bonus, col] = kind === 'user'
    ? ['total_sent_coins', 'level_exp_bonus', 'coin_level'] : ['total_received_diamonds', 'host_level_exp_bonus', 'gift_level'];
  const out = await tx(async (c) => {
    const u = (await c.query(`SELECT ${total} AS total, ${bonus} AS bonus, account_status FROM users WHERE id = $1 FOR UPDATE`, [userId])).rows[0];
    if (!u) throw fail('Kullanıcı bulunamadı.', 404);
    if (u.account_status === 'deleted') throw fail('Silinmiş hesap değiştirilemez.', 409);
    const before = levelFromExp(levelExp(u.total, u.bonus));
    // Yardımcı admin yalnızca yükseltir: aynı seviyeyi yeniden vermek de ilerlemeyi sıfırlayacağı için kabul edilmez.
    if (!admin && level <= before) throw fail(`Kullanıcı zaten ${before}. seviyede; yardımcı admin yalnızca daha yüksek seviye verebilir.`, 403);
    const newBonus = expForLevel(level) - BigInt(u.total);
    await c.query(`UPDATE users SET ${bonus} = $2, ${col} = $3, updated_at = NOW() WHERE id = $1`, [userId, newBonus.toString(), level]);
    await c.query(
      `INSERT INTO financial_audit_logs(admin_id, user_id, action, reference_type, metadata) VALUES($1,$2,'level_set','user',$3)`,
      [req.user.id, userId, JSON.stringify({ kind, before, after: level, by: req.user.system_role })],
    );
    return { before, level };
  });
  res.json({ ok: true, kind, ...out });
  announceUserChange(userId);
});

// ---------------- WIP ----------------

// ---------------- Envanter ----------------
router.post('/users/:userId/inventory', async (req, res) => {
  const userId = uuid(req.params.userId, 'Kullanıcı');
  const itemType = oneOf(req.body?.itemType, INVENTORY_TYPES, 'Öğe tipi');
  const itemKey = text(req.body?.itemKey, 'Öğe anahtarı', { max: 100, required: true });
  const itemName = text(req.body?.itemName, 'Öğe adı', { max: 120, required: true });
  await assertUser(userId);
  if (itemType === 'frame' || itemType === 'entrance_effect') {
    const table = itemType === 'frame' ? 'frames' : 'entrance_effects';
    const exists = await query(`SELECT 1 FROM ${table} WHERE id::text = $1 AND is_active = TRUE`, [itemKey]);
    if (!exists.rowCount) throw fail('Bu anahtara sahip aktif bir katalog öğesi yok.', 404);
  }
  let expiresAt = null;
  if (req.body?.expiresAt) {
    const d = new Date(req.body.expiresAt);
    if (Number.isNaN(d.getTime()) || d.getTime() < Date.now()) throw fail('Bitiş tarihi geçersiz veya geçmişte.');
    expiresAt = d.toISOString();
  }
  const metadata = req.body?.metadata && typeof req.body.metadata === 'object' && !Array.isArray(req.body.metadata) ? req.body.metadata : {};
  const r = await query(
    `INSERT INTO inventory_items(user_id, item_type, item_key, item_name, expires_at, metadata) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
    [userId, itemType, itemKey, itemName, expiresAt, JSON.stringify(metadata)],
  );
  await query(
    `INSERT INTO financial_audit_logs(admin_id, user_id, action, reference_type, reference_id, metadata) VALUES($1,$2,'admin_inventory_grant','inventory',$3,$4)`,
    [req.user.id, userId, r.rows[0].id, JSON.stringify({ itemType, itemKey })],
  );
  res.status(201).json({ id: r.rows[0].id });
});

// ---------------- Katalog (yalnızca yönetici) ----------------

// ---------------- Özel ID ve yayıncı rozeti ----------------
router.get('/users/:userId/marks', async (req, res) => {
  const userId = uuid(req.params.userId, 'Kullanıcı');
  const r = (await query(
    `SELECT (SELECT row_to_json(s) FROM (SELECT special_id, expires_at, source FROM special_ids WHERE user_id = $1) s) AS special,
            (SELECT row_to_json(b) FROM (SELECT badge, expires_at, source FROM host_badges WHERE user_id = $1) b) AS badge`, [userId],
  )).rows[0];
  res.json({ specialId: r.special, hostBadge: r.badge });
});

router.post('/users/:userId/special-id', requireSuperAdmin, async (req, res) => {
  const userId = uuid(req.params.userId, 'Kullanıcı');
  const days = positiveInt(req.body?.days, 'Gün', 3650);
  const raw = req.body?.specialId === undefined || req.body?.specialId === null ? '' : String(req.body.specialId).trim();
  if (raw && !SPECIAL_ID_RE.test(raw)) throw fail('Özel ID 2-7 haneli olmalı ve 0 ile başlamamalı.');
  await assertUser(userId);
  if (raw && (await query(`SELECT 1 FROM users WHERE public_id = $1 AND id <> $2`, [raw, userId])).rowCount) throw fail('Bu numara bir kullanıcının ID\'si.', 409);
  const r = await tx(async (c) => {
    const x = await grantSpecialId(c, userId, days, { value: raw || null, source: 'admin' });
    if (!x) throw fail('Özel ID üretilemedi, tekrar deneyin.', 503);
    await c.query(`INSERT INTO financial_audit_logs(admin_id, user_id, action, reference_type, metadata) VALUES($1,$2,'special_id_grant','user',$3)`,
      [req.user.id, userId, JSON.stringify({ specialId: x.special_id, days })]);
    return x;
  });
  res.json({ ok: true, specialId: r.special_id, expiresAt: r.expires_at });
  announceUserChange(userId);
});

router.delete('/users/:userId/special-id', requireSuperAdmin, async (req, res) => {
  const userId = uuid(req.params.userId, 'Kullanıcı');
  await query(`DELETE FROM special_ids WHERE user_id = $1`, [userId]);
  await query(`INSERT INTO financial_audit_logs(admin_id, user_id, action, reference_type) VALUES($1,$2,'special_id_revoke','user')`, [req.user.id, userId]);
  res.json({ ok: true });
  announceUserChange(userId);
});

router.post('/users/:userId/host-badge', requireSuperAdmin, async (req, res) => {
  const userId = uuid(req.params.userId, 'Kullanıcı');
  const badge = oneOf(req.body?.badge, BADGES, 'Rozet');
  const days = positiveInt(req.body?.days, 'Gün', 3650);
  await assertUser(userId);
  await query(
    `INSERT INTO host_badges(user_id, badge, expires_at, source) VALUES($1,$2,NOW() + ($3::int * INTERVAL '1 day'),'admin')
     ON CONFLICT (user_id) DO UPDATE SET badge = EXCLUDED.badge, expires_at = EXCLUDED.expires_at, source = 'admin', updated_at = NOW()`,
    [userId, badge, days],
  );
  await query(`INSERT INTO financial_audit_logs(admin_id, user_id, action, reference_type, metadata) VALUES($1,$2,'host_badge_grant','user',$3)`,
    [req.user.id, userId, JSON.stringify({ badge, days })]);
  res.json({ ok: true });
  announceUserChange(userId);
});

router.delete('/users/:userId/host-badge', requireSuperAdmin, async (req, res) => {
  const userId = uuid(req.params.userId, 'Kullanıcı');
  await query(`DELETE FROM host_badges WHERE user_id = $1`, [userId]);
  await query(`INSERT INTO financial_audit_logs(admin_id, user_id, action, reference_type) VALUES($1,$2,'host_badge_revoke','user')`, [req.user.id, userId]);
  res.json({ ok: true });
  announceUserChange(userId);
});

// ---------------- Resmi etkinlikler, dönem kapatma, KYC ----------------
