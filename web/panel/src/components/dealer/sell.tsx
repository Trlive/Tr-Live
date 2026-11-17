"use client";

import { useState, type FormEvent } from "react";
import { Coins, Send } from "lucide-react";
import { api, fmtDate, fmtNumber } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { Card, Empty, ErrorBox, Loading, PageHeader, StatCard, inputCls, tableCls, tableWrap, tdCls, thCls } from "@/components/ui";
import { ActionMsg, newKey, useAction } from "@/components/admin/kit";
import { isOut, txText, type DealerMe } from "./common";

const QUICK = ["10000", "50000", "100000", "500000"];

export default function DealerSell() {
  const { data, error, loading, reload } = useApi<DealerMe>("/api/dealer/me");
  const { busy, msg, run } = useAction();
  const [username, setUsername] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  // Aynı satış iki kez gönderilmesin: anahtar ancak başarılı satıştan sonra yenilenir.
  const [key, setKey] = useState(newKey);

  const coins = amount.replace(/\D/g, "");
  const balance = BigInt(data?.dealer.coinBalance ?? "0");
  const tooMuch = coins !== "" && BigInt(coins) > balance;

  function submit(e: FormEvent) {
    e.preventDefault();
    const who = username.trim().replace(/^@/, "");
    if (!who || !coins || coins === "0" || tooMuch) return;
    run(`@${who} kullanıcısına ${fmtNumber(coins)} Coin gönderildi.`, async () => {
      if (!window.confirm(`@${who} kullanıcısına ${fmtNumber(coins)} Coin satılsın mı? Bu işlem geri alınamaz.`)) return false;
      await api("/api/dealer/sell", {
        method: "POST",
        body: { username: who, amount: coins, description: note.trim() || undefined },
        headers: { "Idempotency-Key": key },
      });
      setKey(newKey());
      setAmount("");
      setNote("");
      reload();
    });
  }

  const recent = (data?.transactions ?? []).filter(isOut).slice(0, 10);
  return (
    <div>
      <PageHeader icon={<Coins size={18} />} kicker="Bayi" title="Coin Satışı" description="Bakiyenizden kullanıcıya Coin gönderin." />
      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard label="Coin bakiyeniz" value={fmtNumber(data.dealer.coinBalance)} note={data.dealer.name} tone="gold" />
            <StatCard
              label="Son 50 hareketteki satış"
              value={fmtNumber(data.transactions.filter(isOut).reduce((t, x) => t + BigInt(x.coinAmount), BigInt(0)).toString())}
              tone="green"
            />
          </div>

          <Card title="Kullanıcıya Coin gönder" subtitle="Kullanıcı adını uygulamadaki profilinden alın.">
            <form onSubmit={submit} className="space-y-4">
              <label className="block text-sm text-gray-400">
                Kullanıcı adı
                <input className={`${inputCls} mt-1`} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="@kullaniciadi" autoComplete="off" />
              </label>
              <label className="block text-sm text-gray-400">
                Coin miktarı
                <input className={`${inputCls} mt-1`} value={coins ? fmtNumber(coins) : ""} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="0" />
              </label>
              <div className="flex flex-wrap gap-2">
                {QUICK.map((q) => (
                  <button key={q} type="button" onClick={() => setAmount(q)} className="rounded-lg border border-[#383024] px-3 py-1.5 text-xs text-[#d7b56d] hover:bg-[#292114]">
                    {fmtNumber(q)}
                  </button>
                ))}
              </div>
              <label className="block text-sm text-gray-400">
                Not (isteğe bağlı)
                <input className={`${inputCls} mt-1`} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Ör. havale referansı" />
              </label>
              {tooMuch && <p className="text-sm text-red-400">Bakiyeniz yetersiz.</p>}
              <ActionMsg msg={msg} />
              <button type="submit" disabled={busy || !username.trim() || !coins || coins === "0" || tooMuch} className="gold-button inline-flex items-center gap-2 disabled:opacity-60">
                <Send size={16} />
                {busy ? "Gönderiliyor..." : "Coin gönder"}
              </button>
            </form>
          </Card>

          <Card title="Son satışlar">
            {recent.length === 0 ? (
              <Empty title="Henüz satış yok." />
            ) : (
              <div className={tableWrap}>
                <table className={tableCls}>
                  <thead>
                    <tr>
                      <th className={thCls}>Tarih</th>
                      <th className={thCls}>Kullanıcı</th>
                      <th className={thCls}>Coin</th>
                      <th className={thCls}>Not</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((t) => (
                      <tr key={t.id}>
                        <td className={tdCls}>{fmtDate(t.createdAt)}</td>
                        <td className={tdCls}>{t.username ? `@${t.username}` : "—"}</td>
                        <td className={tdCls}>{fmtNumber(t.coinAmount)}</td>
                        <td className={tdCls}>{t.description || txText[t.type] || "—"}</td>
                      </tr>
                    ))}
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
