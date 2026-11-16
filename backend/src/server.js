import { refreshCappedLevels } from './services/users.js';
import http from 'node:http';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config, validateConfig } from './config.js';
import { query, closeDb } from './database.js';
import { authenticateToken } from './auth.js';
import { attachRealtime, hub } from './realtime.js';
import { isRoomMember, startRoomSweeper } from './services/rooms.js';
import { cachedMedia, rememberMedia } from './services/images.js';
import { presenceSnapshot, recordPresence, canSignalTyping, isGhost } from './services/presence.js';
import { pruneIdempotencyKeys } from './idempotency.js';
import { pruneRoomBans } from './services/room_bans.js';
import { promoteBootstrapAdmins } from './services/bootstrap.js';
import { nonOverlapping } from './ticker.js';
import { router as authRouter } from './routes/auth.js';
import { router as authSocialRouter } from './routes/auth_social.js';
import { router as eventsRouter } from './routes/events.js';
import { startWeeklyEventsTicker } from './services/weekly_events.js';
import { startNotificationJanitor } from './services/notify.js';
import { router as meRouter } from './routes/me.js';
import { router as usersRouter } from './routes/users.js';
import { router as inventoryRouter } from './routes/inventory.js';
import { router as roomsRouter } from './routes/rooms.js';
import { router as familiesRouter } from './routes/families.js';
import { router as wipRouter } from './routes/wip.js';
import { router as dealersRouter } from './routes/dealers.js';
import { router as adminRouter } from './routes/admin.js';
import { router as giftsRouter } from './routes/gifts.js';
import { router as agenciesRouter } from './routes/agencies.js';
import { router as agencyCenterRouter } from './routes/agency_center.js';
import { startTransferTicker } from './services/agency_ops.js';
import { startPrivacySweeper } from './services/privacy.js';
import { router as musicRouter } from './routes/music.js';
import { router as chatRouter } from './routes/chat.js';
import { router as messagesRouter } from './routes/messages.js';
import { router as friendsRouter } from './routes/friends.js';
import { router as cpRouter, startRelationRefundTicker } from './routes/cp.js';
import { router as guardianRouter } from './routes/guardian.js';
import { startGuardianTicker } from './services/guardian.js';
import { startFamilyJanitor } from './services/family.js';
import { router as storeRouter } from './routes/store.js';
import { router as micSkinsRouter, adminRouter as micSkinsAdminRouter } from './routes/mic_skins.js';
import { router as roomThemesRouter, adminRouter as roomThemesAdminRouter } from './routes/room_themes.js';
import { router as checkinRouter } from './routes/checkin.js';
import { router as verifyRouter } from './routes/verify.js';
import { router as screenshotsRouter, adminRouter as screenshotsAdminRouter, pruneScreenshots } from './routes/screenshots.js';
import { router as supportRouter } from './routes/support.js';
import { router as safetyRouter } from './routes/safety.js';
import { router as leaderboardsRouter } from './routes/leaderboards.js';
import { router as pkRouter } from './routes/pk.js';
import { router as gamesRouter } from './routes/games.js';
import { router as feedRouter } from './routes/feed.js';
import { router as systemRouter } from './routes/system.js';
import { router as roomActivitiesRouter } from './routes/room_activities.js';
import { router as usdRouter, adminRouter as usdAdminRouter } from './routes/usd.js';
import { router as roomGamePageRouter } from './routes/room_game_page.js';
import { router as dealerTopupPageRouter } from './routes/dealer_topup_page.js';
import { getConfig, compareVersions } from './services/app_config.js';
import { startMusicTicker } from './services/music.js';
import { router as luckyRouter, startBagTicker } from './routes/luckybag.js';
import { startAvatarSweeper } from './services/avatar_sweeper.js';
import { startSkinSweeper } from './services/mic_skins.js';
import { startThemeSweeper, seedThemeImages } from './services/room_themes.js';
import { startPkTicker } from './services/pk.js';
import { startGameTicker } from './services/games.js';
import { closeStaleMicSessions } from './services/mic.js';
import { seedAssetPacks } from './asset_packs.js';
import { firewall, bodyGuard, ipLimit, loadBans, startFirewallJanitor, wsClientIp, isBanned, noteViolation } from './firewall.js';

