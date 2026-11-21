// Alarmlar: bir şey bozulduğunda haber veren kısım.
//
// Denetimdeki boşluk (I-02) aynen şuydu: "alarm yok — bir şey bozulduğunda kimse haber
// almıyor". Panelde sayı vardı ama panele bakan kimse yoksa sayı bir işe yaramıyordu.
//
// Tasarım kararları:
//  - Kurallar BURADA, tek yerde ve veriyle birlikte okunur halde. Eşikler ortam
//    değişkeniyle değiştirilebilir ama varsayılanları makul olmalı, çünkü kimse
//    ayarlamayacak.
//  - Her kural AÇILIR ve KAPANIR. Açık alarm tekrar tetiklenirse yeni satır açılmaz,
//    hit_count artar (alerts_open_key tekil dizini). Durum düzelince kendiliğinden
//    kapanır (resolved_at). Böylece panelde "şu an bozuk olan" listesi doğru kalır.
//  - Bildirim yalnızca alarm AÇILIRKEN gider. Her turda gönderilseydi 5 dakikada bir
//    bildirim yağar, iki günde kimse bakmaz olurdu (alarm yorgunluğu).
//  - Kuralın kendisi patlarsa tüm tur çökmemeli: her kural ayrı try içinde.
import { poolStats, query } from '../../infrastructure/database/database.js';
import { errorWindow, snapshot } from '../../infrastructure/observability/metrics.js';
import { log } from '../../infrastructure/observability/log.js';
import { notifyUser } from '../notifications/notify.service.js';

const num = (key, fallback) => Number(process.env[key] ?? fallback);

/** Kurallar: her biri {key, severity, title, detail} döndürür ya da sorun yoksa null. */
const RULES = [
  {
    key: 'api_error_rate',
    async check() {
      const w = errorWindow();
      // En az 50 istek görülmeden oran anlamlı değil: 2 istekten 1'i hata ise %50 çıkar
      // ve her gecede boş yere alarm çalardı.
      const min = num('ALERT_MIN_REQUESTS', 50);
      const limit = num('ALERT_ERROR_RATE', 0.05);
      if (w.count < min || w.rate <= limit) return null;
      return {
        severity: w.rate > limit * 3 ? 'critical' : 'warn',
        title: `API hata oranı %${(w.rate * 100).toFixed(1)} (son ${w.minutes} dk)`,
        detail: { requests: w.count, errors: w.errors, rate: Number(w.rate.toFixed(4)), limit },
      };
    },
  },
  {
    key: 'db_pool',
    async check() {
      const p = poolStats();
      // Bekleyen istek varsa havuz yetmiyor demektir: istekler sıraya giriyor,
      // kullanıcı "uygulama dondu" diyor ama CPU boş görünüyor.
      if (p.waiting < num('ALERT_POOL_WAITING', 3)) return null;
      return {
        severity: p.waiting >= p.max ? 'critical' : 'warn',
        title: `Veritabanı havuzunda ${p.waiting} istek bekliyor`,
        detail: p,
      };
    },
  },
  {
    key: 'api_latency',
    async check() {
      const limit = num('ALERT_P95_MS', 3000);
      // En az 20 örnek: açılıştaki ilk birkaç yavaş istek alarm çalmasın.
      const slow = snapshot({ limit: 200 }).routes.filter((r) => r.count >= 20 && r.p95 > limit);
      if (!slow.length) return null;
      return {
        severity: 'warn',
        title: `${slow.length} uçta p95 gecikmesi ${limit} ms üstünde`,
        detail: { limit, routes: slow.slice(0, 10).map((r) => ({ route: `${r.method} ${r.route}`, p95: r.p95, count: r.count })) },
      };
    },
  },
  {
    key: 'reconcile_mismatch',
    async check() {
      // Mutabakat farkı = bakiye ile defter tutmuyor. Bu para meselesidir; eşik yok,
      // bir tane bile fark varsa alarm.
      const r = await query(
        `SELECT id, finished_at, mismatches, coin_diff, diamond_diff FROM wallet_recon_runs
          WHERE finished_at IS NOT NULL ORDER BY id DESC LIMIT 1`,
      );
      const run = r.rows[0];
      if (!run || Number(run.mismatches) === 0) return null;
      return {
        severity: 'critical',
        title: `Mutabakatta ${run.mismatches} fark var`,
        detail: { runId: String(run.id), coinDiff: String(run.coin_diff), diamondDiff: String(run.diamond_diff), finishedAt: run.finished_at },
      };
    },
  },
  {
    key: 'reconcile_stale',
    async check() {
      // Mutabakat hiç çalışmıyorsa "fark yok" demek anlamsızdır: sessizlik, iyi haber değil.
      const hours = num('ALERT_RECONCILE_HOURS', 36);
      const r = await query(`SELECT MAX(finished_at) AS last FROM wallet_recon_runs WHERE failed = false`);
      const last = r.rows[0]?.last;
      if (last && Date.now() - new Date(last).getTime() < hours * 3600e3) return null;
      return { severity: 'warn', title: `Mutabakat ${hours} saattir çalışmadı`, detail: { lastRun: last ?? null } };
    },
  },
  {
    key: 'unpaid_statements',
    async check() {
      // Ödenmemiş kazanç birikiyorsa yayıncı/ajans parasını alamıyor demektir.
      const limit = num('ALERT_UNPAID_DAYS', 14);
      const r = await query(
        `SELECT 'host' AS kind, COUNT(*)::int AS n FROM host_statements s JOIN payout_periods p ON p.id = s.period_id
           WHERE s.status = 'pending' AND p.closed_at < NOW() - ($1 || ' days')::interval
         UNION ALL
         SELECT 'agency', COUNT(*)::int FROM agency_statements s JOIN payout_periods p ON p.id = s.period_id
           WHERE s.status = 'pending' AND p.closed_at < NOW() - ($1 || ' days')::interval
         UNION ALL
         SELECT 'assistant', COUNT(*)::int FROM assistant_statements s JOIN payout_periods p ON p.id = s.period_id
           WHERE s.status = 'pending' AND p.closed_at < NOW() - ($1 || ' days')::interval`,
        [String(limit)],
      );
      const total = r.rows.reduce((s, x) => s + x.n, 0);
      if (!total) return null;
      return {
        severity: 'warn',
        title: `${total} hak ediş ${limit} gündür ödenmedi`,
        detail: Object.fromEntries(r.rows.map((x) => [x.kind, x.n])),
      };
    },
  },
];

