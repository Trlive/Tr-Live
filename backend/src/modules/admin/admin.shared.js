// admin modülünün ortak parçaları: import'lar, yetki yardımcıları, sabitler ve tablo eşlemeleri.
//
// admin.routes.js 2.391 satırdı. Konularına bölündü (users, coins, wip, catalog, support, dealers,
// agencies, events, finance, moderation, security). Bölme sırasında KOD DEĞİŞTİRİLMEDİ; yalnızca
// ortak bildirimler buraya alınıp dışa açıldı. API yüzeyi aynı: adres haritası testi bunu doğrular.
import { Router } from 'express';
import express from 'express';
import { query, tx } from '../../infrastructure/database/database.js';
import { SALARY_PAYABLE_SQL, creditPeriod, creditStatement, isWalletPeriod } from '../wallet/usd_wallet.service.js';
import { requireAuth, requireStaff, requireSuperAdmin, hashPassword, passwordRules } from '../../middleware/authentication/auth.js';
import { USERNAME_RE, normalizePhone } from '../auth/auth.routes.js';
import { supportMayCall, banEnd, mayActOnUser } from '../agencies/staff.rules.js';
import { fail, uuid, bigAmount, positiveInt, text, oneOf, httpsUrl, assetUrl } from '../../shared/errors/http.js';
import { prepareMp4 } from '../media/media_tools.service.js';
import * as budget from '../media/media_budget.service.js';
import { applyPackZip, packStatus } from '../assets/asset_packs.service.js';
import { SERVER_VERSION } from '../system/system.routes.js';
import { validateAgencyConfig } from '../agencies/agency.constants.js';
import {
  loadConfig, configJson, closePeriod, hostStatementJson, agencyStatementJson, assistantStatementJson, referralStatementJson,
} from '../wallet/payouts.service.js';
import { validatePayLevels, validateGrades, DEFAULT_PAY_LEVELS, BADGES, SPECIAL_ID_RE } from '../games/paytable.rules.js';
import { grantSpecialId, grantBadge } from '../agencies/agency_rewards.service.js';
import { applyTransfer, notifyTransferResult, logTransfer } from '../agencies/agency_ops.service.js';
import { notifyUser } from '../notifications/notify.service.js';
import { chargeBudget, listBudgets, periodKey, hiddenTxTypes, invalidateHidden } from '../wallet/coin_budgets.service.js';
import { runReconciliation, reconcileStatus } from '../wallet/reconcile.service.js';
import { parsePeriodKey, previousPeriod } from '../games/settlement.service.js';
import { ensureAgencyCode, TRANSFER_SELECT, transferJson } from '../agencies/agencies.routes.js';
import { equipIfNone, announceUserChange } from '../users/users.service.js';
import { EVENT_KINDS, EVENT_TITLES, isStar, validateRewards, rewardsView, defaultRules } from '../events/weekly_events.service.js';
import { cleanPublic } from '../../middleware/security/safe_text.js';
import { WIP_MIN_LEVEL, WIP_MAX_LEVEL, MAX_LEVEL, expForLevel, levelFromExp, levelExp } from '../users/levels.rules.js';
import { wipLabel } from '../system/wip.service.js';
import { dealerSell, setDealerParent } from '../dealers/dealers.service.js';
import { approveTopupRequest, rejectTopupRequest, requestView as topupRequestView } from '../dealers/dealer_topup.service.js';
import { hub } from '../../infrastructure/websocket/realtime.js';
import { JACKPOT_OPEN } from '../gifts/lucky.rules.js';
import { leaveRoom, closeRoom } from '../rooms/rooms.service.js';
import { banIpPersist, unbanIp, listBans, securityStats, userLimit, hitLimit } from '../../middleware/security/firewall.js';
import net from 'node:net';
import { saveUpload, removeUpload, removeAnimatedAvatar, IMAGE_TYPES, OWN_IMAGE_RE } from '../media/images.service.js';
import { revokeAllSessions } from '../users/sessions.service.js';
import { deleteAccount } from '../users/account_delete.service.js';
import { detectMedia, ensureVapc, mimeFor, MEDIA_MAX_BYTES } from '../media/media.service.js';
import { mediaCacheStats } from '../media/images.service.js';
import { getConfig, saveConfig, validateConfigPatch, compareVersions, CONFIG_DEFAULTS, maskSecrets, SECRET_MASK, mailOn } from '../system/app_config.service.js';
import { sendMail } from '../notifications/mailer.service.js';
import { normalizeEmail } from '../notifications/email_codes.service.js';
import { livekitHealth } from '../../infrastructure/livekit/livekit.js';
import { poolStats } from '../../infrastructure/database/database.js';
import fs from 'node:fs';
import os from 'node:os';
import { idempotent } from '../../middleware/validation/idempotency.js';
import { ghostNow, refreshGhost } from '../rooms/ghost.service.js';
import { mountPanelRoutes } from './admin_panel.routes.js';
import { config } from '../../config.js';
import { redactSecrets } from '../../middleware/security/redact.js';