validateConfig();

export const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', config.trustProxy);
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: { maxAge: 31536000, includeSubDomains: true },
}));
app.use(firewall()); // IP yasağı, WAF kuralları, IP başına hız sınırı (CORS ve gövde okumadan önce)
app.use(cors({
  origin: config.corsOrigin.includes('*') ? true : config.corsOrigin,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-App-Version', 'Idempotency-Key', 'X-Client'],
}));
app.use(express.json({ limit: '100kb' }));
app.use(bodyGuard()); // derin/dev JSON ve prototype pollution anahtarlarını reddeder
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

app.get(['/health', '/api/health'], async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ ok: true, service: 'tr-live-backend', time: new Date().toISOString() });
  } catch (e) {
    // Sebep yalnızca günlüğe yazılır (adres/şifre ayrıntısı dışarı verilmez).
    console.error('[sağlık] veritabanı yanıt vermiyor:', dbDownReason(e) ?? e.message);
    res.status(503).json({ ok: false, db: false });
  }
});

app.get('/media/:file', async (req, res) => {
  // ".s200" eki: çerçevenin gösterim oranı (uygulama okur); dosya aynı.
  const m = /^([0-9a-f-]{36})(?:\.s\d{3})?\.[a-z0-9]{2,5}$/.exec(req.params.file);
  if (!m) return res.status(404).end();
  const headers = { 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'cross-origin', ETag: `"${m[1]}"` };
  // Dosyalar değişmez (yeni yükleme = yeni kimlik): istemcide varsa gövde gönderilmez.
  if (req.headers['if-none-match'] === headers.ETag) return res.status(304).set(headers).end();
  let hit = cachedMedia(m[1]);
  if (!hit) {
    const r = await query('SELECT mime, data FROM media_files WHERE id = $1', [m[1]]);
    if (!r.rowCount) return res.status(404).end();
    hit = r.rows[0];
    rememberMedia(m[1], hit.mime, hit.data);
  }
  res.set({ ...headers, 'Content-Type': hit.mime });
  res.send(hit.data);
});

app.use('/uploads', express.static(config.uploadDir, {
  maxAge: '7d', index: false, dotfiles: 'deny',
  setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
}));

// Giriş/kayıt IP başına sınırlı. Token yenileme ve çıkış bu ortak sınıra sayılmaz: operatörler (CGNAT) binlerce
// kullanıcıyı aynı IP'den çıkarır, saatlik yenilemeler sınırı doldurup herkesi oturumdan atardı.
// Zorunlu güncelleme: yönetim panelindeki "en düşük sürüm"ün altındaki uygulamalar (X-App-Version başlığı
// göndermeyen eski sürümler dahil) 426 alır ve uygulama "Güncelleme gerekli" ekranını gösterir.
const UPDATE_EXEMPT = new Set(['/health', '/app/config', '/client-errors', '/auth/logout', '/push/latest',
  // Google/Facebook dönüşü tarayıcıdan gelir (uygulama sürümü başlığı yok).
  '/auth/oauth/google/callback', '/auth/oauth/facebook/callback', '/legal/privacy', '/legal/privacy.json', '/legal/data-deletion', '/legal/terms']);
app.use('/api', async (req, res, next) => {
  if (UPDATE_EXEMPT.has(req.path) || req.path.startsWith('/emoji/')) return next(); // emoji görselleri sürüm başlığı göndermez
  // Web yönetim/ajans paneli bir uygulama sürümü değildir: zorunlu güncelleme ona uygulanmaz.
  if (req.get('X-Client') === 'web-panel') return next();
  const c = await getConfig();
  if (compareVersions(c.minAppVersion, '0.0.0') === 0) return next();
  if (compareVersions(req.get('X-App-Version'), c.minAppVersion) >= 0) return next();
  res.status(426).json({ code: 'update_required', message: c.updateMessage, minVersion: c.minAppVersion, updateUrl: c.updateUrl || null });
});
app.use('/api', systemRouter);
// Oda içi etkinlikler H5 sayfası (WebView). /api dışındadır; kendi CSP'sini ve token denetimini uygular.
app.use('/room-activities', roomActivitiesRouter);
app.use('/room-game', roomGamePageRouter); // oda içi oyun sayfası (WebView): TEK kart oyunu
app.use('/dealer-topup', dealerTopupPageRouter); // bayi bakiye talebi H5 sayfası (WebView)

