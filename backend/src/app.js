// Express uygulaması: ara katmanlar, modül rotaları ve hata yakalayıcı.
//
// HTTP sunucusunu AÇMAZ ve zamanlayıcı BAŞLATMAZ — onlar server.js'in işi. Bu ayrım sayesinde
// testler uygulamayı dinlemeye başlamadan kurabilir ve modül standardındaki (docs/MODULE_STANDARD.md)
// "app.js / server.js" ayrımı gerçek olur.
import { isWebPanelRequest } from './middleware/security/update_gate.js';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config, validateConfig } from './config.js';
import { query, closeDb } from './infrastructure/database/database.js';
import { cachedMedia, rememberMedia } from './modules/media/images.service.js';
import { router as authRouter } from './modules/auth/auth.routes.js';
import { router as authSocialRouter } from './modules/auth/auth_social.routes.js';
import { router as eventsRouter } from './modules/events/events.routes.js';
import { router as meRouter } from './modules/users/me.routes.js';
import { router as usersRouter } from './modules/users/users.routes.js';
import { router as inventoryRouter } from './modules/users/inventory.routes.js';
import { router as roomsRouter } from './modules/rooms/rooms.routes.js';
import { router as familiesRouter } from './modules/families/families.routes.js';
import { router as wipRouter } from './modules/system/wip.routes.js';
import { router as dealersRouter, startDealerDeliveryTicker, shopAdminRouter as dealerShopAdminRouter } from './modules/dealers/dealers.routes.js';
import { hostedGamesRouter, playRouter as activityPlayRouter, router as activitiesRouter, providerRouter as activityProviderRouter, adminRouter as activitiesAdminRouter } from './modules/games/activities.routes.js';
import { router as adminRouter } from './modules/admin/admin.routes.js';
import { router as giftsRouter } from './modules/gifts/gifts.routes.js';
import { router as agenciesRouter } from './modules/agencies/agencies.routes.js';
import { router as agencyCenterRouter } from './modules/agencies/agency_center.routes.js';
import { router as musicRouter } from './modules/music/music.routes.js';
import { router as chatRouter } from './modules/messaging/chat.routes.js';
import { router as messagesRouter } from './modules/messaging/messages.routes.js';
import { router as friendsRouter } from './modules/messaging/friends.routes.js';
import { router as cpRouter, startRelationRefundTicker } from './modules/relations/cp.routes.js';
import { router as guardianRouter } from './modules/users/guardian.routes.js';
import { router as storeRouter } from './modules/store/store.routes.js';
import { router as micSkinsRouter, adminRouter as micSkinsAdminRouter } from './modules/rooms/mic_skins.routes.js';
import { router as roomThemesRouter, adminRouter as roomThemesAdminRouter } from './modules/rooms/room_themes.routes.js';
import { router as checkinRouter } from './modules/users/checkin.routes.js';
import { router as verifyRouter } from './modules/users/verify.routes.js';
import { router as screenshotsRouter, adminRouter as screenshotsAdminRouter, pruneScreenshots } from './modules/moderation/screenshots.routes.js';
import { router as supportRouter } from './modules/moderation/support.routes.js';
import { router as safetyRouter } from './modules/moderation/safety.routes.js';
import { router as leaderboardsRouter } from './modules/analytics/leaderboards.routes.js';
import { router as pkRouter } from './modules/rooms/pk.routes.js';
import { router as gamesRouter } from './modules/games/games.routes.js';
import { startPlugins, pluginClientRouter, pluginApiRouter, pluginAdminRouter } from './modules/games/plugins.service.js';
import { router as feedRouter } from './modules/moments/feed.routes.js';
import { router as systemRouter } from './modules/system/system.routes.js';
import { router as roomActivitiesRouter } from './modules/rooms/room_activities.routes.js';
import { router as usdRouter, adminRouter as usdAdminRouter } from './modules/wallet/usd.routes.js';
import { router as roomGamePageRouter } from './modules/rooms/room_game_page.routes.js';
import { router as dealerTopupPageRouter } from './modules/dealers/dealer_topup_page.routes.js';
import { getConfig, compareVersions } from './modules/system/app_config.service.js';
import { router as luckyRouter, startBagTicker } from './modules/gifts/luckybag.routes.js';
import { firewall, bodyGuard, ipLimit, loadBans, startFirewallJanitor, wsClientIp, isBanned, noteViolation } from './middleware/security/firewall.js';
import { timing } from './middleware/observability/timing.js';
import { log } from './infrastructure/observability/log.js';
import { router as assetsRouter } from './modules/assets/assets.routes.js';
import { router as sduiRouter } from './modules/sdui/sdui.routes.js';
import { router as sduiV2Router } from './modules/sdui/v2/sdui_v2.routes.js';
import { router as livekitWebhookRouter } from './modules/rooms/livekit_webhook.routes.js';
import { router as contractsRouter, adminRouter as contractsAdminRouter } from './modules/contracts/contracts.routes.js';
import { redactSecrets } from './middleware/security/redact.js';
import { r2Config } from './infrastructure/storage/storage.js';
import { cdnUrlFor } from './modules/media/offload.service.js';

validateConfig();