export const INVENTORY_TYPES = ['frame', 'entrance_effect', 'badge', 'profile_effect'];

export const wipLevel = (v) => {
  const n = positiveInt(v, 'WIP seviyesi');
  if (n < WIP_MIN_LEVEL || n > WIP_MAX_LEVEL) throw fail(`WIP seviyesi ${WIP_MIN_LEVEL}-${WIP_MAX_LEVEL} arasında olmalı.`);
  return n;
};

export async function assertUser(id, run = query) {
  const u = (await run(`SELECT id, username, system_role, account_status FROM users WHERE id = $1`, [id])).rows[0];
  if (!u) throw fail('Kullanıcı bulunamadı.', 404);
  return u;
}

// Yardımcı admin (Coin yükleme, WIP, öğe, seviye) yalnızca normal kullanıcılara işlem yapar; yönetici herkese.

// Yardımcı admin (Coin yükleme, WIP, öğe, seviye) yalnızca normal kullanıcılara işlem yapar; yönetici herkese.
export const SUPPORT_COIN_LIMIT = 100000n;

export const SUPPORT_COIN_LOADS_PER_HOUR = 30;

export const groupDigits = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export const SUPPORT_LEVEL_LIMIT = 100;

export async function assertStaffTarget(req, userId) {
  const target = await assertUser(userId);
  if (req.user.system_role !== 'admin' && !mayActOnUser(req.user.system_role, target.system_role)) {
    throw fail('Bu hesap üzerinde işlem yetkiniz yok.', 403);
  }
  return target;
}

// ---------------- Kullanıcı arama ve durum ----------------

// Yönetimin koyduğu (süresi dolmamış) banı yalnızca yönetim değiştirir ya da kaldırır: yardımcı admin banı kısa süreli
// yeni bir banla değiştirip sonra kaldırarak bu kuralı aşamaz. Satır kilitlenir (eşzamanlı ban / kaldırma ile yarışmasın).
export async function lockBanState(c, userId, actorRole) {
  const cur = (await c.query(
    `SELECT u.account_status, (u.banned_until IS NULL OR u.banned_until > NOW()) AS ban_active, b.system_role AS banned_by_role
     FROM users u LEFT JOIN users b ON b.id = u.banned_by WHERE u.id = $1 FOR UPDATE OF u`,
    [userId],
  )).rows[0];
  if (actorRole !== 'admin' && cur?.account_status === 'banned' && cur.ban_active && cur.banned_by_role === 'admin') {
    throw fail('Bu banı yönetim koydu; yalnızca yönetim değiştirebilir veya kaldırabilir.', 403);
  }
  return cur;
}

export async function auditStaff(c, adminId, userId, action, meta) {
  await c.query(
    `INSERT INTO financial_audit_logs(admin_id, user_id, action, reference_type, metadata) VALUES($1,$2,$3,'user',$4)`,
    [adminId, userId, action, JSON.stringify(meta)],
  );
}

// Süreli veya süresiz ban. hours yoksa/0 ise süresiz.

export const FEATURE_TYPES = {
  nameColor: 'color', badge: 'string', maxRooms: 'int', viewVisitors: 'bool', vipGifts: 'bool', muteImmunity: 'bool', kickImmunity: 'bool',
  profileEffect: 'bool', customRoomTheme: 'bool', invisibleVisit: 'bool', animatedAvatar: 'bool', ghostMode: 'bool',
  hideCountry: 'bool', hideOnline: 'bool', hiddenUser: 'bool',
};