const authIpLimit = ipLimit('auth', 60, 15 * 60e3);
// /oauth/poll: uygulama giriş sonucunu birkaç saniyede bir sorar; kendi sınırı vardır (ortak sınırı doldurmasın).
app.use('/api/auth', (req, res, next) => (['/refresh', '/logout', '/oauth/poll'].includes(req.path) ? next() : authIpLimit(req, res, next)), authRouter, authSocialRouter);
app.use('/api/verify', verifyRouter);
app.use('/api/me', meRouter);
app.use('/api/users', usersRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/rooms', roomsRouter);
app.use('/api/rooms', chatRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/friends', friendsRouter);
app.use('/api/cp', cpRouter);
app.use('/api/guardians', guardianRouter);
app.use('/api/store', storeRouter);
app.use('/api/mic-skins', micSkinsRouter);
app.use('/api/admin/mic-skins', micSkinsAdminRouter);
app.use('/api/room-themes', roomThemesRouter);
app.use('/api/admin/room-themes', roomThemesAdminRouter);
app.use('/api/screenshots', screenshotsRouter);
app.use('/api/checkin', checkinRouter);
app.use('/api/admin/screenshots', screenshotsAdminRouter);
app.use('/api/support', supportRouter);
app.use('/api/leaderboards', leaderboardsRouter);
app.use('/api/families', familiesRouter);
app.use('/api/wip', wipRouter);
app.use('/api/dealer', dealersRouter);
app.use('/api/admin/usd', usdAdminRouter); // dolar cüzdanı yönetimi (çekim talepleri); genel admin yönlendiricisinden önce
app.use('/api/admin', adminRouter);
app.use('/api/usd', usdRouter); // dolar cüzdanı: bakiye, admin'e ve bayiye gönderim
app.use('/api/events', eventsRouter);
// Aşağıdakiler '/api' altında birden çok yol tanımladığı için en sona konur.
app.use('/api', feedRouter);
app.use('/api', giftsRouter);
app.use('/api', agenciesRouter);
app.use('/api', agencyCenterRouter);
app.use('/api', musicRouter);
app.use('/api', luckyRouter);
app.use('/api', pkRouter);
app.use('/api', gamesRouter);
app.use('/api', safetyRouter);

app.use('/api', (req, res) => res.status(404).json({ message: 'Adres bulunamadı.' }));

const PG_ERRORS = {
  '22P02': [400, 'Geçersiz değer gönderildi.'],
  '22001': [400, 'Bir alan izin verilen uzunluğu aşıyor.'],
  '22003': [400, 'Sayısal değer izin verilen aralığın dışında.'],
  '23505': [409, 'Bu kayıt zaten mevcut.'],
  '23503': [400, 'İlişkili kayıt bulunamadı.'],
  '23514': [400, 'Değer kurallara uymuyor.'],
  '40P01': [409, 'İşlem çakıştı, lütfen tekrar deneyin.'],
  '40001': [409, 'İşlem çakıştı, lütfen tekrar deneyin.'],
};

// Veritabanına ulaşılamıyor / şifre yanlış / sertifika reddedildi: kullanıcıya "sunucu hatası" yerine ne olduğunu söyle,
// günlüğe de sebebi açıkça yaz (Render Logs'ta görülsün).
const DB_DOWN = {
  '28P01': 'veritabanı şifresi yanlış (DATABASE_URL içindeki şifre güncel mi?)',
  '28000': 'veritabanı kullanıcısına izin verilmedi',
  '3D000': 'veritabanı adı bulunamadı (DATABASE_URL sonundaki ad)',
  '53300': 'veritabanı bağlantı sınırı doldu',
  '57P01': 'veritabanı kapatıldı/yeniden başlatılıyor',
  '57P03': 'veritabanı henüz açılmadı',
  ECONNREFUSED: 'veritabanı bağlantıyı reddetti (servis kapalı olabilir)',
  ENOTFOUND: 'veritabanı adresi bulunamadı (DATABASE_URL)',
  EAI_AGAIN: 'veritabanı adresi çözümlenemedi',
  ETIMEDOUT: 'veritabanına bağlanırken zaman aşımı',
  ECONNRESET: 'veritabanı bağlantısı koptu',
  SELF_SIGNED_CERT_IN_CHAIN: 'veritabanı sertifikası reddedildi (DATABASE_SSL=no-verify yapın)',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'veritabanı sertifikası reddedildi (DATABASE_SSL=no-verify yapın)',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'veritabanı sertifikası doğrulanamadı (DATABASE_SSL=no-verify yapın)',
};
function dbDownReason(error) {
  if (DB_DOWN[error?.code]) return DB_DOWN[error.code];
  if (/Connection terminated|timeout exceeded when trying to connect|connect ETIMEDOUT/i.test(error?.message ?? '')) return 'veritabanına bağlanılamadı';
  return null;
}

// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  const down = dbDownReason(error);
  if (down) {
    console.error(`[veritabanı] ${req.method} ${req.originalUrl}: ${down} — ${error.message}`);
    // Kısa hata kodu mesajda görünür: günlüğe bakılamasa da ekran görüntüsünden sebep anlaşılır (adres/şifre içermez).
    const tag = String(error.code || 'baglanti').slice(0, 32);
    return res.status(503).json({ message: `Sunucu şu an veritabanına bağlanamıyor (kod: ${tag}). Lütfen biraz sonra tekrar deneyin.`, code: 'db_unavailable' });
  }
  if (error.type === 'entity.parse.failed') return res.status(400).json({ message: 'Geçersiz JSON.' });
  if (error.type === 'entity.too.large') return res.status(413).json({ message: 'İstek çok büyük.' });
  if (error.status && error.status >= 400 && error.status < 500) return res.status(error.status).json({ message: error.message });
  if (error.status === 503) return res.status(503).json({ message: error.message });
  const pg = PG_ERRORS[error.code];
  if (pg) return res.status(pg[0]).json({ message: pg[1] });
  console.error(`[hata] ${req.method} ${req.originalUrl}:`, error);
  res.status(500).json({ message: 'Sunucu hatası.' });
});

