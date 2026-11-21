// Ölçümler: hangi uç ne kadar sürüyor, nerede hata var, hangi SQL yavaş.
//
// NEDEN: "Bir şey yavaşladığında nereye bakacağımız belli değil" (denetim I-02).
// Panelde CPU/bellek vardı ama UÇ BAZINDA gecikme ve hata oranı yoktu; yani "uygulama
// yavaş" şikâyeti geldiğinde hangi ucun yavaşladığı bilinmiyordu.
//
// Tasarım kararları ve SINIRLARI (bilerek):
//  - Bellek içi. Tek sunucu örneği çalıştığı için yeterli (bkz. G-01). İkinci örnek
//    açıldığında her örnek kendi sayısını gösterir; o gün Prometheus'a taşınmalı.
//  - Sunucu yeniden başlayınca sıfırlanır. Kalıcı olan tek şey ALARMLARDIR (alerts tablosu).
//  - Uç anahtarı olarak GERÇEK YOL DEĞİL, eşleşen ROTA DESENİ kullanılır
//    (`/api/rooms/:roomId/members`). Yoksa her oda için ayrı satır oluşur ve bellek şişerdi.
//  - Gecikme için tam histogram değil, uç başına son 256 ölçümün halkası tutulur; p50/p95/p99
//    bu örneklemden hesaplanır. Yani yüzdelikler YAKLAŞIKTIR ve son birkaç dakikayı yansıtır.

const MAX_ROUTES = 400;     // kardinalite tavanı: beklenmedik bir anahtar patlaması belleği yemesin
const SAMPLES = 256;        // uç başına tutulan gecikme örneği
const SLOW_SQL = 20;        // en yavaş N sorgu
const WINDOW_MIN = 15;      // hata oranı penceresi (dakika)

const routes = new Map();   // "GET /api/..." -> { count, c4, c5, totalMs, maxMs, samples:[], at }
const minutes = new Map();  // dakika damgası -> { count, errors }
const slow = [];            // { sql, ms, at }
let queries = { count: 0, totalMs: 0, errors: 0 };
let startedAt = Date.now();

const nowMinute = () => Math.floor(Date.now() / 60000);

function bucket(key) {
  let b = routes.get(key);
  if (!b) {
    if (routes.size >= MAX_ROUTES) return null; // tavana dayandıysa yeni anahtar açma
    b = { count: 0, c4: 0, c5: 0, totalMs: 0, maxMs: 0, samples: [], i: 0 };
    routes.set(key, b);
  }
  return b;
}

/** Bir isteğin sonucunu kaydeder. route: eşleşen DESEN, gerçek yol değil. */
export function recordRequest({ method, route, status, ms }) {
  const key = `${method} ${route}`;
  const b = bucket(key);
  if (b) {
    b.count += 1;
    b.totalMs += ms;
    if (ms > b.maxMs) b.maxMs = ms;
    if (status >= 500) b.c5 += 1;
    else if (status >= 400) b.c4 += 1;
    if (b.samples.length < SAMPLES) b.samples.push(ms);
    else { b.samples[b.i] = ms; b.i = (b.i + 1) % SAMPLES; }
  }
  const m = nowMinute();
  let mb = minutes.get(m);
  if (!mb) { mb = { count: 0, errors: 0 }; minutes.set(m, mb); }
  mb.count += 1;
  if (status >= 500) mb.errors += 1;
  for (const k of minutes.keys()) if (k < m - WINDOW_MIN) minutes.delete(k);
}

/** Bir SQL sorgusunun süresi. Yavaşsa listede tutulur. */
export function recordQuery({ ms, sql, failed = false }) {
  queries.count += 1;
  queries.totalMs += ms;
  if (failed) queries.errors += 1;
  if (ms < Number(process.env.SLOW_QUERY_MS || 500)) return;
  // Sorgu metni normalleştirilir: sayı ve dize sabitleri çıkarılır ki aynı sorgunun
  // farklı parametreleri liste yerini ayrı ayrı doldurmasın. Parametre DEĞERLERİ hiç
  // alınmaz — hassas veri kayda girmesin.
  const norm = String(sql).replace(/\s+/g, ' ').replace(/'[^']*'/g, "'?'").replace(/\b\d+\b/g, '?').slice(0, 300);
  const hit = slow.find((x) => x.sql === norm);
  if (hit) { hit.count += 1; if (ms > hit.ms) { hit.ms = ms; hit.at = Date.now(); } return; }
  slow.push({ sql: norm, ms, count: 1, at: Date.now() });
  slow.sort((a, b) => b.ms - a.ms);
  if (slow.length > SLOW_SQL) slow.length = SLOW_SQL;
}

function pct(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i];
}

/** Son WINDOW_MIN dakikanın istek ve 5xx sayısı. */
export function errorWindow() {
  let count = 0; let errors = 0;
  const from = nowMinute() - WINDOW_MIN;
  for (const [k, v] of minutes) if (k > from) { count += v.count; errors += v.errors; }
  return { minutes: WINDOW_MIN, count, errors, rate: count ? errors / count : 0 };
}

/** Panel için anlık görüntü. limit: kaç uç döneceği (varsayılan en yavaş 40). */
export function snapshot({ limit = 40, sortBy = 'p95' } = {}) {
  const list = [...routes.entries()].map(([key, b]) => {
    const sorted = [...b.samples].sort((a, c) => a - c);
    const [method, ...rest] = key.split(' ');
    return {
      method,
      route: rest.join(' '),
      count: b.count,
      clientErrors: b.c4,
      serverErrors: b.c5,
      avgMs: Math.round(b.totalMs / b.count),
      p50: Math.round(pct(sorted, 50)),
      p95: Math.round(pct(sorted, 95)),
      p99: Math.round(pct(sorted, 99)),
      maxMs: Math.round(b.maxMs),
    };
  });
  const key = sortBy === 'count' ? 'count' : sortBy === 'errors' ? 'serverErrors' : 'p95';
  list.sort((a, b) => b[key] - a[key]);
  return {
    since: new Date(startedAt).toISOString(),
    window: errorWindow(),
    queries: { ...queries, avgMs: queries.count ? Math.round(queries.totalMs / queries.count) : 0 },
    slowQueries: slow.map((x) => ({ ...x, ms: Math.round(x.ms), at: new Date(x.at).toISOString() })),
    routes: list.slice(0, limit),
    routeCount: routes.size,
    truncated: routes.size >= MAX_ROUTES,
  };
}

/** Testler için. */
export function resetMetrics() {
  routes.clear(); minutes.clear(); slow.length = 0;
  queries = { count: 0, totalMs: 0, errors: 0 };
  startedAt = Date.now();
}