export const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', config.trustProxy);
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: { maxAge: 31536000, includeSubDomains: true },
}));
app.use(firewall()); // IP yasağı, WAF kuralları, IP başına hız sınırı (CORS ve gövde okumadan önce)
// Süre ölçümü güvenlik duvarından SONRA: yasaklı IP'lerin anlık istek seli gerçek
// gecikme sayılarını bozmasın. Yönlendirmeden önce olmak zorunda, çünkü süreyi
// isteğin en başından saymalı.
app.use(timing);
// Etkinlik oyun sayfaları başka adreste barınır: yalnızca bu uç, kimlik bilgisi taşımadan her adresten çağrılabilir (yetki = oyun bileti).
app.use('/api/activity-play', cors({ origin: true, allowedHeaders: ['Content-Type'], maxAge: 600 }));
app.use(cors({
  origin: config.corsOrigin.includes('*') ? true : config.corsOrigin,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-App-Version', 'Idempotency-Key', 'X-Client', 'X-Totp-Code'],
}));
// LiveKit webhook'u gövdeyi HAM okur (imza baytlar üzerinden doğrulanır): JSON ayrıştırıcıdan ÖNCE ve /api dışında
// (zorunlu güncelleme kapısı sürüm başlığı bekler; ses sunucusu göndermez).
app.use('/livekit/webhook', livekitWebhookRouter);
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
    // Depo (R2) yapılandırılmışsa taşınmış dosyanın baytları OKUNMAZ: CASE, `data` sütununu yalnızca gerekirse değerlendirir
    // (büyük bytea'nın TOAST'tan okunması yalnızca değer kullanılınca olur). Eskiden sütun her zaman seçiliyor, yönlendirme
    // öncesi tüm dosya veritabanından çekilip atılıyordu. Depo kapalıysa (ya da geri alındıysa) veritabanı kopyası eskisi gibi sunulur.
    const r2 = r2Config(await getConfig());
    const r = await query(
      `SELECT mime, storage_key, CASE WHEN storage_key IS NULL OR NOT $2::boolean THEN data END AS data
         FROM media_files WHERE id = $1`,
      [m[1], r2 !== null],
    );
    if (!r.rowCount) return res.status(404).end();
    hit = r.rows[0];
    // Dosya R2'ye taşındıysa CDN'e yönlendirilir: gövde sunucudan hiç geçmez, veritabanı okunmaz.
    // Yönlendirme de sonsuza kadar önbelleklenebilir, çünkü dosya adı kimlik içerir ve içerik değişmez.
    if (hit.storage_key) {
      const url = cdnUrlFor(r2, hit.storage_key);
      if (url) return res.set(headers).redirect(308, url);
    }
    if (!hit.data || !hit.data.length) return res.status(404).end();
    rememberMedia(m[1], hit.mime, hit.data);
  }
  res.set({ ...headers, 'Content-Type': hit.mime });
  res.send(hit.data);
});

app.use('/g', pluginClientRouter); // oyun paketlerinin istemci dosyaları (kod depoda değil, panelden yüklenir)
app.use('/games', hostedGamesRouter); // zip ile yüklenen HTML oyunlar + TRGame SDK
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
  // Web yönetim/ajans paneli bir uygulama sürümü değildir: zorunlu güncelleme yalnızca KENDİ yollarında ona uygulanmaz (bkz. update_gate.js).
  if (isWebPanelRequest(req.get('X-Client'), req.path)) return next();
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
app.use('/api/activities', activitiesRouter);
app.use('/api/activity-play', activityPlayRouter); // oyun sayfası → sunucu (oyun bileti ile salt okunur oyuncu bilgisi; Coin hareketi yok)
app.use('/api/activity-provider', activityProviderRouter); // oyun sağlayıcısı (sunucu → sunucu, imzalı)
app.use('/api/admin/plugins', pluginAdminRouter);
app.use('/api/g', pluginApiRouter); // oyun paketlerinin oyuncu API'si
app.use('/api/admin/activities', activitiesAdminRouter);
app.use('/api/admin/dealer-shop', dealerShopAdminRouter);
app.use('/api/admin/contracts', contractsAdminRouter); // sözleşme şablonları ve onay kayıtları (süper yönetici)
app.use('/api/admin/usd', usdAdminRouter); // dolar cüzdanı yönetimi (çekim talepleri); genel admin yönlendiricisinden önce
app.use('/api/admin', adminRouter);
app.use('/api/usd', usdRouter);
app.use('/api/contracts', contractsRouter); // sözleşme görüntüleme ve onay // dolar cüzdanı: bakiye, admin'e ve bayiye gönderim
app.use('/api/events', eventsRouter);
// Aşağıdakiler '/api' altında birden çok yol tanımladığı için en sona konur.
app.use('/api', feedRouter);
app.use('/api', giftsRouter);
app.use('/api', agenciesRouter);
app.use('/api', agencyCenterRouter);
app.use('/api', assetsRouter);
app.use('/api', sduiRouter);
app.use('/api', sduiV2Router);
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
    // Adres maskelenerek yazılır: oyun sayfaları bileti sorgu dizesinde taşır ve maskelenmezse
    // bilet hata kayıtlarında, saklama süresi boyunca düz metin olarak dururdu.
    // Kendi standardımız: "Log: yapılandırılmış, hassas veri içermeyen".
    log.error('db_unavailable', { method: req.method, url: redactSecrets(req.originalUrl), reason: down, code: error.code, message: error.message });
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
  // Yapılandırılmış kayıt: serbest metin yerine tek satır JSON. Böylece "hangi uç kaç kez
  // 500 verdi" sorusu metin aramadan yanıtlanır ve ölçümlerle aynı alan adlarını kullanır.
  log.error('unhandled_error', {
    method: req.method, url: redactSecrets(req.originalUrl), userId: req.user?.id ?? null, error,
  });
  res.status(500).json({ message: 'Sunucu hatası.' });
});

export default app;
