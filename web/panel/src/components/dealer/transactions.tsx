"use client";

import { useMemo, useState } from "react";
import { History } from "lucide-react";
import { fmtDate, fmtNumber } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, inputCls, tableCls, tableWrap, tdCls, thCls } from "@/components/ui";
import { isOut, txText, type DealerMe } from "./common";

export default function DealerTransactions() {
  const { data, error, loading, reload } = useApi<DealerMe>("/api/dealer/me");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "in" | "out">("all");
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase().replace(/^@/, "");
    return (data?.transactions ?? []).filter(
      (x) => (kind === "all" || (kind === "out") === isOut(x)) && (!t || (x.username ?? "").toLowerCase().includes(t) || (x.description ?? "").toLowerCase().includes(t))
    );
  }, [data, q, kind]);
  return (
    <div>
      <PageHeader icon={<History size={18} />} kicker="Bayi" title="Hareketler" description="Son 50 bakiye hareketi." />
      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && (
        <Card
          title={`Bakiye: ${fmtNumber(data.dealer.coinBalance)} Coin`}
          action={
            <div className="flex gap-2">
              <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as "all" | "in" | "out")}>
                <option value="all">Tümü</option>
                <option value="in">Gelen</option>
                <option value="out">Satış</option>
              </select>
              <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ara" />
            </div>
          }
        >
          {rows.length === 0 ? (
            <Empty title="Hareket yok." />
          ) : (
            <div className={tableWrap}>
              <table className={tableCls}>
                <thead>
                  <tr>
                    <th className={thCls}>Tarih</th>
                    <th className={thCls}>Tür</th>
                    <th className={thCls}>Kullanıcı</th>
                    <th className={thCls}>Coin</th>
                    <th className={thCls}>Açıklama</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id}>
                      <td className={tdCls}>{fmtDate(t.createdAt)}</td>
                      <td className={tdCls}>
                        <Badge tone={isOut(t) ? "red" : "green"}>{txText[t.type] ?? t.type}</Badge>
                      </td>
                      <td className={tdCls}>{t.username ? `@${t.username}` : "—"}</td>
                      <td className={`${tdCls} ${isOut(t) ? "text-red-300" : "text-green-300"}`}>
                        {isOut(t) ? "−" : "+"}
                        {fmtNumber(t.coinAmount)}
                      </td>
                      <td className={tdCls}>{t.description || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
