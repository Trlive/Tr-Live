// Sunucunun açılışı ve düzgün kapanışı: HTTP sunucusu, WebSocket, zamanlayıcılar, sinyaller.
//
// Express uygulamasının kendisi app.js'te kurulur; burada yalnızca ayağa kaldırılır.
import { app } from './app.js';
import http from 'node:http';
import { config } from './config.js';
import { refreshCappedLevels } from './modules/users/users.service.js';
import { closeDb } from './infrastructure/database/database.js';
import { authenticateToken } from './middleware/authentication/auth.js';
import { attachRealtime, hub } from './infrastructure/websocket/realtime.js';
import { isRoomMember, startRoomSweeper } from './modules/rooms/rooms.service.js';
import { presenceSnapshot, recordPresence, canSignalTyping, isGhost } from './modules/rooms/presence.service.js';
import { pruneIdempotencyKeys } from './middleware/validation/idempotency.js';
import { pruneRoomBans } from './modules/rooms/room_bans.service.js';
import { promoteBootstrapAdmins } from './modules/system/bootstrap.service.js';
import { startScoreboardTicker } from './modules/rooms/scoreboard.service.js';
import { startReconcileTicker } from './modules/wallet/reconcile.service.js';
import { nonOverlapping } from './infrastructure/queue/ticker.js';
import { runAlertChecks } from './modules/system/alerts.service.js';
import { startWeeklyEventsTicker } from './modules/events/weekly_events.service.js';
import { startNotificationJanitor } from './modules/notifications/notify.service.js';
import { startDealerDeliveryTicker } from './modules/dealers/dealers.routes.js';
import { startTransferTicker } from './modules/agencies/agency_ops.service.js';
import { startSalaryTransferTicker } from './modules/wallet/salary_transfer.service.js';
import { startInstantSalaryTicker } from './modules/wallet/instant_salary.service.js';
import { startAutoCloseTicker } from './modules/wallet/period_autoclose.service.js';
import { startPrivacySweeper } from './modules/users/privacy.service.js';
import { startRelationRefundTicker } from './modules/relations/cp.routes.js';
import { startGuardianTicker } from './modules/users/guardian.service.js';
import { startFamilyJanitor } from './modules/families/family.service.js';
import { pruneScreenshots } from './modules/moderation/screenshots.routes.js';
import { startPlugins } from './modules/games/plugins.service.js';
import { startMusicTicker } from './modules/music/music.service.js';
import { startBagTicker } from './modules/gifts/luckybag.routes.js';
import { startAvatarSweeper } from './modules/media/avatar_sweeper.service.js';
import { startSkinSweeper } from './modules/rooms/mic_skins.service.js';
import { startThemeSweeper, seedThemeImages } from './modules/rooms/room_themes.service.js';
import { startPkTicker } from './modules/rooms/pk.service.js';
import { startGameTicker } from './modules/games/games.service.js';
import { closeStaleMicSessions } from './modules/rooms/mic.service.js';
import { seedAssetPacks } from './modules/assets/asset_packs.service.js';
import { loadBans, startFirewallJanitor, wsClientIp, isBanned, noteViolation } from './middleware/security/firewall.js';
import { startOffloadTicker } from './modules/media/offload.service.js';

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
const plugins = startPlugins().catch((e) => { console.error('Oyun paketleri başlatılamadı:', e.message); return null; });
const sweeper = startRoomSweeper();
const musicTicker = startMusicTicker();
const bagTicker = startBagTicker();
const avatarSweeper = startAvatarSweeper();
const skinSweeper = startSkinSweeper();
const themeSweeper = startThemeSweeper();
const screenshotPruner = setInterval(() => pruneScreenshots().catch((e) => console.error('Ekran görüntüsü kayıt temizliği:', e.message)), 6 * 3600e3);
const pkTicker = startPkTicker();
const scoreboardTicker = startScoreboardTicker();
const reconcileTicker = startReconcileTicker(); // günlük bakiye ↔ defter mutabakatı
const dealerDeliveryTicker = startDealerDeliveryTicker();
const offloadTicker = startOffloadTicker(); // medyayı veritabanından R2'ye taşır (R2 kapalıysa iş yapmaz)
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
// Alarm turu: kurallar beş dakikada bir değerlendirilir (ALERT_INTERVAL_MIN ile değişir).
// Daha sık çalıştırmanın faydası yok — ölçüm penceresi 15 dakika; daha seyrek olursa
// gece çıkan bir sorun saatlerce fark edilmez.
const alertTicker = setInterval(
  nonOverlapping(() => runAlertChecks().catch((e) => console.error('Alarm turu:', e.message))),
  Math.max(Number(process.env.ALERT_INTERVAL_MIN) || 5, 1) * 60e3,
);
alertTicker.unref();
// Ay başı maaş aktarımı: saatte bir bakar, ayın 1–3'ü arasındaysa ve ayar açıksa kapanmış
// dönemlerin maaşını dolar bakiyesine geçirir. Bayrak KAPALI geldiği için varsayılan
// kurulumda hiçbir şey yapmaz. "Bir kere" güvencesi servisin kendisinde (veritabanında).
const salaryTicker = startSalaryTransferTicker(nonOverlapping);
// Ay içi maaş avansı: 3 dakikada bir. Ayar varsayılan AÇIK (migration 116); panelde tek kutuyla durdurulur.
const instantSalaryTicker = startInstantSalaryTicker(nonOverlapping);
// Ay sonu: biten dönem 10 dakika sonra kendiliğinden kapanır (maaş yazılır, kalan elmas Coin'e çevrilir). Ayar: autoClosePeriod.
const autoCloseTicker = startAutoCloseTicker(nonOverlapping);
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
  (await plugins)?.stop().catch(() => {}); // oyun paketleri durumlarını son kez kaydeder
  clearInterval(sweeper);
  clearInterval(musicTicker);
  clearInterval(bagTicker);
  clearInterval(avatarSweeper);
  clearInterval(skinSweeper);
  clearInterval(themeSweeper);
  clearInterval(screenshotPruner);
  clearInterval(pkTicker);
  clearInterval(scoreboardTicker);
  clearInterval(reconcileTicker);
  clearInterval(dealerDeliveryTicker);
  clearInterval(autoCloseTicker);
  clearInterval(offloadTicker);
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
  clearInterval(salaryTicker);
  clearInterval(instantSalaryTicker);
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