export function cleanFeatures(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail('Özellikler nesne olmalı.');
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    const type = FEATURE_TYPES[key];
    if (!type) throw fail(`Bilinmeyen özellik: ${key}`);
    if (type === 'bool' && typeof value !== 'boolean') throw fail(`${key} true/false olmalı.`);
    if (type === 'int' && (!Number.isInteger(value) || value < 1 || value > 50)) throw fail(`${key} 1-50 arasında tam sayı olmalı.`);
    if (type === 'color' && value !== null && !/^#[0-9a-fA-F]{6}$/.test(String(value))) throw fail(`${key} #RRGGBB olmalı.`);
    if (type === 'string' && value !== null && (typeof value !== 'string' || value.length > 40)) throw fail(`${key} geçersiz.`);
    out[key] = value;
  }
  return out;
}

// ---------------- Katalog (yalnızca yönetici) ----------------
export function guessFormat(url) {
  const m = /\.([a-z0-9]{2,5})(\?|$)/i.exec(String(url ?? ''));
  const e = (m?.[1] ?? '').toLowerCase();
  return { mp4: 'mp4', svga: 'svga', json: 'lottie', webp: 'webp', gif: 'gif', png: 'png' }[e] ?? 'lottie';
}
// ---------------- Müşteri hizmetleri (admin + yardımcı admin) ----------------

// Renkli ID (Görünüm'de takılır): kullanıcının ID'si bronz / gümüş / altın parıltılı yazılır. Dosyasız, kodla çizilir.
export const COLORED_IDS = Object.freeze({ bronz: 'Bronz Renkli ID', gumus: 'Gümüş Renkli ID', altin: 'Altın Renkli ID' });
// STORE_CATS aşağıda tanımlı: liste istek anında kurulur (modül yüklenirken TDZ hatası olmasın).

// STORE_CATS aşağıda tanımlı: liste istek anında kurulur (modül yüklenirken TDZ hatası olmasın).
export const grantCats = () => [...STORE_CATS, 'colored_id'];

// Yönetici "öğe ver" listesi: kategoriye göre tüm katalog öğeleri.

// Test örnekleri: her görünüm türünden birer örnek ürün (mağazada satılmaz) oluşturur ve yöneticinin kendisine
// 30 günlüğüne verip takar. Odaya girince araç, sohbette balon, mikrofonda dalga, profil/oda kartı denenebilir.
export const SAMPLE_ITEMS = [
  ['vehicle', 'Örnek Araç', 'vehicle.png'],
  ['chat_bubble', 'Örnek Sohbet Balonu', 'chat_bubble.png'],
  ['mic_wave', 'Örnek Mikrofon Dalgası', 'mic_wave.png'],
  ['frame', 'Örnek Çerçeve', 'frame.png'],
  ['mini_card', 'Örnek Profil Kartı', 'profile_card.png'],
  ['room_card', 'Örnek Oda Kartı', 'room_card.png'],
];

export const SAMPLE_DIR = new URL('../samples/', import.meta.url);

// Hazır hediye / çerçeve paketi (TR-Live-paket-N.zip): telefondan doğrudan yüklenir ve hemen uygulanır.
export let packBusy = false;

// Sunucu (Oracle kurulumu): güncelleme / kurulum kayıtları ve "şimdi güncelle" isteği.
// Kayıtlar sunucudaki /opt/trlive/state klasöründen gelir (compose ile /srv/state'e bağlı); yoksa boş döner.
export const STATE_DIR = '/srv/state';

export function tailFile(name, lines) {
  try {
    // Şifre / anahtar / token içeren satırlar gizlenir (kayıtlar telefonda gösterilir).
    return redactSecrets(fs.readFileSync(`${STATE_DIR}/${name}`, 'utf8').split('\n').slice(-lines).join('\n').trim());
  } catch {
    return null;
  }
}

// İkon verilmediyse animasyondan otomatik: görsel dosyada kendisi, yüklenmiş mp4'te ortalardaki kare.
export async function autoIcon(animationUrl, userId) {
  if (!animationUrl) return null;
  if (/\.(png|jpe?g|webp|gif)(\?|$)/i.test(animationUrl)) return animationUrl;
  const m = /^\/media\/([0-9a-f-]{36})\.mp4$/i.exec(animationUrl);
  if (!m) return null;
  try {
    const row = (await query('SELECT data FROM media_files WHERE id = $1', [m[1]])).rows[0];
    if (!row) return null;
    const p = await prepareMp4(row.data, 'auto', { iconOnly: true });
    if (!p?.icon) return null;
    const ins = await query(
      `INSERT INTO media_files(kind, mime, ext, size_bytes, data, meta, created_by) VALUES('png','image/png','png',$1,$2,$3,$4) RETURNING id`,
      [p.icon.length, p.icon, JSON.stringify({ purpose: 'auto_icon' }), userId],
    );
    return `/media/${ins.rows[0].id}.png`;
  } catch (e) {
    console.error('Otomatik ikon yapılamadı:', e.message);
    return null;
  }
}
// Küçük resmi olmayan hediyelere animasyondan otomatik küçük resim yapar.
// Her çağrıda en fazla 3 hediye (istek kısa sürsün); uygulama "kalan" bitene kadar tekrar çağırır.

