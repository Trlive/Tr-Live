// Yönetici paneli — güvenlik duvarı ve sunucu durumu.
// Ortak yardımcılar ve import'lar: admin.shared.js
import { Router } from 'express';
import { CONFIG_DEFAULTS, DASH_SQL, EVENT_KINDS, EVENT_TITLES, IMAGE_TYPES, JACKPOT_OPEN, OWN_IMAGE_RE, PKG_VERSION, SECRET_MASK, USERNAME_RE, assertUser, auditStaff, banIpPersist, bigAmount, compareVersions, config, cpuPercent, defaultRules, express, fail, getConfig, hashPassword, httpsUrl, hub, isStar, listBans, livekitHealth, mailOn, maskSecrets, mayActOnUser, mb, mediaCacheStats, net, normalizeEmail, normalizePhone, oneOf, os, passwordRules, poolStats, positiveInt, query, removeUpload, requireSuperAdmin, revokeAllSessions, rewardsView, saveConfig, saveUpload, securityStats, sendMail, text, tx, unbanIp, userLimit, uuid, validateConfigPatch, validateRewards } from './admin.shared.js';

export const router = Router();

// ---------------- Güvenlik duvarı (yalnızca yönetici) ----------------
router.get('/security/events', requireSuperAdmin, async (req, res) => {
  const limit = Math.max(1, Math.min(Math.floor(Number(req.query.limit)) || 100, 500));
  const type = req.query.type ? String(req.query.type).slice(0, 40) : null;
  const r = await query(
    `SELECT id, event_type, host(ip) AS ip, user_id, detail, created_at FROM security_events
     WHERE ($1::text IS NULL OR event_type = $1) ORDER BY created_at DESC LIMIT $2`,
    [type, limit],
  );
  res.json({ events: r.rows, stats: securityStats() });
});

router.get('/security/blocks', requireSuperAdmin, async (req, res) => {
  res.json({ blocks: listBans().map((b) => ({ ip: b.ip, reason: b.reason, until: b.until ? new Date(b.until).toISOString() : null })) });
});

router.post('/security/blocks', requireSuperAdmin, async (req, res) => {
  const ip = String(req.body?.ip ?? '').trim();
  if (!net.isIP(ip)) throw fail('Geçerli bir IP adresi girin.');
  const minutes = req.body?.minutes === undefined || req.body.minutes === null ? null : positiveInt(req.body.minutes, 'Süre (dk)', 525600);
  if (!(await banIpPersist(ip, minutes === null ? null : minutes * 60000, text(req.body?.reason, 'Neden', { max: 200 }) || 'Yönetici kararı', req.user.id))) {
    throw fail('Bu IP izin listesinde olduğu için engellenemez.', 409);
  }
  res.status(201).json({ ok: true });
});

router.delete('/security/blocks/:ip', requireSuperAdmin, async (req, res) => {
  const ip = String(req.params.ip);
  if (!net.isIP(ip)) throw fail('Geçerli bir IP adresi girin.');
  await unbanIp(ip);
  res.json({ ok: true });
});

// ---------- Haftalık etkinlikler (Çift, Kral/Kraliçe, Yıldız): açık/kapalı, yıldız hediyesi, ödüller, kurallar ----------

// ---------- Haftalık etkinlikler (Çift, Kral/Kraliçe, Yıldız): açık/kapalı, yıldız hediyesi, ödüller, kurallar ----------
router.get('/weekly-events', requireSuperAdmin, async (_req, res) => {
  const r = await query(
    `SELECT c.*, g.name AS g_name, g.icon_url AS g_icon FROM weekly_event_config c LEFT JOIN gifts g ON g.id = c.gift_id ORDER BY c.kind`,
  );
  res.json({
    events: r.rows.map((c) => ({
      kind: c.kind, title: EVENT_TITLES[c.kind], enabled: c.enabled, isStar: isStar(c.kind),
      gift: c.gift_id ? { id: c.gift_id, name: c.g_name, iconUrl: c.g_icon } : null,
      rewards: c.rewards, rewardsView: rewardsView(c.rewards), rules: c.rules ?? '', defaultRules: defaultRules(c.kind),
    })),
  });
});

