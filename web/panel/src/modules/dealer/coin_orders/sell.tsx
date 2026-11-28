"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, Coins, Search, Send, X } from "lucide-react";
import { api, fmtDate, fmtNumber } from "@/core/api/api";
import { useApi } from "@/core/api/use-api";
import { Card, Empty, ErrorBox, Loading, PageHeader, StatCard, inputCls, tableCls, tableWrap, tdCls, thCls } from "@/shared/components/ui";
import { ActionMsg, newKey, useAction } from "@/shared/components/kit";
import { Avatar } from "@/modules/admin/users/user-picker";
import { isOut, txText, type DealerMe } from "@/modules/dealer/shell/common";

const QUICK = ["10000", "50000", "100000", "500000", "1000000"];

type Buyer = { id: string; username: string; displayName?: string; publicId?: string | null; avatarUrl?: string | null; level?: number };
type Customer = Buyer & { total: string; count: number; lastAt: string };
type Stats = {
  today: { coins: string; count: number };
  week: { coins: string; count: number };
  month: { coins: string; count: number; buyers: number };
  customers: Customer[];
};

/**
 * Bayi Coin satışı (v2.122): alıcı uygulamadaki ID'si ya da kullanıcı adıyla ARANIR ve satıştan önce profili (fotoğraf,
 * ad, ID, seviye) gösterilir — yanlış kişiye Coin gitmez. Sık alan müşteriler tek dokunuşla seçilir; bugün / 7 gün /
 * 30 gün satış özeti sunucudan gelir. Alıcının bakiyesi uygulamada anında güncellenir ve bildirim alır.
 */
