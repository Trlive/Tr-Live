"use client";

import { useState } from "react";
import { Banknote } from "lucide-react";
import { fmtNumber } from "@/core/api/api";
import { useApi } from "@/core/api/use-api";
import { Card, ErrorBox, Loading, PageHeader, inputCls, tableCls, tableWrap, tdCls, thCls } from "@/shared/components/ui";

type Fin = {
  spentTry: string; coinsIn: string; bonusCoins: string; coinsOut: string; sales: number;
  revenueTry: string; cogsTry: string; profitTry: string; marginBps: number | null;
  unpriced: { sales: number; coins: string };
  stock: { coins: string; costTry: string; avgCostPer1000: string | null };
  daily: { day: string; coinsOut: string; revenueTry: string; profitTry: string; spentTry: string }[];
};
const tl = (v: string | number) => `₺${Number(v).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}`;
const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Bayi gelir-gider: satış bedeli (girilen), satılan Coin'in stok maliyeti (ağırlıklı ortalama), brüt kâr, stok alımı, stok değeri. */
export default function DealerFinance() {
  const now = new Date();
  const [from, setFrom] = useState(day(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(day(now));
  const { data, error, loading, reload } = useApi<Fin>(`/api/dealer/finance?from=${from}&to=${to}`);
  const kpi = (k: string, v: string, tone = "text-white") => (
    <div className="rounded-xl border border-[#30291e] bg-[#17130c] p-4">
      <div className="text-xs text-gray-500">{k}</div>
      <div className={`mt-1 text-xl font-bold ${tone}`}>{v}</div>
    </div>
  );
  return (
    <div>
      <PageHeader icon={<Banknote size={18} />} kicker="Bayi" title="Gelir-Gider"
        description="Satışta girdiğiniz bedel gelirdir; satılan Coin'in maliyeti stok alımlarınızın ağırlıklı ortalamasıdır (ek Coin maliyetsizdir)." />
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <label className="text-xs text-gray-400">Başlangıç<input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-xs text-gray-400">Bitiş<input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {kpi("Satış geliri", tl(data.revenueTry))}
            {kpi("Satılan Coin maliyeti", tl(data.cogsTry))}
            {kpi("Brüt kâr", tl(data.profitTry), Number(data.profitTry) >= 0 ? "text-green-500" : "text-red-400")}
            {kpi("Kâr marjı", data.marginBps === null ? "—" : `%${(data.marginBps / 100).toLocaleString("tr-TR")}`)}
            {kpi("Stok alımı (gider)", tl(data.spentTry))}
            {kpi("Satılan Coin", `${fmtNumber(data.coinsOut)} (${data.sales} satış)`, "text-[#d7b56d]")}
            {kpi("Ek Coin (bonus)", fmtNumber(data.bonusCoins), "text-green-500")}
            {kpi("Stok değeri", `${tl(data.stock.costTry)}${data.stock.avgCostPer1000 ? ` · 1.000 Coin = ₺${data.stock.avgCostPer1000}` : ""}`)}
          </div>
          {data.unpriced.sales > 0 && (
            <p className="text-sm text-amber-400">
              {data.unpriced.sales} satışta bedel girilmedi ({fmtNumber(data.unpriced.coins)} Coin); bu satışlar kâra dahil değil. Satışta &quot;Satış bedeli&quot;ni girerseniz rapor tamamlanır.
            </p>
          )}
          <Card title="Günlük">
            <div className={tableWrap}>
              <table className={tableCls}>
                <thead><tr><th className={thCls}>Gün</th><th className={thCls}>Satılan Coin</th><th className={thCls}>Gelir</th><th className={thCls}>Kâr</th><th className={thCls}>Stok alımı</th></tr></thead>
                <tbody>
                  {data.daily.map((d) => (
                    <tr key={d.day}>
                      <td className={tdCls}>{d.day}</td>
                      <td className={tdCls}>{fmtNumber(d.coinsOut)}</td>
                      <td className={tdCls}>{tl(d.revenueTry)}</td>
                      <td className={`${tdCls} ${Number(d.profitTry) >= 0 ? "text-green-500" : "text-red-400"}`}>{tl(d.profitTry)}</td>
                      <td className={tdCls}>{tl(d.spentTry)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