async function openAlert(key, { severity, title, detail }) {
  // Açıksa güncelle, değilse aç. Tekil dizin yarışı da burada çözülür (ON CONFLICT).
  const r = await query(
    `INSERT INTO alerts(alert_key, severity, title, detail)
     VALUES($1,$2,$3,$4::jsonb)
     ON CONFLICT (alert_key) WHERE resolved_at IS NULL
     DO UPDATE SET last_seen_at = NOW(), hit_count = alerts.hit_count + 1,
                   severity = EXCLUDED.severity, title = EXCLUDED.title, detail = EXCLUDED.detail
     RETURNING id, hit_count`,
    [key, severity, title, JSON.stringify(detail ?? {})],
  );
  const row = r.rows[0];
  const isNew = Number(row.hit_count) === 1;
  log[severity === 'critical' ? 'error' : 'warn']('alert_open', { key, severity, title, hit: row.hit_count, isNew });
  if (isNew) await notifyAdmins(severity, title);
  return row;
}

async function notifyAdmins(severity, title) {
  try {
    // Sütun adları: yetki `system_role` ('admin' = uygulama sahibi), durum `account_status`.
    const admins = (await query(
      `SELECT id FROM users WHERE system_role = 'admin' AND account_status = 'active' LIMIT 20`,
    )).rows;
    for (const a of admins) {
      await notifyUser(a.id, 'system_alert', severity === 'critical' ? 'Sistem alarmı' : 'Sistem uyarısı', title, { severity });
    }
  } catch (error) {
    // Bildirim gidemezse alarmın kendisi yine de kayıtlı: sessizce yutulmaz, kayda düşer.
    log.error('alert_notify_failed', { error });
  }
}

/** Tüm kuralları değerlendirir; açılanı açar, düzeleni kapatır. */
export async function runAlertChecks() {
  const open = new Set();
  for (const rule of RULES) {
    try {
      const hit = await rule.check();
      if (hit) { open.add(rule.key); await openAlert(rule.key, hit); }
    } catch (error) {
      // Bir kuralın hatası diğerlerini durdurmaz. Durdursaydı tek bozuk sorgu yüzünden
      // bütün alarm sistemi sessizce kapanırdı — en tehlikeli hata biçimi.
      log.error('alert_rule_failed', { key: rule.key, error });
    }
  }
  const keys = RULES.map((r) => r.key).filter((k) => !open.has(k));
  if (keys.length) {
    const r = await query(
      `UPDATE alerts SET resolved_at = NOW() WHERE resolved_at IS NULL AND alert_key = ANY($1::text[]) RETURNING alert_key`,
      [keys],
    );
    for (const row of r.rows) log.info('alert_resolved', { key: row.alert_key });
  }
  return { open: [...open] };
}

export async function listAlerts({ includeResolved = false, limit = 50 } = {}) {
  const r = await query(
    `SELECT a.id, a.alert_key, a.severity, a.title, a.detail, a.started_at, a.last_seen_at,
            a.hit_count, a.resolved_at, a.acked_at, u.username AS acked_by
       FROM alerts a LEFT JOIN users u ON u.id = a.acked_by
      WHERE ($1 OR a.resolved_at IS NULL)
      ORDER BY a.resolved_at IS NOT NULL, a.started_at DESC LIMIT $2`,
    [includeResolved, Math.min(Math.max(limit, 1), 200)],
  );
  return r.rows.map((x) => ({
    id: String(x.id), key: x.alert_key, severity: x.severity, title: x.title, detail: x.detail,
    startedAt: x.started_at, lastSeenAt: x.last_seen_at, hitCount: x.hit_count,
    resolvedAt: x.resolved_at, ackedAt: x.acked_at, ackedBy: x.acked_by,
  }));
}

export async function ackAlert(id, userId) {
  const r = await query(`UPDATE alerts SET acked_by = $2, acked_at = NOW() WHERE id = $1 RETURNING id`, [id, userId]);
  return r.rowCount > 0;
}
