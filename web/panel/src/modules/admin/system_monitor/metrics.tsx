"use client";
import { useState } from "react";
import { api } from "@/core/api/api";
import { useApi } from "@/core/api/use-api";
import { Card, Loading, ErrorBox } from "@/shared/components/ui";

type Route = {
  method: string; route: string; count: number; clientErrors: number; serverErrors: number;
  avgMs: number; p50: number; p95: number; p99: number; maxMs: number;
};
type SlowSql = { sql: string; ms: number; count: number; at: string };
type Metrics = {
  since: string;
  window: { minutes: number; count: number; errors: number; rate: number };
  queries: { count: number; totalMs: number; errors: number; avgMs: number };
  slowQueries: SlowSql[];
  routes: Route[];
  routeCount: number;
  truncated: boolean;
  pool: { total: number; idle: number; waiting: number; max: number };
};
type Alert = {
  id: string; key: string; severity: string; title: string; detail: Record<string, unknown>;
  startedAt: string; lastSeenAt: string; hitCount: number;
  resolvedAt: string | null; ackedAt: string | null; ackedBy: string | null;
};

const SORTS = [
  { key: "p95", label: "En yavaş (p95)" },
  { key: "errors", label: "En çok hata" },
  { key: "count", label: "En çok çağrılan" },
] as const;

