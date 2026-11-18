import { WebSocketServer } from 'ws';
import { randomUUID } from 'node:crypto';

let wss = null;
const OPEN = 1;

// ---- Çevrimiçi durumu ----
// userId -> açık (kimliği doğrulanmış) bağlantı sayısı. Son bağlantı kapanınca kullanıcı hemen "çevrimdışı"
// sayılmaz: mobil ağ geçişlerinde (Wi-Fi → 4G) bağlantı birkaç saniye kopar; 20 sn içinde dönerse durum değişmez.
const OFFLINE_GRACE_MS = 20000;
const MAX_WATCH = 100;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const onlineCount = new Map();
const offlineTimers = new Map();
const presenceVisible = new Map(); // userId -> bool (gizli kullanıcı / "durumumu gizle" seçenekleri)
let presenceHook = () => {};

function emitPresence(userId, online) {
  if (presenceVisible.get(userId) === false) return;
  const payload = { type: 'presence', userId, online, lastSeenAt: online ? null : new Date().toISOString() };
  for (const ws of clients()) if (ws.watch?.has(userId)) safeSend(ws, payload);
}

function markOnline(userId, visible) {
  presenceVisible.set(userId, visible);
  const pending = offlineTimers.get(userId);
  if (pending) { clearTimeout(pending); offlineTimers.delete(userId); }
  const n = (onlineCount.get(userId) ?? 0) + 1;
  onlineCount.set(userId, n);
  if (n === 1 && !pending) {
    emitPresence(userId, true);
    presenceHook(userId, true);
  }
}

function markClosed(userId) {
  const n = (onlineCount.get(userId) ?? 1) - 1;
  if (n > 0) { onlineCount.set(userId, n); return; }
  onlineCount.delete(userId);
  if (offlineTimers.has(userId)) return;
  const t = setTimeout(() => {
    offlineTimers.delete(userId);
    if (onlineCount.has(userId)) return;
    emitPresence(userId, false);
    presenceVisible.delete(userId);
    presenceHook(userId, false);
  }, OFFLINE_GRACE_MS);
  t.unref?.();
  offlineTimers.set(userId, t);
}

const HB_MSG = JSON.stringify({ type: 'hb' });

function safeSend(ws, payload) {
  if (ws.readyState !== OPEN) return;
  try { ws.send(JSON.stringify(payload)); } catch (_) { /* yoksay */ }
}

// Yalnızca görsel olan (kaybolması durumu bozmayan) olaylar: bağlantısı çok geride kalmış istemciye gönderilmez.
const DECORATIVE = new Set(['room_gift', 'room_scoreboard', 'room_mic_emoji', 'global_gift_ribbon', 'lucky_gift_win', 'lucky_bag_global']);
const BACKLOG_LIMIT = 1024 * 1024; // 1 MB: istemci bu kadar veriyi henüz alamadıysa görsel olaylar atlanır

/** Aynı olayı çok kişiye gönderir: JSON bir kez üretilir (kalabalık odada kişi başına yeniden üretilmez). */
function sendMany(targets, payload) {
  let text = null;
  const decorative = DECORATIVE.has(payload?.type);
  for (const ws of targets) {
    if (ws.readyState !== OPEN) continue;
    if (decorative && ws.bufferedAmount > BACKLOG_LIMIT) continue;
    try {
      text ??= JSON.stringify(payload);
      ws.send(text);
    } catch (_) { /* yoksay */ }
  }
}

const clients = () => (wss ? wss.clients : []);

