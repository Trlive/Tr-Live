// Hediye yağmuru koruması (sunucu tarafı). Amaç: bir odada çok hızlı / çok kişiyle hediye atıldığında odadaki
// telefonlara saniyede onlarca olay gitmesin (her olay uygulamada uçan ikonlar, koltuk animasyonu, şerit ve ekran
// yeniden çizimi demektir; eski sürümlerde bu yük uygulamayı kilitleyip çökertebiliyordu).
//
// Kural (birleştirme):
//  * Aynı seri (gönderen + hediye + alıcılar) için İLK olay hemen gider: tek tek atılan hediyede hiçbir gecikme olmaz.
//  * Aynı serinin pencere (≈0,9 sn) içindeki sonraki olayları TEK olayda birleşir ve pencere sonunda gider:
//    adetler, Coin tutarları ve şanslı kazançlar toplanır; combo sayacı ve oda toplamı en güncel değeri taşır.
//  * Oda çok yoğunsa (saniyede çok olay) pencere uzar.
// Para / bakiye işlemleri bundan ETKİLENMEZ: her hediye veritabanına tek tek işlenir, gönderen yanıtını hemen alır.
// Yalnızca odaya giden görsel bildirimler seyreltilir.

export const BURST_WINDOW_MS = 900;
export const BUSY_WINDOW_MS = 1800;
export const BUSY_EVENTS_PER_SEC = 10;

const big = (v) => { try { return BigInt(String(v ?? 0)); } catch (_) { return 0n; } };
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
// Toplam, girdinin türüyle döner (sayı gelmişse sayı, metin gelmişse metin).
const sumLike = (a, b) => (typeof a === 'number' && typeof b === 'number' ? a + b : (big(a) + big(b)).toString());

function mergeLucky(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  const hits = { ...(a.hits ?? {}) };
  for (const [k, v] of Object.entries(b.hits ?? {})) hits[k] = num(hits[k]) + num(v);
  return {
    ...a, ...b,
    win: (big(a.win) + big(b.win)).toString(),
    best: Math.max(num(a.best), num(b.best)),
    wins: num(a.wins) + num(b.wins),
    units: num(a.units) + num(b.units),
    jackpot: a.jackpot === true || b.jackpot === true,
    hits,
    pool: b.pool ?? a.pool ?? null,
  };
}

/** Aynı serinin iki room_gift olayını tek olayda birleştirir ([a] önce, [b] sonra geldi). */
export function mergeGiftEvents(a, b) {
  const byId = new Map();
  const order = [];
  for (const r of [...(a.receivers ?? []), ...(b.receivers ?? [])]) {
    const id = r?.user?.id ?? `?${order.length}`;
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, { ...r });
      order.push(id);
    } else {
      byId.set(id, { ...prev, user: r.user ?? prev.user, quantity: num(prev.quantity) + num(r.quantity), coinAmount: sumLike(prev.coinAmount, r.coinAmount) });
    }
  }
  return {
    ...a, ...b,
    quantity: num(a.quantity) + num(b.quantity),
    totalCoins: (big(a.totalCoins) + big(b.totalCoins)).toString(),
    receivers: order.map((id) => byId.get(id)),
    lucky: mergeLucky(a.lucky, b.lucky),
    roomTotal: b.roomTotal ?? a.roomTotal ?? null,
    merged: num(a.merged || 1) + num(b.merged || 1),
  };
}

/**
 * Birleştirici. push(key, roomId, event): 'sent' (hemen gitti) | 'queued' | 'merged'.
 * [send] olayı odaya gönderen işlevdir. Zamanlayıcılar ve saat testte değiştirilebilir.
 */