function ms(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)} sn` : `${n} ms`;
}
function when(iso: string) {
  const m = (Date.now() - new Date(iso).getTime()) / 60000;
  if (m < 1) return "az önce";
  if (m < 60) return `${Math.round(m)} dk önce`;
  if (m < 48 * 60) return `${Math.round(m / 60)} sa önce`;
  return `${Math.round(m / 1440)} gün önce`;
}

/**
 * Ölçümler ve alarmlar.
 *
 * Bu ekranın tek amacı şu soruya yanıt vermek: "bir şey yavaşladı — nereye bakacağım?"
 * Önceki sunucu ekranı CPU ve belleği gösteriyordu; ikisi de normal görünürken tek bir
 * ucun yavaşlaması mümkün, o yüzden burada ölçüm UÇ BAZINDA.
 *
 * Ortalama bilerek ikinci planda: bir uç isteklerin %95'inde 80 ms, %5'inde 9 saniye
 * sürüyorsa ortalama "iyi" görünür ama kullanıcıların yirmide biri uygulamayı donmuş
 * sanır. Sıralama bu yüzden varsayılan olarak p95'e göre.
 *
 * Sayılar sunucu belleğinde tutulur ve sunucu yeniden başlayınca sıfırlanır ("şu andan
 * beri" damgası bunun için). Kalıcı olan tek şey alarmlardır.
 */
export default function AdminMetrics() {
  const [sortBy, setSortBy] = useState<string>("p95");
  const [showResolved, setShowResolved] = useState(false);
  const m = useApi<Metrics>(`/api/admin/metrics?sortBy=${sortBy}&limit=60`);
  const a = useApi<{ alerts: Alert[] }>(`/api/admin/alerts${showResolved ? "?all=1" : ""}`);

  if (m.loading && !m.data) return <Loading />;
  if (m.error && !m.data) return <ErrorBox message={m.error} onRetry={m.reload} />;
  if (!m.data) return null;

  const d = m.data;
  const alerts = a.data?.alerts ?? [];
  const openAlerts = alerts.filter((x) => !x.resolvedAt);
  const errRate = d.window.count ? (d.window.rate * 100).toFixed(2) : "0.00";

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span>
            Son {d.window.minutes} dk: <b>{d.window.count}</b> istek
          </span>
          <span className={d.window.errors > 0 ? "text-red-300" : ""}>
            Sunucu hatası: <b>{d.window.errors}</b> (%{errRate})
          </span>
          <span className={d.pool.waiting > 0 ? "text-amber-300" : ""}>
            Havuz: <b>{d.pool.total}/{d.pool.max}</b>
            {d.pool.waiting > 0 ? ` · ${d.pool.waiting} bekliyor` : ""}
          </span>
          <span>
            SQL: <b>{d.queries.count}</b> · ort. {ms(d.queries.avgMs)}
            {d.queries.errors > 0 ? ` · ${d.queries.errors} hata` : ""}
          </span>
          <span className="text-white/50">ölçüm başlangıcı: {when(d.since)}</span>
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">
            Alarmlar{openAlerts.length > 0 ? ` · ${openAlerts.length} açık` : ""}
          </h2>
          <div className="flex items-center gap-3 text-xs">
            <button className="text-[#d7b56d] hover:underline" onClick={() => setShowResolved((v) => !v)}>
              {showResolved ? "Yalnızca açıklar" : "Kapananları da göster"}
            </button>
            <button
              className="text-white/60 hover:underline"
              onClick={async () => {
                await api("/api/admin/alerts/check", { method: "POST" });
                a.reload();
                m.reload();
              }}
            >
              Şimdi denetle
            </button>
          </div>
        </div>
        {alerts.length === 0 ? (
          <p className="text-sm text-white/50">Açık alarm yok.</p>
        ) : (
          <ul className="space-y-2">
            {alerts.map((x) => (
              <li
                key={x.id}
                className={`rounded-lg border p-3 text-sm ${
                  x.resolvedAt
                    ? "border-white/10 text-white/40"
                    : x.severity === "critical"
                      ? "border-red-500/40 bg-red-500/5"
                      : "border-amber-500/30 bg-amber-500/5"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{x.title}</span>
                  <span className="text-xs text-white/50">
                    {x.resolvedAt ? `kapandı ${when(x.resolvedAt)}` : `${when(x.startedAt)} başladı · ${x.hitCount}×`}
                  </span>
                </div>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs text-white/50">
                  {JSON.stringify(x.detail, null, 1)}
                </pre>
                {!x.resolvedAt && (
                  <div className="mt-2 text-xs">
                    {x.ackedAt ? (
                      <span className="text-white/50">{x.ackedBy ?? "bir yönetici"} gördü</span>
                    ) : (
                      <button
                        className="text-[#d7b56d] hover:underline"
                        onClick={async () => {
                          await api(`/api/admin/alerts/${x.id}/ack`, { method: "POST" });
                          a.reload();
                        }}
                      >
                        Gördüm
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Uçlar ({d.routeCount})</h2>
          <div className="flex gap-2 text-xs">
            {SORTS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSortBy(s.key)}
                className={`rounded px-2 py-1 ${sortBy === s.key ? "bg-[#d7b56d]/20 text-[#d7b56d]" : "text-white/50 hover:text-white"}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        {d.truncated && (
          <p className="mb-2 text-xs text-amber-300">
            Uç sayısı tavana dayandı; yeni uçlar sayılmıyor. Beklenmedik bir adres üretimi olabilir.
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-white/50">
              <tr>
                <th className="py-1 pr-3">Uç</th>
                <th className="py-1 pr-3 text-right">İstek</th>
                <th className="py-1 pr-3 text-right">p50</th>
                <th className="py-1 pr-3 text-right">p95</th>
                <th className="py-1 pr-3 text-right">p99</th>
                <th className="py-1 pr-3 text-right">En yüksek</th>
                <th className="py-1 pr-3 text-right">4xx</th>
                <th className="py-1 text-right">5xx</th>
              </tr>
            </thead>
            <tbody>
              {d.routes.map((r) => (
                <tr key={`${r.method} ${r.route}`} className="border-t border-white/5">
                  <td className="py-1 pr-3">
                    <span className="text-white/50">{r.method}</span> {r.route}
                  </td>
                  <td className="py-1 pr-3 text-right">{r.count}</td>
                  <td className="py-1 pr-3 text-right">{ms(r.p50)}</td>
                  <td className={`py-1 pr-3 text-right ${r.p95 > 3000 ? "text-red-300" : r.p95 > 1000 ? "text-amber-300" : ""}`}>{ms(r.p95)}</td>
                  <td className="py-1 pr-3 text-right">{ms(r.p99)}</td>
                  <td className="py-1 pr-3 text-right text-white/50">{ms(r.maxMs)}</td>
                  <td className="py-1 pr-3 text-right text-white/50">{r.clientErrors || ""}</td>
                  <td className={`py-1 text-right ${r.serverErrors > 0 ? "text-red-300" : "text-white/50"}`}>{r.serverErrors || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-semibold">En yavaş SQL</h2>
        {d.slowQueries.length === 0 ? (
          <p className="text-sm text-white/50">
            Eşiği (varsayılan 500 ms) aşan sorgu görülmedi.
          </p>
        ) : (
          <ul className="space-y-2">
            {d.slowQueries.map((q, i) => (
              <li key={i} className="rounded border border-white/10 p-2">
                <div className="flex justify-between text-xs text-white/50">
                  <span>{q.count}× · en yüksek {ms(q.ms)}</span>
                  <span>{when(q.at)}</span>
                </div>
                <code className="mt-1 block overflow-x-auto whitespace-pre-wrap break-words text-xs">{q.sql}</code>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-white/40">
          Sorgu metinleri normalleştirilir (sayı ve dize sabitleri `?` olur); parametre değerleri hiçbir zaman kaydedilmez.
        </p>
      </Card>
    </div>
  );
}
