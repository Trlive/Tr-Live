"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import { api, fmtDate, fmtNumber } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, inputCls, tableCls, tableWrap, tdCls, thCls } from "@/components/ui";
import { ActionMsg, newKey, useAction } from "@/components/admin/kit";

type Pkg = { code: string; coins: string; label: string; priceTry: number; listTry: number; discountPct: number };
type Req = { id: string; requestedCoins: string; packageCode: string; referenceNote?: string | null; status: string; reviewNote?: string | null; reviewedAt?: string | null; createdAt: string };

const statusText: Record<string, [string, "gold" | "green" | "red" | "gray"]> = {
  pending: ["Bekliyor", "gold"],
  approved: ["Onaylandı", "green"],
  rejected: ["Reddedildi", "red"],
};
const tl = (n: number) => `${n.toLocaleString("tr-TR")} ₺`;

export default function DealerTopup() {
  const { data, error, loading, reload } = useApi<{ requests: Req[]; packages: Pkg[] }>("/api/dealer/topup-requests");
  const { busy, msg, run } = useAction();
  const [pick, setPick] = useState("");
  const [note, setNote] = useState("");
  const [key, setKey] = useState(newKey);
  const pending = (data?.requests ?? []).some((r) => r.status === "pending");
  const pkg = data?.packages.find((p) => p.code === pick);

  function send() {
    if (!pkg) return;
    run("Talebiniz alındı. Ödeme teyit edilince bakiyenize eklenecek.", async () => {
      if (!window.confirm(`${pkg.label} için ${tl(pkg.priceTry)} tutarında bakiye talebi oluşturulsun mu?`)) return false;
      await api("/api/dealer/topup-requests", {
        method: "POST",
        body: { packageCode: pkg.code, referenceNote: note.trim() || undefined },
        headers: { "Idempotency-Key": key },
      });
      setKey(newKey());
      setPick("");
      setNote("");
      reload();
    });
  }

  return (
    <div>
      <PageHeader icon={<Wallet size={18} />} kicker="Bayi" title="Bakiye Talebi" description="Toptan paket seçin, ödemeyi yapın; yönetim onaylayınca Coin bakiyenize eklenir." />
      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && (
        <div className="space-y-6">
          <Card title="Paket seçin" subtitle="Ödeme platform dışında yapılır; açıklamaya havale / dekont referansını yazın.">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {data.packages.map((p) => (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => setPick(p.code)}
                  className={`rounded-xl border p-4 text-left transition ${pick === p.code ? "border-[#d7b56d] bg-[#292114]" : "border-[#30291e] hover:border-[#8c713d]"}`}
                >
                  <div className="text-lg font-bold text-white">{p.label}</div>
                  <div className="mt-1 text-sm text-[#d7b56d]">{tl(p.priceTry)}</div>
                  {p.discountPct > 0 && (
                    <div className="mt-1 text-xs text-gray-500">
                      Liste {tl(p.listTry)} · %{p.discountPct} avantaj
                    </div>
                  )}
                </button>
              ))}
            </div>
            <div className="mt-4 space-y-3">
              <input className={inputCls} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Ödeme referansı / açıklama" />
              {pending && <p className="text-sm text-[#d7b56d]">Bekleyen bir talebiniz var; yine de yeni talep oluşturabilirsiniz.</p>}
              <ActionMsg msg={msg} />
              <button type="button" onClick={send} disabled={busy || !pkg} className="gold-button disabled:opacity-60">
                {busy ? "Gönderiliyor..." : pkg ? `${pkg.label} talep et` : "Paket seçin"}
              </button>
            </div>
          </Card>

          <Card title="Taleplerim">
            {data.requests.length === 0 ? (
              <Empty title="Henüz talep yok." />
            ) : (
              <div className={tableWrap}>
                <table className={tableCls}>
                  <thead>
                    <tr>
                      <th className={thCls}>Tarih</th>
                      <th className={thCls}>Coin</th>
                      <th className={thCls}>Durum</th>
                      <th className={thCls}>Açıklama</th>
                      <th className={thCls}>Yönetim notu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.requests.map((r) => {
                      const [label, tone] = statusText[r.status] ?? [r.status, "gray"];
                      return (
                        <tr key={r.id}>
                          <td className={tdCls}>{fmtDate(r.createdAt)}</td>
                          <td className={tdCls}>{fmtNumber(r.requestedCoins)}</td>
                          <td className={tdCls}>
                            <Badge tone={tone}>{label}</Badge>
                          </td>
                          <td className={tdCls}>{r.referenceNote || "—"}</td>
                          <td className={tdCls}>{r.reviewNote || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