router.put('/weekly-events/:kind', requireSuperAdmin, async (req, res) => {
  const kind = String(req.params.kind);
  if (!EVENT_KINDS.includes(kind)) throw fail('Etkinlik bulunamadı.', 404);
  const sets = []; const values = [];
  const set = (col, v) => { values.push(v); sets.push(`${col} = $${values.length}`); };
  const b = req.body ?? {};
  if (b.enabled !== undefined) {
    if (typeof b.enabled !== 'boolean') throw fail('enabled true/false olmalı.');
    set('enabled', b.enabled);
  }
  if (b.giftId !== undefined) {
    if (!isStar(kind)) throw fail('Hediye yalnızca Yıldız etkinliklerinde seçilir.');
    if (b.giftId === null) set('gift_id', null);
    else {
      const gid = uuid(b.giftId, 'Hediye');
      if (!(await query(`SELECT 1 FROM gifts WHERE id = $1`, [gid])).rowCount) throw fail('Hediye bulunamadı.', 404);
      set('gift_id', gid);
    }
  }
  if (b.rewards !== undefined) set('rewards', JSON.stringify(await validateRewards(b.rewards)));
  if (b.rules !== undefined) set('rules', text(b.rules ?? '', 'Kurallar', { max: 3000 }));
  if (!sets.length) throw fail('Değiştirilecek alan yok.');
  values.push(kind);
  await query(`UPDATE weekly_event_config SET ${sets.join(', ')}, updated_at = NOW() WHERE kind = $${values.length}`, values);
  await query(
    `INSERT INTO financial_audit_logs(admin_id, action, reference_type, reference_id, metadata) VALUES($1,'weekly_event_config','weekly_event',$2,$3)`,
    [req.user.id, kind, JSON.stringify(Object.keys(b))],
  );
  res.json({ ok: true });
});

// ---------- Banner ve duyuru yönetimi (yalnızca yönetici) ----------

// ---------- Banner ve duyuru yönetimi (yalnızca yönetici) ----------
router.get('/banners', async (_req, res) => {
  const r = await query(`SELECT id, image_url, title, link_url, sort_order, is_active FROM banners ORDER BY sort_order, created_at DESC LIMIT 50`);
  res.json({ banners: r.rows.map((b) => ({ id: b.id, imageUrl: b.image_url, title: b.title, linkUrl: b.link_url, sortOrder: b.sort_order, active: b.is_active })) });
});

router.put('/banners/image', express.raw({ type: Object.keys(IMAGE_TYPES), limit: '3mb' }), async (req, res) => {
  res.json({ url: await saveUpload(req, 'banner') });
});

router.post('/banners', async (req, res) => {
  const imageUrl = String(req.body?.imageUrl ?? '');
  if (!OWN_IMAGE_RE.test(imageUrl)) throw fail('Önce bir görsel yükleyin.');
  const title = text(req.body?.title, 'Başlık', { max: 80 }) || null;
  const linkUrl = req.body?.linkUrl ? httpsUrl(req.body.linkUrl, 'Bağlantı') : null;
  const sortOrder = Number.isInteger(req.body?.sortOrder) ? req.body.sortOrder : 0;
  const r = await query(`INSERT INTO banners(image_url, title, link_url, sort_order) VALUES($1,$2,$3,$4) RETURNING id`, [imageUrl, title, linkUrl, sortOrder]);
  await auditStaff({ query }, req.user.id, null, 'banner_add', { id: r.rows[0].id });
  res.status(201).json({ id: r.rows[0].id });
});

router.patch('/banners/:id', async (req, res) => {
  const id = uuid(req.params.id);
  if (typeof req.body?.active !== 'boolean') throw fail('active alanı true/false olmalı.');
  const r = await query(`UPDATE banners SET is_active = $2 WHERE id = $1`, [id, req.body.active]);
  if (!r.rowCount) throw fail('Banner bulunamadı.', 404);
  res.json({ ok: true });
});

router.delete('/banners/:id', async (req, res) => {
  const id = uuid(req.params.id);
  const r = await query(`DELETE FROM banners WHERE id = $1 RETURNING image_url`, [id]);
  if (!r.rowCount) throw fail('Banner bulunamadı.', 404);
  await removeUpload(r.rows[0].image_url);
  await auditStaff({ query }, req.user.id, null, 'banner_delete', { id });
  res.json({ ok: true });
});

// Duyuru kartı görseli (Mesajlar > Ekip / Etkinlik / Ödül).

