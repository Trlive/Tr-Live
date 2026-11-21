"use client";

import { useEffect, useState } from "react";
import { api, fmtDate, fmtNumber } from "@/core/api/api";
import { useApi } from "@/core/api/use-api";
import { Badge, Card, Empty, ErrorBox, Loading, inputCls, tableCls, tableWrap, tdCls, thCls } from "@/shared/components/ui";
import { ActionMsg, UserLink, btnSmall, selectCls, useAction, type Brief } from "@/shared/components/kit";

type Budget = {
  key: string; name: string; monthlyLimit: string; enabled: boolean; note: string | null;
  used: string; grants: number; left: string | null; updatedAt: string;
};
/**
 * Basım bütçeleri: satın alınmamış, sıfırdan üretilen Coin.
 * Bu Coin hediye edilince yayıncının elmasına, elmas da çekimle gerçek paraya dönüşür —
 * yani basılan her Coin gerçek bir maliyettir. Aylık sınır bu maliyetin kontrolüdür.
 */
export default function Budgets() {
  const { data, error, loading, reload } = useApi<{ period: string; budgets: Budget[] }>("/api/admin/finance/budgets");
  const { busy, msg, run } = useAction();
  const [form, setForm] = useState<Record<string, { limit: string; enabled: boolean; note: string }>>({});

  useEffect(() => {
    if (!data) return;
    const f: typeof form = {};
    for (const b of data.budgets) f[b.key] = { limit: b.monthlyLimit, enabled: b.enabled, note: b.note ?? "" };
    setForm(f);
  }, [data]);

  const save = (b: Budget) =>
    run("Kaydedildi.", async () => {
      const f = form[b.key];
      await api(`/api/admin/finance/budgets/${b.key}`, {
        method: "PUT",
        body: { monthlyLimit: f.limit.replace(/\D/g, "") || "0", enabled: f.enabled, note: f.note },
      });
      reload();
    });


  return (
    <div className="space-y-4">
      <Card
        title={`Basım bütçeleri · ${data?.period ?? ""}`}
        subtitle="Sıfırdan üretilen Coin. Satın alma karşılığı yüklemeler buraya yazılmaz; bütçe seçilmeyen yüklemeler 'Yönetici düzenlemesi' kalır."
      >
        {loading && !data && <Loading />}
        {error && <ErrorBox message={error} onRetry={reload} />}
        {data && (
          <div className="space-y-3">
            {data.budgets.map((b) => {
              const f = form[b.key] ?? { limit: b.monthlyLimit, enabled: b.enabled, note: b.note ?? "" };
              const limit = BigInt(b.monthlyLimit || "0");
              const used = BigInt(b.used || "0");
              const pct = limit > 0n ? Number((used * 100n) / limit) : 0;
              const over = limit > 0n && used >= limit;
              return (
                <div key={b.key} className="rounded-lg border border-[#30291e] bg-[#15120d] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-semibold text-white">{b.name}</span>
                      <span className="ml-2 text-xs text-gray-500">{b.key}</span>
                      {!b.enabled && <Badge tone="gray">Kapalı</Badge>}
                      {over && <Badge tone="red">Sınır doldu</Badge>}
                    </div>
                    <div className="text-sm text-gray-300">
                      Bu ay <b className={over ? "text-red-300" : "text-amber-300"}>{fmtNumber(b.used)}</b> Coin
                      {limit > 0n ? <span className="text-gray-500"> / {fmtNumber(b.monthlyLimit)}</span> : <span className="text-gray-500"> (sınırsız)</span>}
                      <span className="ml-2 text-xs text-gray-500">{b.grants} işlem</span>
                    </div>
                  </div>
                  {limit > 0n && (
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-[#2a2319]">
                      <div className={`h-full ${over ? "bg-red-500" : pct > 75 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                  )}
                  <div className="mt-3 grid gap-2 md:grid-cols-[160px_1fr_auto] md:items-center">
                    <input
                      className={inputCls}
                      inputMode="numeric"
                      value={f.limit}
                      aria-label="Aylık sınır"
                      placeholder="Aylık sınır (0 = sınırsız)"
                      onChange={(e) => setForm({ ...form, [b.key]: { ...f, limit: e.target.value.replace(/\D/g, "") } })}
                    />
                    <input
                      className={inputCls}
                      value={f.note}
                      aria-label="Not"
                      placeholder="Not"
                      onChange={(e) => setForm({ ...form, [b.key]: { ...f, note: e.target.value } })}
                    />
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-sm text-gray-300">
                        <input type="checkbox" checked={f.enabled} onChange={(e) => setForm({ ...form, [b.key]: { ...f, enabled: e.target.checked } })} /> Açık
                      </label>
                      <button type="button" disabled={busy} className={btnSmall} onClick={() => save(b)}>Kaydet</button>
                    </div>
                  </div>
                </div>
              );
            })}
            <ActionMsg msg={msg} />
          </div>
        )}
      </Card>

      {/* "Aylık basım" tablosu ve "Son basımlar" listesi kaldırıldı (sahibin kararı):
          test, etkinlik, telafi ve pazarlama basımları hiçbir listede görünmüyor.
          Bütçe kartındaki aylık sayaç duruyor — o bir liste değil, sınırın kendisi. */}
    </div>
  );
}