// Tek sunucu örneği için bellek içi hub. Birden fazla örnek çalıştırılacaksa Redis pub/sub gerekir.
export const hub = {
  broadcastRoom(roomId, payload) {
    const targets = [];
    for (const ws of clients()) if (ws.userId && ws.roomId === roomId) targets.push(ws);
    sendMany(targets, payload);
  },
  broadcastGlobal(payload) {
    // Her duyuruya kimlik: aynı kullanıcıya birden çok bağlantıdan ulaşsa da uygulama bir kez gösterir.
    const p = payload.eventId ? payload : { ...payload, eventId: randomUUID() };
    const targets = [];
    for (const ws of clients()) if (ws.userId) targets.push(ws);
    sendMany(targets, p);
  },
  sendToUser(userId, payload) {
    for (const ws of clients()) if (ws.userId === userId) safeSend(ws, payload);
  },
  detachUserFromRoom(userId, roomId, payload = null) {
    for (const ws of clients()) {
      if (ws.userId !== userId) continue;
      // Yolda olan bir abonelik isteği, çıkıştan sonra soketi bu odaya yeniden bağlamasın.
      if (ws.pendingRoom === roomId) ws.subSeq = (ws.subSeq ?? 0) + 1;
      if (ws.roomId === roomId) {
        ws.roomId = null;
        if (payload) safeSend(ws, payload);
      }
    }
  },
  clearRoom(roomId) {
    for (const ws of clients()) if (ws.roomId === roomId) ws.roomId = null;
  },
  isUserInRoom(userId, roomId) {
    for (const ws of clients()) if (ws.userId === userId && ws.roomId === roomId && ws.readyState === OPEN) return true;
    return false;
  },
  disconnectUser(userId, reason = 'closed') {
    for (const ws of clients()) if (ws.userId === userId) ws.close(4001, reason);
  },
  /** Tek bir cihaz oturumunun bağlantılarını kapatır (uzaktan çıkış). */
  disconnectSession(sessionId, reason = 'session_revoked') {
    if (!sessionId) return;
    for (const ws of clients()) if (ws.sessionId === sessionId) ws.close(4001, reason);
  },
  /** Kullanıcının, verilen oturum dışındaki tüm bağlantılarını kapatır (keepSessionId null ise hepsini). */
  disconnectUserExcept(userId, keepSessionId, reason = 'closed') {
    for (const ws of clients()) if (ws.userId === userId && (!keepSessionId || ws.sessionId !== keepSessionId)) ws.close(4001, reason);
  },
  /** Engelleme sonrası iki kişi birbirinin çevrimiçi durumunu artık almaz (izleme listelerinden çıkarılır). */
  unwatchPair(a, b) {
    for (const ws of clients()) {
      if (!ws.watch) continue;
      if (ws.userId === a) ws.watch.delete(b);
      else if (ws.userId === b) ws.watch.delete(a);
    }
  },
  /** Bağlantısı açık (ya da kısa kopma payı içinde) kullanıcı. */
  isOnline(userId) {
    return onlineCount.has(userId) || offlineTimers.has(userId);
  },
  onlineUserCount() {
    return new Set([...onlineCount.keys(), ...offlineTimers.keys()]).size;
  },
  /** Kullanıcı "çevrimiçi durumumu gizle" seçeneğini değiştirince izleyenlere bildirilir. */
  setPresenceVisible(userId, visible) {
    if (!hub.isOnline(userId)) return;
    if (visible) { presenceVisible.set(userId, true); emitPresence(userId, true); return; }
    // Gizlenince izleyenler kişiyi çevrimdışı görür (son görülme bilgisi de verilmez).
    const payload = { type: 'presence', userId, online: false, lastSeenAt: null };
    for (const ws of clients()) if (ws.watch?.has(userId)) safeSend(ws, payload);
    presenceVisible.set(userId, false);
  },
  /**
   * Sunucu kapanırken (yeniden başlatma / güncelleme) tüm bağlantıları 1012 "yeniden başlıyor" koduyla kapatır:
   * uygulama bunu görünce beklemeden yeniden bağlanır. Kapanış el sıkışmasına yanıt vermeyen (ölü) bağlantılar
   * kısa süre sonra kesilir; böylece sunucu 10 sn beklemeden kapanır.
   */
  closeAll(code = 1012, reason = 'restart', graceMs = 1500) {
    if (!wss) return 0;
    let n = 0;
    for (const ws of wss.clients) {
      n += 1;
      try { ws.close(code, reason); } catch (_) { /* yoksay */ }
    }
    const t = setTimeout(() => {
      for (const ws of clients()) { try { ws.terminate(); } catch (_) { /* yoksay */ } }
    }, graceMs);
    t.unref?.();
    return n;
  },
  stats() {
    let sockets = 0; let inRooms = 0;
    for (const ws of clients()) { if (!ws.userId) continue; sockets += 1; if (ws.roomId) inRooms += 1; }
    return { sockets, onlineUsers: hub.onlineUserCount(), inRooms };
  },
};

/**
 * Bağlantı token'ı. Yeni uygulama sürümleri `Authorization: Bearer …` başlığıyla gönderir: adres satırındaki token
 * vekil sunucu / erişim kayıtlarına yazılabildiği için adresten çıkarıldı. Eski sürümler için `?token=` hâlâ kabul edilir.
 */
export function socketToken(req, url) {
  const h = String(req?.headers?.authorization ?? '');
  if (h.startsWith('Bearer ') && h.length > 7) return h.slice(7).trim();
  return url?.searchParams?.get('token') ?? null;
}