// Küçük resmi olmayan hediyelere animasyondan otomatik küçük resim yapar.
// Her çağrıda en fazla 3 hediye (istek kısa sürsün); uygulama "kalan" bitene kadar tekrar çağırır.
export let filling = false;

export const STORE_CATS = ['frame', 'chat_bubble', 'entrance_effect', 'mini_card', 'mic_wave', 'vehicle', 'badge', 'room_card'];
// Yönetimden ayrı ayrı verilebilen WIP öğeleri (kategori → ad eki).

// Yönetimden ayrı ayrı verilebilen WIP öğeleri (kategori → ad eki).
export const WIP_GRANT_KIND = { frame: 'çerçevesi', chat_bubble: 'sohbet balonu', badge: 'rozeti', entrance_effect: 'giriş efekti', vehicle: 'aracı' };

// Silme: geçmişte kullanılmışsa (satın alma/hediye kaydı) kayıtlar bozulmasın diye gizlenir, aksi halde tamamen silinir.
export async function removeOrHide(res, table, id, usedBy) {
  try {
    const r = await query(`DELETE FROM ${table} WHERE id = $1 RETURNING id`, [id]);
    if (!r.rowCount) throw fail('Kayıt bulunamadı.', 404);
    res.json({ ok: true, hidden: false });
  } catch (e) {
    if (e?.code !== '23503') throw e;
    await query(`UPDATE ${table} SET is_active = FALSE WHERE id = $1`, [id]);
    res.json({ ok: true, hidden: true, note: usedBy });
  }
}

export const TOGGLE_TABLES = { gifts: 'gifts', frames: 'frames', 'entrance-effects': 'entrance_effects', music: 'music_tracks' };

// Ad / fiyat düzenleme (hediye, çerçeve, mağaza ürünü). Gönderilmeyen alan değişmez.
export const GIFT_TABS = ['event', 'popular', 'private', 'vip', 'lucky', 'cp'];

export async function agencyIdByCode(code, run = query) {
  const c = String(code ?? '').trim();
  if (!/^\d{8}$/.test(c)) throw fail('Davet eden ajans kodu 8 haneli olmalı.');
  const a = (await run(`SELECT id FROM agencies WHERE agency_code = $1 AND status = 'active'`, [c])).rows[0];
  if (!a) throw fail('Bu koda ait aktif ajans bulunamadı.', 404);
  return a.id;
}

/** Ajans açar (transaction içinde): kişi ajans sahibi olur, ajans doğrudan aktiftir. */

export async function createAgency(c, { userId, name, description = null, adminId, referrerAgencyId = null }) {
  const u = (await c.query(`SELECT id, account_status FROM users WHERE id = $1 FOR UPDATE`, [userId])).rows[0];
  if (!u || u.account_status !== 'active') throw fail('Kullanıcı bulunamadı veya hesabı aktif değil.', 404);
  if ((await c.query(`SELECT 1 FROM agencies WHERE owner_id = $1 AND status <> 'rejected'`, [userId])).rowCount) {
    throw fail('Bu kullanıcının zaten bir ajansı var.', 409);
  }
  // Ajans sahibi aynı anda başka ajansın asistanı olamaz.
  await c.query(`UPDATE agency_assistants SET status = 'resigned', ended_at = NOW() WHERE user_id = $1 AND status IN ('active','pending')`, [userId]);
  const row = (await c.query(
    `INSERT INTO agencies(name, owner_id, description, status, approved_by, approved_at, referrer_agency_id) VALUES($1,$2,$3,'active',$4,NOW(),$5) RETURNING *`,
    [name, userId, description, adminId, referrerAgencyId],
  )).rows[0];
  await c.query(
    `INSERT INTO financial_audit_logs(admin_id, user_id, action, reference_type, reference_id, metadata) VALUES($1,$2,'agency_create','agency',$3,$4)`,
    [adminId, userId, row.id, JSON.stringify({ name, referrerAgencyId })],
  );
  return row;
}