// Duyuru kartı görseli (Mesajlar > Ekip / Etkinlik / Ödül).
router.put('/announcements/image', express.raw({ type: Object.keys(IMAGE_TYPES), limit: '3mb' }), async (req, res) => {
  res.json({ url: await saveUpload(req, 'announcement') });
});

// Telefon bildirimi: uygulaması yüklü herkese. Açık uygulamalara anında (soket), kapalı/arka plandakilere
// uygulama açılınca telefon bildirimi olarak düşer.

// Telefon bildirimi: uygulaması yüklü herkese. Açık uygulamalara anında (soket), kapalı/arka plandakilere
// uygulama açılınca telefon bildirimi olarak düşer.
router.get('/push', requireSuperAdmin, async (_req, res) => {
  const r = await query(`SELECT id, title, body, created_at FROM push_messages ORDER BY id DESC LIMIT 30`);
  res.json({ messages: r.rows.map((x) => ({ id: String(x.id), title: x.title, body: x.body, createdAt: x.created_at })) });
});

router.post('/push', requireSuperAdmin, userLimit('admin_push', 20, 3600e3), async (req, res) => {
  const title = text(req.body?.title, 'Başlık', { min: 2, max: 80, required: true });
  const body = text(req.body?.body, 'Mesaj', { min: 2, max: 300, required: true });
  const r = (await query(`INSERT INTO push_messages(title, body, created_by) VALUES($1,$2,$3) RETURNING id, created_at`, [title, body, req.user.id])).rows[0];
  hub.broadcastGlobal({ type: 'push', id: String(r.id), title, body });
  res.status(201).json({ ok: true, id: String(r.id) });
});