// IP başına varsayılan bağlantı sınırı. Eski değer (30) operatör NAT'ı / yurt / kafe gibi ortak IP'lerde 31. kullanıcıyı
// dışarıda bırakıyor, onun yeniden bağlanma denemeleri de IP'deki herkesi yasaklatıyordu. Asıl koruma kullanıcı başına
// sınırdır (5); kimliği doğrulanamayan bağlantı zaten hemen kapatılır.
const MAX_SOCKETS_PER_IP = 300;
const MAX_SOCKETS_PER_USER = 5;
const MSG_LIMIT = { count: 40, windowMs: 10000 };

const wsRoutes = new Map();
/** Gömülü oyun gibi ek WebSocket yolları (oyun paketleri: '/ws/g/<id>'); WebSocketServer'ı { noServer: true } ile kurun. */
export function registerWsRoute(pathname, wsServer) { wsRoutes.set(pathname, wsServer); }
export function unregisterWsRoute(pathname, wsServer) { if (!wsServer || wsRoutes.get(pathname) === wsServer) wsRoutes.delete(pathname); }

export function attachRealtime(server, {
  authenticate, isRoomMember, ipOf = () => 'unknown', isBanned = () => false, onViolation = () => {}, maxSocketsPerIp = MAX_SOCKETS_PER_IP,
  onPresence = () => {}, presenceSnapshot = async () => [], canTyping = async () => false,
  isPresenceVisible = async (u) => u.show_presence !== false && !u.is_hidden,
}) {
  // perMessageDeflate: 1 KB'tan büyük mesajlar sıkıştırılır (üye listesi, skor tablosu…) → telefonda daha az internet.
  // Küçük mesajlar (çoğunluk) sıkıştırılmaz; bağlam saklanmaz (bağlantı başına bellek az kalır).
  wss = new WebSocketServer({
    noServer: true,
    maxPayload: 8 * 1024,
    perMessageDeflate: {
      threshold: 1024,
      serverNoContextTakeover: true,
      clientNoContextTakeover: true,
      // Sunucunun sıkıştırma penceresi küçük (bağlantı başına ~16 KB bellek; binlerce bağlantıda bellek şişmesin).
      // Telefon büyük pencereyle açabildiği için bu ayar her istemcide güvenli. İstemci penceresi sınırlanmaz.
      serverMaxWindowBits: 11,
      zlibDeflateOptions: { level: 5, memLevel: 4 },
      concurrencyLimit: 8,
    },
  });
  // Tek 'upgrade' dinleyicisi: /ws ana kanal; registerWsRoute ile kayıtlı yollar (gömülü oyunlar) kendi sunucusuna gider.
  server.on('upgrade', (req, socket, head) => {
    let pathname = '';
    try { pathname = new URL(req.url, 'http://x').pathname; } catch { /* geçersiz */ }
    const target = pathname === '/ws' ? wss : wsRoutes.get(pathname);
    if (!target) { socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); socket.destroy(); return; }
    target.handleUpgrade(req, socket, head, (ws) => target.emit('connection', ws, req));
  });
  presenceHook = (userId, online) => { Promise.resolve().then(() => onPresence(userId, online)).catch(() => {}); };

  async function handleMessage(ws, raw) {
    let data;
    try { data = JSON.parse(String(raw)); } catch { return; }
    if (data.type === 'ping') return safeSend(ws, { type: 'pong' });
    if (data.type === 'room_unsubscribe') { ws.subSeq = (ws.subSeq ?? 0) + 1; ws.roomId = null; return; }
    // Ekranda görünen kişilerin çevrimiçi durumunu izleme (sohbet listesi, DM, profil). Liste her seferinde yenilenir.
    if (data.type === 'presence_watch' && Array.isArray(data.userIds)) {
      const ids = [...new Set(data.userIds.filter((x) => typeof x === 'string' && UUID_RE.test(x)))].slice(0, MAX_WATCH);
      if (!ids.length) { ws.watch = null; return; }
      try {
        // Gizli/engelli kişiler anlık görüntüden ve izleme listesinden çıkarılır.
        const users = await presenceSnapshot(ws.userId, ids);
        ws.watch = new Set(users.map((u) => u.userId));
        safeSend(ws, { type: 'presence_state', users });
      } catch (_) { /* anlık görüntü alınamazsa durum gösterilmez */ }
      return;
    }
    // "Yazıyor..." (özel mesaj): aynı kişiye en fazla 2 sn'de bir iletilir.
    if (data.type === 'typing' && typeof data.to === 'string' && UUID_RE.test(data.to) && data.to !== ws.userId) {
      const now = Date.now();
      ws.typingAt ??= new Map();
      if (now - (ws.typingAt.get(data.to) ?? 0) < 2000) return;
      if (ws.typingAt.size > 50) ws.typingAt.clear();
      ws.typingAt.set(data.to, now);
      try {
        if (await canTyping(ws.userId, data.to)) hub.sendToUser(data.to, { type: 'typing', userId: ws.userId });
      } catch (_) { /* yoksay */ }
      return;
    }
    if (data.type === 'room_subscribe' && typeof data.roomId === 'string') {
      // Yalnızca en son istek geçerli: üyelik kontrolü sürerken gelen çıkış / başka abonelik eskisini geçersiz kılar.
      const seq = (ws.subSeq = (ws.subSeq ?? 0) + 1);
      ws.pendingRoom = data.roomId;
      try {
        const member = await isRoomMember(ws.userId, data.roomId);
        if (ws.subSeq !== seq) return;
        ws.pendingRoom = null;
        if (member) {
          ws.roomId = data.roomId;
          safeSend(ws, { type: 'room_subscribed', roomId: data.roomId });
        } else {
          safeSend(ws, { type: 'error', code: 'not_member', roomId: data.roomId });
        }
      } catch (_) { safeSend(ws, { type: 'error', code: 'server' }); }
    }
  }

  wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('error', () => {});
    ws.on('close', () => {
      if (ws.counted) { ws.counted = false; markClosed(ws.userId); }
    });

    const ip = ipOf(req);
    ws.ip = ip;
    if (isBanned(ip)) { ws.close(1008, 'banned'); return; }
    let sameIp = 0;
    for (const c of wss.clients) if (c.ip === ip) sameIp += 1;
    if (sameIp > maxSocketsPerIp) {
      onViolation(ip, 'ws_ip_flood', { volume: true });
      ws.close(1013, 'too_many_connections');
      return;
    }

    let ready = false;
    const queue = [];
    const times = [];
    ws.on('message', (raw) => {
      // Mesaj seli koruması: 10 sn içinde en fazla 40 mesaj.
      const now = Date.now();
      while (times.length && times[0] <= now - MSG_LIMIT.windowMs) times.shift();
      if (times.length >= MSG_LIMIT.count) {
        onViolation(ip, 'ws_message_flood', { weight: 3, userId: ws.userId ?? null });
        ws.close(1008, 'flood');
        return;
      }
      times.push(now);
      if (!ready) { if (queue.length < 5) queue.push(raw); return; }
      handleMessage(ws, raw);
    });

    (async () => {
      let initialRoom = null;
      try {
        const url = new URL(req.url, 'http://localhost');
        const user = await authenticate(socketToken(req, url));
        if (ws.readyState !== OPEN) return; // doğrulama sürerken istemci gitti
        ws.userId = user.id;
        ws.sessionId = user.session_id ?? null;
        initialRoom = url.searchParams.get('roomId');
        const visible = await isPresenceVisible(user).catch(() => false);
        if (ws.readyState !== OPEN) return;
        ws.counted = true;
        markOnline(user.id, visible);
      } catch (_) {
        ws.close(1008, 'auth');
        return;
      }
      // Kullanıcı başına en fazla 5 eşzamanlı bağlantı; en eskiler kapatılır.
      const mine = [...wss.clients].filter((c) => c !== ws && c.userId === ws.userId);
      while (mine.length >= MAX_SOCKETS_PER_USER) mine.shift().close(1013, 'replaced');
      ready = true;
      safeSend(ws, { type: 'connected', userId: ws.userId });
      if (initialRoom) await handleMessage(ws, JSON.stringify({ type: 'room_subscribe', roomId: initialRoom }));
      for (const raw of queue.splice(0)) await handleMessage(ws, raw);
    })();
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      try { ws.ping(); } catch (_) { /* yoksay */ }
      // Uygulama bu küçük mesajı görünce bağlantının canlı olduğunu bilir; kendisi ayrıca ping atmaz (telefon daha az uyanır).
      // Aynı anda gittiği için telefonun radyosu bir kez uyanır.
      if (ws.readyState === OPEN) { try { ws.send(HB_MSG); } catch (_) { /* yoksay */ } }
    }
  }, 30000);
  heartbeat.unref();
  wss.on('close', () => clearInterval(heartbeat));
  return wss;
}