const server = http.createServer(app);
// Boşta bağlantı 125 sn açık kalır: önündeki Caddy (2 dk) ve telefonlar aynı bağlantıyı yeniden kullanır, her istekte
// yeni bağlantı/TLS kurulmaz (daha az internet ve pil). headersTimeout keepAliveTimeout'tan büyük olmalı.
server.keepAliveTimeout = 125000;
server.headersTimeout = 126000;
attachRealtime(server, {
  authenticate: authenticateToken,
  isRoomMember,
  ipOf: wsClientIp,
  isBanned,
  onViolation: (ip, type, opts) => noteViolation(ip, type, opts),
  maxSocketsPerIp: config.firewall.wsPerIp,
  onPresence: (userId) => recordPresence(userId),
  presenceSnapshot,
  canTyping: canSignalTyping,
  // Gizli kullanıcı, "durumumu gizle" ve hayalet (SWIP) kullanıcılar çevrimiçi görünmez.
  isPresenceVisible: async (u) => u.show_presence !== false && !u.is_hidden && !(await isGhost(u.id)),
});
const sweeper = startRoomSweeper();
const musicTicker = startMusicTicker();
const bagTicker = startBagTicker();
const avatarSweeper = startAvatarSweeper();
const skinSweeper = startSkinSweeper();
const themeSweeper = startThemeSweeper();
const screenshotPruner = setInterval(() => pruneScreenshots().catch((e) => console.error('Ekran görüntüsü kayıt temizliği:', e.message)), 6 * 3600e3);
const pkTicker = startPkTicker();
const gameTicker = startGameTicker();
const eventsTicker = startWeeklyEventsTicker();
const notifyJanitor = startNotificationJanitor();
const relationTicker = startRelationRefundTicker();
const guardianTicker = startGuardianTicker();
const familyJanitor = startFamilyJanitor();
const transferTicker = startTransferTicker();
const privacySweeper = startPrivacySweeper();
closeStaleMicSessions().catch((e) => console.error('Mikrofon oturumları temizlenemedi:', e.message));
refreshCappedLevels().catch((e) => console.error('Seviye yenileme hatası:', e.message));
const janitor = startFirewallJanitor();
// Bir günden eski işlem (idempotency) anahtarları saatte bir silinir.
const idemJanitor = setInterval(nonOverlapping(() => pruneIdempotencyKeys().catch((e) => console.error('İşlem anahtarı temizliği:', e.message))), 3600e3);
// Süresi dolmuş oda yasakları ve eski yönetici kayıtları (kalıcı oda başına son 500) saatte bir temizlenir.
const banJanitor = setInterval(nonOverlapping(() => pruneRoomBans().catch((e) => console.error('Oda yasağı temizliği:', e.message))), 3600e3);
banJanitor.unref();
idemJanitor.unref();
loadBans().then((n) => n && console.log(`${n} aktif IP yasağı yüklendi.`)).catch((e) => console.error('IP yasakları yüklenemedi:', e.message));
promoteBootstrapAdmins().catch((e) => console.error('ADMIN_USERNAMES uygulanamadı:', e.message));
seedThemeImages().then((n) => n && console.log(`${n} oda teması görseli yüklendi.`)).catch((e) => console.error('Tema görselleri yüklenemedi:', e.message));
seedAssetPacks().then((n) => n && console.log(`${n} hazır hediye / çerçeve eklendi.`)).catch((e) => console.error('Hazır paket eklenemedi:', e.message));