router.post('/announcements', async (req, res) => {
  const kind = oneOf(req.body?.kind, ['team', 'event', 'reward'], 'Tür');
  const title = text(req.body?.title, 'Başlık', { min: 2, max: 80, required: true });
  const body = text(req.body?.text, 'Metin', { min: 1, max: 2000, required: true });
  let imageUrl = null;
  if (req.body?.imageUrl) {
    imageUrl = String(req.body.imageUrl);
    if (!OWN_IMAGE_RE.test(imageUrl)) throw fail('Görsel adresi geçersiz.');
  }
  const linkUrl = req.body?.linkUrl ? httpsUrl(req.body.linkUrl, 'Bağlantı') : null;
  const r = await query(
    `INSERT INTO announcements(kind, title, body, created_by, image_url, link_url) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
    [kind, title, body, req.user.id, imageUrl, linkUrl],
  );
  await auditStaff({ query }, req.user.id, null, 'announcement_add', { id: r.rows[0].id, kind });
  res.status(201).json({ id: r.rows[0].id });
  hub.broadcastGlobal({ type: 'inbox_update' }); // Mesajlar sekmesi rozeti hemen yenilensin
});

router.delete('/announcements/:id', async (req, res) => {
  const id = uuid(req.params.id);
  const r = await query(`DELETE FROM announcements WHERE id = $1 RETURNING image_url`, [id]);
  if (!r.rowCount) throw fail('Duyuru bulunamadı.', 404);
  await removeUpload(r.rows[0].image_url);
  res.json({ ok: true });
});

// ================= Canlı panel, hata kayıtları, işlem kaydı, uzaktan ayarlar, moderasyon =================

router.get('/dashboard', requireSuperAdmin, async (req, res) => {
  const t0 = Date.now();
  await query('SELECT 1');
  const dbLatencyMs = Date.now() - t0;
  const [stats, size, lk] = await Promise.all([
    query(DASH_SQL),
    query(`SELECT pg_database_size(current_database())::bigint AS bytes, (SELECT COALESCE(SUM(size_bytes), 0)::bigint FROM media_files) AS media`),
    livekitHealth(),
  ]);
  const s = stats.rows[0];
  const mem = process.memoryUsage();
  res.json({
    time: new Date().toISOString(),
    server: {
      version: PKG_VERSION, node: process.version, uptimeSec: Math.round(process.uptime()), cpuPercent: cpuPercent(), cores: os.cpus().length,
      loadAvg: os.loadavg().map((x) => Math.round(x * 100) / 100),
      memory: { rssMb: mb(mem.rss), heapUsedMb: mb(mem.heapUsed), heapTotalMb: mb(mem.heapTotal) },
      host: { totalMb: mb(os.totalmem()), freeMb: mb(os.freemem()) },
    },
    realtime: hub.stats(),
    db: { ok: true, latencyMs: dbLatencyMs, pool: poolStats(), sizeMb: mb(size.rows[0].bytes), mediaMb: mb(size.rows[0].media) },
    livekit: lk,
    mediaCache: { ...mediaCacheStats(), mb: mb(mediaCacheStats().bytes) },
    live: { activeRooms: s.active_rooms, videoRooms: s.video_rooms, audioRooms: s.active_rooms - s.video_rooms, roomMembers: s.room_members, onMic: s.on_mic, sessions: s.sessions },
    today: {
      newUsers: s.new_users, activeUsers: s.active_users, gifts: s.gifts, giftCoins: s.gift_coins,
      roomMessages: s.room_messages, directMessages: s.direct_messages, strikes: s.strikes, autoMutes: s.auto_mutes,
    },
    totals: { users: s.total_users },
    alerts: { openReports: s.open_reports, errors24h: s.errors_24h },
  });
});

router.get('/client-errors', requireSuperAdmin, async (req, res) => {
  const limit = Math.max(1, Math.min(Math.floor(Number(req.query.limit)) || 100, 300));
  const [list, top] = await Promise.all([
    query(
      `SELECT e.id, e.source, e.message, e.stack, e.app_version, e.device, e.occurred_at, e.created_at, u.id AS uid, u.username, u.display_name
       FROM client_errors e LEFT JOIN users u ON u.id = e.user_id ORDER BY e.id DESC LIMIT $1`,
      [limit],
    ),
    query(
      `SELECT source, LEFT(message, 140) AS message, COUNT(*)::int AS n, COUNT(DISTINCT user_id)::int AS users, MAX(created_at) AS last_at
       FROM client_errors WHERE created_at > NOW() - INTERVAL '7 days' GROUP BY 1, 2 ORDER BY n DESC LIMIT 15`,
    ),
  ]);
  res.json({
    errors: list.rows.map((e) => ({
      id: String(e.id), source: e.source, message: e.message, stack: e.stack, appVersion: e.app_version, device: e.device,
      occurredAt: e.occurred_at, createdAt: e.created_at, user: e.uid ? { id: e.uid, username: e.username, displayName: e.display_name } : null,
    })),
    top: top.rows.map((t) => ({ source: t.source, message: t.message, count: t.n, users: t.users, lastAt: t.last_at })),
  });
});

router.delete('/client-errors', requireSuperAdmin, async (req, res) => {
  const r = await query(`DELETE FROM client_errors`);
  res.json({ ok: true, deleted: r.rowCount });
});

// Yönetici/yardımcı admin işlemleri ve para hareketleri tek listede: kim, ne zaman, kime, ne yaptı.

// Yönetici/yardımcı admin işlemleri ve para hareketleri tek listede: kim, ne zaman, kime, ne yaptı.
router.get('/actions', requireSuperAdmin, async (req, res) => {
  const limit = Math.max(1, Math.min(Math.floor(Number(req.query.limit)) || 100, 300));
  const userId = req.query.userId ? uuid(String(req.query.userId), 'Kullanıcı') : null;
  const scope = req.query.scope ? oneOf(String(req.query.scope), ['staff', 'user'], 'Kapsam') : null;
  const r = await query(
    `SELECT l.id, l.action, l.reference_type, l.reference_id, l.amount_coins, l.amount_diamonds, l.balance_before, l.balance_after, l.metadata, l.created_at,
            a.id AS actor_id, a.username AS actor_username, a.display_name AS actor_name, a.system_role AS actor_role,
            t.id AS target_id, t.username AS target_username, t.display_name AS target_name
     FROM financial_audit_logs l LEFT JOIN users a ON a.id = l.admin_id LEFT JOIN users t ON t.id = l.user_id
     WHERE ($1::uuid IS NULL OR l.user_id = $1 OR l.admin_id = $1)
       AND ($2::text IS NULL OR ($2 = 'staff' AND l.admin_id IS NOT NULL) OR ($2 = 'user' AND l.admin_id IS NULL))
     ORDER BY l.created_at DESC LIMIT $3`,
    [userId, scope, limit],
  );
  res.json({
    actions: r.rows.map((x) => ({
      id: x.id, action: x.action, referenceType: x.reference_type, referenceId: x.reference_id,
      amountCoins: x.amount_coins == null ? null : String(x.amount_coins), amountDiamonds: x.amount_diamonds == null ? null : String(x.amount_diamonds),
      balanceBefore: x.balance_before == null ? null : String(x.balance_before), balanceAfter: x.balance_after == null ? null : String(x.balance_after),
      metadata: x.metadata, createdAt: x.created_at,
      actor: x.actor_id ? { id: x.actor_id, username: x.actor_username, displayName: x.actor_name, role: x.actor_role } : null,
      target: x.target_id ? { id: x.target_id, username: x.target_username, displayName: x.target_name } : null,
    })),
  });
});

router.get('/app-config', requireSuperAdmin, async (req, res) => {
  res.json({ config: maskSecrets(await getConfig()), defaults: CONFIG_DEFAULTS });
});

router.put('/app-config', requireSuperAdmin, async (req, res) => {
  // Maskeli SMTP şifresi geri geldiyse şifre değiştirilmez.
  const body = { ...(req.body ?? {}) };
  // Maskelenmiş gelen gizli anahtar "değiştirilmedi" demektir; olduğu gibi kaydedilirse
  // gerçek anahtar noktalarla ezilir ve depo çalışmaz durumda kalır.
  for (const k of ['smtpPass', 'r2SecretKey', 'r2AccessKey']) if (body[k] === SECRET_MASK) delete body[k];
  const patch = validateConfigPatch(body);
  // Kendi sürümünden yüksek bir "en düşük sürüm" yönetici dahil herkesi uygulamadan kilitlerdi.
  if (patch.minAppVersion && compareVersions(patch.minAppVersion, '0.0.0') > 0) {
    const mine = req.get('X-App-Version');
    // Web panelinden (uygulama sürümü başlığı yok) değiştirilirken bu denetim yapılmaz; panel ayrıca uyarır.
    if (!(req.get('X-Client') === 'web-panel' && !mine) && compareVersions(patch.minAppVersion, mine) > 0) {
      throw fail(`En düşük sürüm, şu an kullandığınız sürümden (${mine || 'bilinmiyor'}) yüksek olamaz; yoksa siz de uygulamaya giremezsiniz.`);
    }
  }
  // Şanslı hediye: gönderene dönen + alıcıya geçen pay hediye değerini aşamaz (platform zarar etmesin).
  const merged = { ...(await getConfig()), ...patch };
  if (merged.luckyRtpBps + merged.luckyReceiverBps > 9500) {
    throw fail('Şanslı hediyede geri dönüş (RTP) + alıcı payı en fazla %95 olabilir.');
  }
  const cfg = await saveConfig(patch, req.user.id);
  // Kayıtta gizli anahtarlar maskelenir: denetim defteri sırları saklamamalı.
  const safe = { ...patch };
  for (const k of ['smtpPass', 'r2SecretKey', 'r2AccessKey']) if (safe[k] !== undefined) safe[k] = SECRET_MASK;
  await auditStaff({ query }, req.user.id, null, 'app_config_update', safe);
  res.json({ config: maskSecrets(cfg) });
});

// Şanslı hediye havuzları: her şanslı hediyenin ana / büyük ödül havuzu, giren / çıkan ve gerçekleşen geri dönüş.

// Şanslı hediye havuzları: her şanslı hediyenin ana / büyük ödül havuzu, giren / çıkan ve gerçekleşen geri dönüş.
router.get('/lucky-pools', requireSuperAdmin, async (req, res) => {
  const r = await query(
    `SELECT g.id, g.name, g.coin_price, g.is_active, COALESCE(p.base_balance, 0) AS base_balance,
            COALESCE(p.jackpot_balance, 0) AS jackpot_balance, COALESCE(p.total_in, 0) AS total_in,
            COALESCE(p.total_out, 0) AS total_out, COALESCE(p.seeded, 0) AS seeded, COALESCE(p.jackpot_hits, 0) AS jackpot_hits
     FROM gifts g LEFT JOIN lucky_pools p ON p.gift_id = g.id
     WHERE g.category = 'lucky' ORDER BY g.coin_price, g.name`,
  );
  const coin = (v) => (BigInt(v) / 10000n).toString();
  res.json({
    jackpotOpen: JACKPOT_OPEN,
    pools: r.rows.map((x) => ({
      giftId: x.id, name: x.name, coinPrice: String(x.coin_price), active: x.is_active,
      base: coin(x.base_balance), jackpot: coin(x.jackpot_balance),
      openAt: (BigInt(x.coin_price) * BigInt(JACKPOT_OPEN)).toString(),
      totalIn: coin(x.total_in), totalOut: coin(x.total_out), seeded: coin(x.seeded), jackpotHits: Number(x.jackpot_hits),
    })),
  });
});

// Havuza yönetimden Coin eklemek (ör. açılışta büyük ödül havuzunu doldurmak). Eklenen tutar platformdan çıkar,
// ayrı tutulur ve denetim kaydına yazılır.

// Havuza yönetimden Coin eklemek (ör. açılışta büyük ödül havuzunu doldurmak). Eklenen tutar platformdan çıkar,
// ayrı tutulur ve denetim kaydına yazılır.
router.post('/lucky-pools/:giftId/seed', requireSuperAdmin, async (req, res) => {
  const giftId = uuid(req.params.giftId, 'Hediye');
  const target = oneOf(req.body?.pool ?? 'jackpot', ['base', 'jackpot'], 'Havuz');
  const coins = bigAmount(req.body?.coins, 'Miktar', { max: 100000000n });
  if (coins <= 0n) throw fail('Miktar 0\'dan büyük olmalı.');
  const gift = (await query(`SELECT id, name FROM gifts WHERE id = $1 AND category = 'lucky'`, [giftId])).rows[0];
  if (!gift) throw fail('Şanslı hediye bulunamadı.', 404);
  const units = (coins * 10000n).toString();
  const col = target === 'base' ? 'base_balance' : 'jackpot_balance';
  await query(
    `INSERT INTO lucky_pools(gift_id, ${col}, seeded) VALUES($1, $2, $2)
     ON CONFLICT (gift_id) DO UPDATE SET ${col} = lucky_pools.${col} + EXCLUDED.${col}, seeded = lucky_pools.seeded + EXCLUDED.seeded, updated_at = NOW()`,
    [giftId, units],
  );
  await auditStaff({ query }, req.user.id, null, 'lucky_pool_seed', { giftId, gift: gift.name, pool: target, coins: coins.toString() });
  res.json({ ok: true });
});

// SMTP ayarlarını denemek için yöneticinin yazdığı adrese deneme e-postası (kaydedilmiş ayarlarla).

// SMTP ayarlarını denemek için yöneticinin yazdığı adrese deneme e-postası (kaydedilmiş ayarlarla).
router.post('/app-config/test-mail', requireSuperAdmin, async (req, res) => {
  const to = normalizeEmail(req.body?.to);
  if (!to) throw fail('Geçerli bir e-posta adresi girin.');
  const c = await getConfig();
  if (!mailOn(c)) throw fail('Önce SMTP ayarlarını kaydedin.', 400);
  try {
    await sendMail({ host: c.smtpHost, port: c.smtpPort, secure: c.smtpSecure !== false, user: c.smtpUser, pass: c.smtpPass, from: c.smtpFrom || c.smtpUser },
      { to, subject: 'TR Live deneme e-postası', text: 'SMTP ayarların çalışıyor. Bu bir deneme e-postasıdır.' });
  } catch (e) {
    throw fail(`Gönderilemedi: ${e.message}`, 502);
  }
  res.json({ ok: true });
});

router.get('/moderation/strikes', requireSuperAdmin, async (req, res) => {
  const limit = Math.max(1, Math.min(Math.floor(Number(req.query.limit)) || 100, 300));
  const r = await query(
    `SELECT s.id, s.kind, s.context, s.sample, s.created_at, u.id AS uid, u.public_id, u.username, u.display_name, u.chat_restricted_until
     FROM moderation_strikes s JOIN users u ON u.id = s.user_id ORDER BY s.id DESC LIMIT $1`,
    [limit],
  );
  res.json({
    strikes: r.rows.map((x) => ({
      id: String(x.id), kind: x.kind, context: x.context, sample: x.sample, createdAt: x.created_at,
      user: { id: x.uid, publicId: x.public_id, username: x.username, displayName: x.display_name },
      restrictedUntil: x.chat_restricted_until && new Date(x.chat_restricted_until) > new Date() ? x.chat_restricted_until : null,
    })),
  });
});

// Sohbet kısıtı: dakika (0 = kaldır). Yardımcı admin de kullanabilir (yalnızca normal kullanıcılara).

// Sohbet kısıtı: dakika (0 = kaldır). Yardımcı admin de kullanabilir (yalnızca normal kullanıcılara).
router.post('/users/:userId/chat-restriction', async (req, res) => {
  const userId = uuid(req.params.userId, 'Kullanıcı');
  const target = await assertUser(userId);
  if (!mayActOnUser(req.user.system_role, target.system_role)) throw fail('Bu hesap üzerinde işlem yetkiniz yok.', 403);
  const minutes = req.body?.minutes;
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 10080) throw fail('Süre 0-10080 dakika olmalı (0 = kısıtı kaldır).');
  const r = await query(
    `UPDATE users SET chat_restricted_until = CASE WHEN $2::int = 0 THEN NULL ELSE NOW() + make_interval(mins => $2::int) END WHERE id = $1 RETURNING chat_restricted_until`,
    [userId, minutes],
  );
  await auditStaff({ query }, req.user.id, userId, 'chat_restriction', { minutes, by: req.user.system_role });
  if (minutes > 0) hub.sendToUser(userId, { type: 'chat_restricted', minutes });
  res.json({ ok: true, restrictedUntil: r.rows[0].chat_restricted_until });
});

// Cihazlar: kullanıcının oturumları ve aynı cihazı kullanan diğer hesaplar (çoklu hesap / hile tespiti).

// Cihazlar: kullanıcının oturumları ve aynı cihazı kullanan diğer hesaplar (çoklu hesap / hile tespiti).
router.get('/users/:userId/devices', requireSuperAdmin, async (req, res) => {
  const userId = uuid(req.params.userId, 'Kullanıcı');
  await assertUser(userId);
  const [sessions, linked] = await Promise.all([
    query(
      `SELECT id, device_id, device_name, platform, app_version, emulator, ip, created_at, last_used_at, revoked_at, revoke_reason
       FROM user_sessions WHERE user_id = $1 ORDER BY last_used_at DESC LIMIT 30`,
      [userId],
    ),
    query(
      `SELECT u.id, u.public_id, u.username, u.display_name, u.account_status, MAX(s.last_used_at) AS last_used_at
       FROM user_sessions s JOIN users u ON u.id = s.user_id
       WHERE s.user_id <> $1 AND s.device_id IN (SELECT device_id FROM user_sessions WHERE user_id = $1 AND device_id IS NOT NULL)
       GROUP BY u.id ORDER BY MAX(s.last_used_at) DESC LIMIT 50`,
      [userId],
    ),
  ]);
  res.json({
    sessions: sessions.rows.map((x) => ({
      id: x.id, deviceName: x.device_name, platform: x.platform, appVersion: x.app_version, emulator: x.emulator, ip: x.ip,
      createdAt: x.created_at, lastUsedAt: x.last_used_at, revokedAt: x.revoked_at, revokeReason: x.revoke_reason,
    })),
    online: hub.isOnline(userId),
    linkedAccounts: linked.rows.map((u) => ({ id: u.id, publicId: u.public_id, username: u.username, displayName: u.display_name, accountStatus: u.account_status, lastUsedAt: u.last_used_at })),
  });
});

// ---------------- Giriş bilgileri (yalnızca yönetici) ----------------
// Kullanıcı adı, telefon ve şifre. Şifre hiçbir zaman gösterilmez; yalnızca yenisi verilebilir.

// ---------------- Giriş bilgileri (yalnızca yönetici) ----------------
// Kullanıcı adı, telefon ve şifre. Şifre hiçbir zaman gösterilmez; yalnızca yenisi verilebilir.
router.get('/users/:userId/credentials', requireSuperAdmin, async (req, res) => {
  const userId = uuid(req.params.userId, 'Kullanıcı');
  const u = (await query(`SELECT username, phone, (password_hash IS NOT NULL) AS has_password FROM users WHERE id = $1`, [userId])).rows[0];
  if (!u) throw fail('Kullanıcı bulunamadı.', 404);
  res.json({ username: u.username, phone: u.phone ?? '', hasPassword: u.has_password });
});

// Giriş bilgilerini günceller. Gönderilmeyen alan değişmez. phone: '' → telefon kaldırılır.
// Şifre değişince kullanıcının tüm oturumları kapanır (yeni şifreyle yeniden giriş yapar).

// Giriş bilgilerini günceller. Gönderilmeyen alan değişmez. phone: '' → telefon kaldırılır.
// Şifre değişince kullanıcının tüm oturumları kapanır (yeni şifreyle yeniden giriş yapar).
router.post('/users/:userId/credentials', requireSuperAdmin, async (req, res) => {
  const userId = uuid(req.params.userId, 'Kullanıcı');
  const target = await assertUser(userId);
  if (target.account_status === 'deleted') throw fail('Silinmiş hesap değiştirilemez.', 409);
  if (!mayActOnUser(req.user.system_role, target.system_role, userId === req.user.id)) throw fail('Bu hesap üzerinde işlem yetkiniz yok.', 403);
  const b = req.body ?? {};
  const changes = {};
  if (b.username !== undefined && b.username !== null) {
    const username = String(b.username).trim().toLowerCase();
    if (!USERNAME_RE.test(username)) throw fail('Kullanıcı adı 3-30 karakter olmalı; yalnızca harf, rakam, nokta ve alt çizgi kullanılabilir.');
    if (username !== target.username) changes.username = username;
  }
  if (b.phone !== undefined && b.phone !== null) {
    const raw = String(b.phone).trim();
    if (raw === '') {
      changes.phone = null;
    } else {
      const phone = normalizePhone(raw);
      if (!phone) throw fail('Geçerli bir cep telefonu numarası girin (ör. 0555 123 45 67).');
      changes.phone = phone;
    }
  }
  let passwordHash = null;
  if (b.password !== undefined && b.password !== null && String(b.password) !== '') {
    passwordRules(String(b.password), { username: changes.username ?? target.username });
    passwordHash = await hashPassword(String(b.password));
  }
  if (!Object.keys(changes).length && !passwordHash) throw fail('Değiştirilecek bir bilgi yok.');
  try {
    await tx(async (c) => {
      const before = (await c.query(`SELECT username, phone FROM users WHERE id = $1 FOR UPDATE`, [userId])).rows[0];
      if ('phone' in changes && changes.phone === before.phone) delete changes.phone;
      const sets = []; const vals = [userId];
      for (const [k, v] of Object.entries(changes)) { vals.push(v); sets.push(`${k} = $${vals.length}`); }
      if (passwordHash) { vals.push(passwordHash); sets.push(`password_hash = $${vals.length}`, 'token_version = token_version + 1'); }
      if (sets.length) await c.query(`UPDATE users SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1`, vals);
      await auditStaff(c, req.user.id, userId, 'credentials_update', {
        username: changes.username ? { before: before.username, after: changes.username } : undefined,
        phone: 'phone' in changes ? { before: before.phone, after: changes.phone } : undefined,
        password: passwordHash ? 'changed' : undefined,
        by: req.user.system_role,
      });
    });
  } catch (error) {
    if (error.code === '23505') throw fail(String(error.constraint ?? '').includes('phone') ? 'Bu telefon numarası başka bir hesapta kayıtlı.' : 'Bu kullanıcı adı zaten kullanılıyor.', 409);
    throw error;
  }
  if (passwordHash) {
    await revokeAllSessions(userId, 'admin_password');
    hub.disconnectUser(userId, 'sessions_revoked');
  }
  const u = (await query(`SELECT username, phone FROM users WHERE id = $1`, [userId])).rows[0];
  res.json({ ok: true, username: u.username, phone: u.phone ?? '', passwordChanged: Boolean(passwordHash) });
});

// Kullanıcının tüm cihazlarındaki oturumları kapatır (hesap çalındı şüphesi vb.).

// Kullanıcının tüm cihazlarındaki oturumları kapatır (hesap çalındı şüphesi vb.).
router.post('/users/:userId/sessions/revoke-all', requireSuperAdmin, async (req, res) => {
  const userId = uuid(req.params.userId, 'Kullanıcı');
  const target = await assertUser(userId);
  if (!mayActOnUser(req.user.system_role, target.system_role) || userId === req.user.id) throw fail('Bu hesap üzerinde işlem yetkiniz yok.', 403);
  await query(`UPDATE users SET token_version = token_version + 1, updated_at = NOW() WHERE id = $1`, [userId]);
  const n = await revokeAllSessions(userId, 'admin');
  hub.disconnectUser(userId, 'sessions_revoked');
  await auditStaff({ query }, req.user.id, userId, 'sessions_revoke', { count: n });
  res.json({ ok: true, revoked: n });
});