export const agencyDupError = (error) => {
  if (error.code === '23505') return fail(error.constraint === 'idx_agencies_owner' ? 'Bu kullanıcının zaten bir ajansı var.' : 'Bu ajans adı kullanılıyor.', 409);
  return error;
};

// Yönetici bir kullanıcıyı (ID / kullanıcı adı ile seçilir) ajans sahibi yapar; ajans doğrudan aktif açılır.

export const SETTING_COLUMNS = {
  cycle: 'cycle', penaltyBps: 'penalty_bps', requireOfficialEvents: 'require_official_events', minEventCount: 'min_event_count', currency: 'currency',
  validDayMinutes: 'valid_day_minutes', requireGameHours: 'require_game_hours', allowBalanceMethod: 'allow_balance_method',
  maxAssistants: 'max_assistants', maxAssistantBps: 'max_assistant_bps', referralBps: 'referral_bps', transferWaitHours: 'transfer_wait_hours',
  splitByRoomType: 'split_by_room_type', videoDailyCapMinutes: 'video_daily_cap_minutes', videoMinSessionMinutes: 'video_min_session_minutes',
  videoShortfallCutBps: 'video_shortfall_cut_bps',
  // Ağırlıklı maaş hak edişi. salaryWeights JSONB olduğu için burada DEĞİL, ayrı
  // doğrulamadan geçirilerek yazılıyor (validateWeights).
  salaryWeightedEnabled: 'salary_weighted_enabled', salaryAutoTransfer: 'salary_auto_transfer',
  salaryTransferDayFrom: 'salary_transfer_day_from', salaryTransferDayTo: 'salary_transfer_day_to',
};

// kind: 'audio' (sesli oda tablosu) | 'video' (görüntülü yayın tablosu).
export const payTableOf = (kind) => (kind === 'video' ? 'host_pay_levels_video' : 'host_pay_levels');