export function createGiftCoalescer({
  send, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout,
  windowMs = BURST_WINDOW_MS, busyWindowMs = BUSY_WINDOW_MS, busyPerSec = BUSY_EVENTS_PER_SEC,
}) {
  const slots = new Map(); // seri anahtarı → { roomId, lastSentAt, pending, timer }
  const rooms = new Map(); // roomId → { sec, n, prev } (odaya giden olay hızı)

  function note(roomId, t) {
    const sec = Math.floor(t / 1000);
    const r = rooms.get(roomId);
    if (!r) rooms.set(roomId, { sec, n: 1, prev: 0 });
    else if (r.sec === sec) r.n += 1;
    else { r.prev = sec - r.sec === 1 ? r.n : 0; r.sec = sec; r.n = 1; }
  }

  function windowFor(roomId, t) {
    const r = rooms.get(roomId);
    if (!r) return windowMs;
    const sec = Math.floor(t / 1000);
    const recent = sec === r.sec ? Math.max(r.n, r.prev) : (sec - r.sec === 1 ? r.n : 0);
    return recent >= busyPerSec ? busyWindowMs : windowMs;
  }

  function emit(roomId, event, t) {
    note(roomId, t);
    try { send(roomId, event); } catch (_) { /* gönderim hatası hediyeyi etkilemez */ }
  }

  function sweep(t) {
    for (const [k, s] of slots) if (!s.pending && t - s.lastSentAt > 15000) slots.delete(k);
    for (const [k, r] of rooms) if (Math.floor(t / 1000) - r.sec > 15) rooms.delete(k);
  }

  function flush(key) {
    const s = slots.get(key);
    if (!s || !s.pending) return;
    const e = s.pending;
    s.pending = null;
    s.timer = null;
    const t = now();
    s.lastSentAt = t;
    emit(s.roomId, e, t);
  }

  function push(key, roomId, event) {
    const t = now();
    const s = slots.get(key);
    if (!s || (!s.pending && t - s.lastSentAt >= windowFor(roomId, t))) {
      slots.set(key, { roomId, lastSentAt: t, pending: null, timer: null });
      emit(roomId, event, t);
      if (slots.size > 4000 || rooms.size > 2000) sweep(t);
      return 'sent';
    }
    if (s.pending) {
      s.pending = mergeGiftEvents(s.pending, event);
      return 'merged';
    }
    s.pending = event;
    const timer = setTimer(() => flush(key), Math.max(0, s.lastSentAt + windowFor(roomId, t) - t));
    timer?.unref?.();
    s.timer = timer;
    return 'queued';
  }

  /** Bekleyen her şeyi hemen gönderir (kapanışta / testte). */
  function flushAll() {
    for (const [key, s] of slots) {
      if (!s.pending) continue;
      if (s.timer) clearTimer(s.timer);
      flush(key);
    }
  }

  return { push, flush, flushAll, pendingCount: () => [...slots.values()].filter((s) => s.pending).length, size: () => slots.size };
}

/**
 * Anahtar başına seyreltme (sondaki çağrı kaybolmaz): ilk çağrı hemen çalışır; [ms] içinde gelen sonraki çağrılar
 * tek çağrıya iner ve süre sonunda bir kez çalışır. Skor tablosu ve PK puanı gibi "son durum" yayınları için.
 */
export function createKeyedThrottle({ now = Date.now, setTimer = setTimeout } = {}) {
  const state = new Map(); // key → { lastAt, timer, run }
  return function throttle(key, ms, run) {
    const t = now();
    const s = state.get(key);
    const fire = (fn) => { try { const r = fn(); r?.catch?.(() => {}); } catch (_) { /* yayın hatası yoksayılır */ } };
    if (!s || (!s.timer && t - s.lastAt >= ms)) {
      state.set(key, { lastAt: t, timer: null, run: null });
      fire(run);
      if (state.size > 4000) for (const [k, v] of state) if (!v.timer && t - v.lastAt > 60000) state.delete(k);
      return true;
    }
    s.run = run; // en son istenen çalışır
    if (!s.timer) {
      const timer = setTimer(() => {
        const cur = state.get(key);
        if (!cur) return;
        const fn = cur.run;
        cur.timer = null;
        cur.run = null;
        cur.lastAt = now();
        if (fn) fire(fn);
      }, Math.max(0, s.lastAt + ms - t));
      timer?.unref?.();
      s.timer = timer;
    }
    return false;
  };
}