server.listen(config.port, () => console.log(`TR Live backend ${config.port} portunda çalışıyor.`));

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`${signal} alındı, kapatılıyor...`);
  clearInterval(sweeper);
  clearInterval(musicTicker);
  clearInterval(bagTicker);
  clearInterval(avatarSweeper);
  clearInterval(skinSweeper);
  clearInterval(themeSweeper);
  clearInterval(screenshotPruner);
  clearInterval(pkTicker);
  clearInterval(gameTicker);
  clearInterval(eventsTicker);
  clearInterval(notifyJanitor);
  clearInterval(relationTicker);
  clearInterval(guardianTicker);
  clearInterval(familyJanitor);
  clearInterval(transferTicker);
  clearInterval(privacySweeper);
  clearInterval(janitor);
  clearInterval(idemJanitor);
  clearInterval(banJanitor);
  const force = setTimeout(() => process.exit(1), 10000);
  force.unref();
  // Yeni istek alınmaz; süren istekler biter. Canlı bağlantılar (WebSocket) "yeniden başlıyor" koduyla kapatılır:
  // uygulamalar hemen yeniden bağlanır. (Eskiden soketler kapatılmadığı için server.close() hiç bitmiyor, süreç
  // 10 sn sonra zorla sonlandırılıyordu: her güncellemede 10 sn fazladan kesinti.)
  server.close(async () => { await closeDb(); process.exit(0); });
  const closed = hub.closeAll(1012, 'restart');
  if (closed) console.log(`${closed} canlı bağlantı kapatıldı (yeniden bağlanacaklar).`);
  // Boşta bekleyen (keep-alive) bağlantılar hemen, süren istekler bitince kapanır.
  server.closeIdleConnections?.();
  const hard = setTimeout(() => server.closeAllConnections?.(), 4000);
  hard.unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => console.error('İşlenmeyen söz reddi:', reason));
process.on('uncaughtException', (error) => { console.error('Beklenmeyen hata:', error); shutdown('uncaughtException'); });