export default function DealerSell() {
  const { data, error, loading, reload } = useApi<DealerMe>("/api/dealer/me");
  const stats = useApi<Stats>("/api/dealer/stats");
  const { busy, msg, run } = useAction();
  const [q, setQ] = useState("");
  const [buyer, setBuyer] = useState<Buyer | null>(null);
  const [findErr, setFindErr] = useState("");
  const [finding, setFinding] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [price, setPrice] = useState(""); // müşteriden alınan bedel (₺) — Gelir-Gider raporu
  // Aynı satış iki kez gönderilmesin: anahtar ancak başarılı satıştan sonra yenilenir.
  const [key, setKey] = useState(newKey);
  const amountRef = useRef<HTMLInputElement>(null);

  const coins = amount.replace(/\D/g, "");
  const balance = BigInt(data?.dealer.coinBalance ?? "0");
  const tooMuch = coins !== "" && BigInt(coins) > balance;

  useEffect(() => {
    if (buyer) amountRef.current?.focus();
  }, [buyer]);

  async function find(e?: FormEvent) {
    e?.preventDefault();
    const who = q.trim().replace(/^@/, "");
    if (!who) return;
    setFinding(true);
    setFindErr("");
    setBuyer(null);
    try {
      const r = await api<{ user: Buyer }>(`/api/dealer/lookup?q=${encodeURIComponent(who)}`);
      setBuyer(r.user);
    } catch (err) {
      setFindErr(err instanceof Error ? err.message : "Kullanıcı bulunamadı.");
    } finally {
      setFinding(false);
    }
  }

  function pick(c: Customer) {
    setBuyer(c);
    setQ(c.publicId || c.username);
    setFindErr("");
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const b = buyer;
    if (!b || !coins || coins === "0" || tooMuch) return;
    const label = `${b.displayName || b.username} (ID ${b.publicId ?? "—"})`;
    run(`${label} hesabına ${fmtNumber(coins)} Coin gönderildi.`, async () => {
      if (!window.confirm(`${label} hesabına ${fmtNumber(coins)} Coin gönderilsin mi?\nBu işlem geri alınamaz.`)) return false;
      await api("/api/dealer/sell", {
        method: "POST",
        body: { userId: b.id, amount: coins, description: note.trim() || undefined, priceTry: price.trim().replace(",", ".") || undefined },
        headers: { "Idempotency-Key": key },
      });
      setKey(newKey());
      setAmount("");
      setNote("");
      setPrice("");
      setBuyer(null);
      setQ("");
      reload();
      stats.reload();
    });
  }

  const recent = (data?.transactions ?? []).filter(isOut).slice(0, 10);
  const s = stats.data;
  return (
    <div>
      <PageHeader icon={<Coins size={18} />} kicker="Bayi" title="Coin Satışı" description="Bakiyenizden kullanıcıya Coin gönderin." />
      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Coin bakiyeniz" value={fmtNumber(data.dealer.coinBalance)} note={data.dealer.name} tone="gold" />
            <StatCard label="Bugün satış" value={fmtNumber(s?.today.coins ?? "0")} note={s ? `${s.today.count} işlem` : undefined} tone="green" />
            <StatCard label="Son 7 gün" value={fmtNumber(s?.week.coins ?? "0")} note={s ? `${s.week.count} işlem` : undefined} tone="green" />
            <StatCard label="Son 30 gün" value={fmtNumber(s?.month.coins ?? "0")} note={s ? `${s.month.count} işlem · ${s.month.buyers} alıcı` : undefined} tone="green" />
          </div>

          <Card title="Kullanıcıya Coin gönder" subtitle="Alıcının uygulamadaki ID'sini (profilinde yazar) ya da kullanıcı adını girin.">
            <form onSubmit={find} className="flex gap-2">
              <input
                className={`${inputCls} flex-1`}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setBuyer(null);
                  setFindErr("");
                }}
                placeholder="ID ya da @kullaniciadi"
                autoComplete="off"
              />
              <button type="submit" disabled={finding || !q.trim()} className="gold-button shrink-0 inline-flex items-center gap-2 disabled:opacity-60">
                <Search size={16} />
                {finding ? "Aranıyor..." : "Bul"}
              </button>
            </form>
            {findErr && <p className="mt-2 text-sm text-red-400">{findErr}</p>}

            {s && s.customers.length > 0 && !buyer && (
              <div className="mt-4">
                <p className="mb-2 text-xs text-gray-500">Son müşteriler</p>
                <div className="flex flex-wrap gap-2">
                  {s.customers.map((c) => (
                    <button key={c.id} type="button" onClick={() => pick(c)} className="inline-flex items-center gap-2 rounded-full border border-[#383024] py-1 pl-1 pr-3 text-xs text-gray-200 hover:bg-[#292114]">
                      <Avatar url={c.avatarUrl} name={c.displayName || c.username} size={24} />
                      <span className="max-w-[9rem] truncate">{c.displayName || c.username}</span>
                      <span className="text-[#d7b56d]">{fmtNumber(c.total)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {buyer && (
              <form onSubmit={submit} className="mt-5 space-y-4">
                <div className="flex items-center gap-3 rounded-xl border border-[#f2b92a]/50 bg-[#1a1408] p-3">
                  <Avatar url={buyer.avatarUrl} name={buyer.displayName || buyer.username} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate font-semibold text-white">
                      <CheckCircle2 size={15} className="text-green-400" />
                      {buyer.displayName || buyer.username}
                    </p>
                    <p className="text-xs text-gray-400">
                      ID {buyer.publicId ?? "—"} · @{buyer.username}
                      {buyer.level ? ` · Seviye ${buyer.level}` : ""}
                    </p>
                  </div>
                  <button type="button" onClick={() => setBuyer(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-[#292114]" aria-label="Alıcıyı değiştir">
                    <X size={16} />
                  </button>
                </div>
                <label className="block text-sm text-gray-400">
                  Coin miktarı
                  <input ref={amountRef} className={`${inputCls} mt-1`} value={coins ? fmtNumber(coins) : ""} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="0" />
                </label>
                <div className="flex flex-wrap gap-2">
                  {QUICK.map((v) => (
                    <button key={v} type="button" onClick={() => setAmount(v)} className="rounded-lg border border-[#383024] px-3 py-1.5 text-xs text-[#d7b56d] hover:bg-[#292114]">
                      {fmtNumber(v)}
                    </button>
                  ))}
                </div>
                <label className="block text-sm text-gray-400">
                  Satış bedeli ₺ (isteğe bağlı — kâr raporu için)
                  <input className={`${inputCls} mt-1`} value={price} inputMode="decimal" onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="Ör. 800" />
                </label>
                <label className="block text-sm text-gray-400">
                  Not (isteğe bağlı)
                  <input className={`${inputCls} mt-1`} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Ör. havale referansı" />
                </label>
                {tooMuch && <p className="text-sm text-red-400">Bakiyeniz yetersiz.</p>}
                <button type="submit" disabled={busy || !coins || coins === "0" || tooMuch} className="gold-button inline-flex items-center gap-2 disabled:opacity-60">
                  <Send size={16} />
                  {busy ? "Gönderiliyor..." : coins ? `${fmtNumber(coins)} Coin gönder` : "Coin gönder"}
                </button>
              </form>
            )}
            <div className="mt-3">
              <ActionMsg msg={msg} />
            </div>
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