export async function savePayLevels(c, levels, kind = 'audio') {
  const table = payTableOf(kind);
  await c.query(`DELETE FROM ${table}`);
  for (const l of levels) {
    await c.query(
      `INSERT INTO ${table}(level, required_days, required_hours, game_hours, diamonds, salary1_cents, salary2_cents, agency_cents,
         vip_level, vip_days, badge, special_id_days, special_id_count) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [l.level, l.days, l.hours, l.gameHours, l.diamonds.toString(), l.salary1Cents.toString(), l.salary2Cents.toString(), l.agencyCents.toString(),
        l.vipLevel, l.vipDays, l.badge, l.specialIdDays, l.specialIdCount],
    );
  }
}

export const STATEMENT_TABLES = {
  host: { table: 'host_statements', amount: 'salary_cents', action: 'host_salary_paid' },
  agency: { table: 'agency_statements', amount: 'owner_cents', action: 'agency_commission_paid' },
  assistant: { table: 'assistant_statements', amount: 'amount_cents', action: 'assistant_share_paid' },
  referral: { table: 'referral_statements', amount: 'amount_cents', action: 'referral_reward_paid' },
};

// Ödeme platform dışında (banka / havale vb.) yapılır; burada "ödendi" işaretlenir ve isteğe bağlı not (dekont no) yazılır.
// Yayıncı maaşı için KYC onayı şarttır.

// ================= Canlı panel, hata kayıtları, işlem kaydı, uzaktan ayarlar, moderasyon =================
export const PKG_VERSION = (() => {
  try { return JSON.parse(fs.readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')).version; } catch { return null; }
})();

// CPU kullanımı: iki panel isteği arasındaki ortalama (tek çekirdeğe göre yüzde).

// CPU kullanımı: iki panel isteği arasındaki ortalama (tek çekirdeğe göre yüzde).
export let cpuSample = { at: Date.now(), usage: process.cpuUsage() };

export function cpuPercent() {
  const now = Date.now();
  const used = process.cpuUsage(cpuSample.usage);
  const elapsed = Math.max(1, now - cpuSample.at);
  cpuSample = { at: now, usage: process.cpuUsage() };
  return Math.round(((used.user + used.system) / 1000 / elapsed) * 1000) / 10;
}

export const mb = (n) => Math.round((Number(n) / 1048576) * 10) / 10;
// "Bugün" Türkiye saatine göre gece yarısından başlar.

// "Bugün" Türkiye saatine göre gece yarısından başlar.
export const DASH_SQL = `
  WITH d AS (SELECT (date_trunc('day', NOW() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul') AS start)
  SELECT
    (SELECT COUNT(*)::int FROM users, d WHERE users.created_at >= d.start) AS new_users,
    (SELECT COUNT(*)::int FROM users, d WHERE users.last_seen_at >= d.start) AS active_users,
    (SELECT COUNT(*)::int FROM users WHERE account_status = 'active') AS total_users,
    (SELECT COUNT(*)::int FROM gift_transactions g, d WHERE g.created_at >= d.start) AS gifts,
    (SELECT COALESCE(SUM(g.coin_amount), 0)::text FROM gift_transactions g, d WHERE g.created_at >= d.start) AS gift_coins,
    (SELECT COUNT(*)::int FROM room_messages m, d WHERE m.created_at >= d.start) AS room_messages,
    (SELECT COUNT(*)::int FROM direct_messages m, d WHERE m.created_at >= d.start) AS direct_messages,
    (SELECT COUNT(*)::int FROM moderation_strikes s, d WHERE s.created_at >= d.start AND s.kind <> 'auto_mute') AS strikes,
    (SELECT COUNT(*)::int FROM moderation_strikes s, d WHERE s.created_at >= d.start AND s.kind = 'auto_mute') AS auto_mutes,
    (SELECT COUNT(*)::int FROM reports WHERE status = 'open') AS open_reports,
    (SELECT COUNT(*)::int FROM client_errors WHERE created_at > NOW() - INTERVAL '24 hours') AS errors_24h,
    (SELECT COUNT(*)::int FROM rooms WHERE is_active) AS active_rooms,
    (SELECT COUNT(*)::int FROM rooms WHERE is_active AND room_type = 'video') AS video_rooms,
    (SELECT COUNT(*)::int FROM room_members) AS room_members,
    (SELECT COUNT(*)::int FROM room_members WHERE microphone) AS on_mic,
    (SELECT COUNT(*)::int FROM user_sessions WHERE revoked_at IS NULL AND expires_at > NOW()) AS sessions`;

// Alt rota dosyaları bu modülden tek elden import eder: aynı paketi 11 yerde import etmek yerine
// ortak kapı. Adlar bölmeden önceki ile birebir aynı.
export { BADGES, CONFIG_DEFAULTS, SALARY_PAYABLE_SQL, DEFAULT_PAY_LEVELS, EVENT_KINDS, EVENT_TITLES, IMAGE_TYPES, JACKPOT_OPEN, MAX_LEVEL, MEDIA_MAX_BYTES, OWN_IMAGE_RE, Router, SECRET_MASK, SERVER_VERSION, SPECIAL_ID_RE, TRANSFER_SELECT, USERNAME_RE, WIP_MAX_LEVEL, WIP_MIN_LEVEL, agencyStatementJson, announceUserChange, applyPackZip, applyTransfer, approveTopupRequest, assetUrl, assistantStatementJson, banEnd, banIpPersist, bigAmount, budget, chargeBudget, cleanPublic, closePeriod, closeRoom, compareVersions, config, configJson, creditPeriod, creditStatement, dealerSell, setDealerParent, defaultRules, deleteAccount, detectMedia, ensureAgencyCode, ensureVapc, equipIfNone, expForLevel, express, fail, fs, getConfig, ghostNow, grantBadge, grantSpecialId, hashPassword, hitLimit, hostStatementJson, httpsUrl, hub, idempotent, isStar, isWalletPeriod, hiddenTxTypes, invalidateHidden, leaveRoom, levelExp, levelFromExp, listBans, listBudgets, livekitHealth, loadConfig, logTransfer, mailOn, maskSecrets, mayActOnUser, mediaCacheStats, mimeFor, mountPanelRoutes, net, normalizeEmail, normalizePhone, notifyTransferResult, notifyUser, oneOf, os, packStatus, parsePeriodKey, passwordRules, periodKey, poolStats, positiveInt, prepareMp4, previousPeriod, query, reconcileStatus, redactSecrets, referralStatementJson, refreshGhost, rejectTopupRequest, removeAnimatedAvatar, removeUpload, requireAuth, requireStaff, requireSuperAdmin, revokeAllSessions, rewardsView, runReconciliation, saveConfig, saveUpload, securityStats, sendMail, supportMayCall, text, topupRequestView, transferJson, tx, unbanIp, userLimit, uuid, validateAgencyConfig, validateConfigPatch, validateGrades, validatePayLevels, validateRewards, wipLabel };
