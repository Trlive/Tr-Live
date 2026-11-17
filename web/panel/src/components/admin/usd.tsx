"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import { api, fmtDate, fmtMoney, fmtNumber } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, StatCard, inputCls } from "@/components/ui";
import { ActionMsg, Field, Tabs, UserLink, btnDangerOutline, btnOk, newKey, useAction } from "./kit";
import { UserPicker, type AdminUser } from "./user-picker";
import { ConfigForm } from "./config-form";

type W = { id: string; amountCents: string; method: string; account: string; status: string; adminNote: string | null; decidedAt: string | null; createdAt: string; userId?: string; username?: string; displayName?: string | null };
type Overview = {
  withdrawals: W[];
  totals: { walletCents: string; pendingCents: string; pendingCount: number; paidCents: string; dealerCents: string; dealerCoins: string; exchangeCents: string; exchangeCoins: string };
};
type St = "pending" | "paid" | "rejected" | "cancelled";
const stText: Record<St, string> = { pending: "Bekleyen", paid: "Ödenen", rejected: "Reddedilen", cancelled: "Vazgeçilen" };
/** 1 Fasulye = 1 dolar = 100 sent. */
const bean = (cents: unknown) => `${fmtMoney(cents, "USD").replace("$", "")} Fasulye`;

export default function AdminUsd() {
  const [tab, setTab] = useState<St | "adjust" | "settings">("pending");
  const ov = useApi<Overview>(`/api/admin/usd?status=${["pending", "paid", "rejected", "cancelled"].includes(tab) ? tab : "pending"}`);
  const t = ov.data?.totals;
  return (
    <div>
      <PageHeader icon={<Wallet size={18} />} kicker="Ekonomi" title="Fasulye Cüzdanı" description="1 Fasulye = 1 $. Yönetime gönderilen çekim talepleri, elle düzeltme ve ayarlar." />
      {t && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Cüzdanlardaki toplam" value={bean(t.walletCents)} tone="gold" />
          <StatCard label="Bekleyen çekim" value={bean(t.pendingCents)} note={`${t.pendingCount} talep`} tone={t.pendingCount > 0 ? "red" : "green"} />
          <StatCard label="Ödenen toplam" value={bean(t.paidCents)} tone="green" />
          <StatCard label="Coin'e çevrilen" value={bean(BigInt(t.exchangeCents) + BigInt(t.dealerCents))} note={`${fmtNumber(BigInt(t.exchangeCoins) + BigInt(t.dealerCoins))} Coin (bayi dahil)`} tone="blue" />
        </div>
      )}
      <Tabs
        tabs={[
          { key: "pending", label: "Bekleyen", count: t?.pendingCount ?? null },
          { key: "paid", label: "Ödenen" },
          { key: "rejected", label: "Reddedilen" },
          { key: "cancelled", label: "Vazgeçilen" },
          { key: "adjust", label: "Elle düzeltme" },
          { key: "settings", label: "Ayarlar" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "adjust" && <Adjust onDone={ov.reload} />}
      {tab === "settings" && (
        <ConfigForm
          title="Fasulye ayarları"
          fields={[
            { key: "usdEnabled", label: "Fasulye gönderimi açık", type: "bool", hint: "Kapalıyken yönetime ve bayiye gönderim yapılamaz; bakiye görünür." },
            { key: "usdAutoCredit", label: "Dönem kapanınca maaş ve primler cüzdanlara otomatik yatsın", type: "bool" },
            { key: "usdWithdrawMinCents", label: "Yönetime gönderim alt sınırı", type: "int", scale: 100, suffix: "Fasulye" },
            { key: "usdDealerMinCents", label: "Bayiye gönderim alt sınırı", type: "int", scale: 100, suffix: "Fasulye" },
            { key: "usdDealerCoinsPerUsd", label: "Bayiye gönderimde 1 Fasulye", type: "int", suffix: "Coin" },
            { key: "usdCoinsPerUsd", label: "Coin'e çevirmede 1 Fasulye", type: "int", suffix: "Coin" },
            { key: "usdExchangeMinCents", label: "Coin'e çevirme alt sınırı", type: "int", scale: 100, suffix: "Fasulye" },
          ]}
          onSaved={ov.reload}
        />
      )}
      {["pending", "paid", "rejected", "cancelled"].includes(tab) && (
        <Card>
          {ov.loading && !ov.data && <Loading />}
          {ov.error && <ErrorBox message={ov.error} onRetry={ov.reload} />}
          {ov.data &&
            (ov.data.withdrawals.length === 0 ? (
              <Empty title={`${stText[tab as St]} talep yok.`} />
            ) : (
              <div className="space-y-3">
                {ov.data.withdrawals.map((w) => (
                  <WithdrawalRow key={w.id} w={w} onDone={ov.reload} />
                ))}
              </div>
            ))}
        </Card>
      )}
    </div>
  );
}

function WithdrawalRow({ w, onDone }: { w: W; onDone: () => void }) {
  const { busy, msg, run } = useAction();
  const [note, setNote] = useState("");
  return (
    <div className="rounded-xl border border-[#30291e] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <UserLink user={w.userId ? { id: w.userId, username: w.username ?? "", displayName: w.displayName ?? undefined } : null} sub={fmtDate(w.createdAt)} />
        <div className="text-right">
          <div className="text-lg font-bold text-[#d7b56d]">{bean(w.amountCents)}</div>
          <div className="text-xs text-gray-500">{fmtMoney(w.amountCents, "USD")}</div>
        </div>
      </div>
      <div className="mt-3 rounded-lg bg-[#171717] p-3 text-sm">
        <div className="text-gray-400">{w.method}</div>
        <div className="break-all font-mono text-white">{w.account}</div>
      </div>
      {w.adminNote && <p className="mt-2 text-sm text-gray-400">Not: {w.adminNote}</p>}
      {w.status !== "pending" && (
        <p className="mt-2 text-xs text-gray-500">
          <Badge tone={w.status === "paid" ? "green" : w.status === "rejected" ? "red" : "gray"}>{stText[w.status as St] ?? w.status}</Badge> {fmtDate(w.decidedAt)}
        </p>
      )}
      {w.status === "pending" && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input className={`${inputCls} flex-1`} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Not (ödemede isteğe bağlı, retde zorunlu)" />
          <button
            type="button"
            className={btnOk}
            disabled={busy}
            onClick={() =>
              run("Ödendi olarak işaretlendi.", async () => {
                if (!window.confirm(`${bean(w.amountCents)} ödemesini yaptınız mı? Ödendi olarak işaretlenecek.`)) return false;
                await api(`/api/admin/usd/withdrawals/${w.id}/pay`, { method: "POST", body: { note: note.trim() || undefined }, headers: { "Idempotency-Key": `usdpay-${w.id}` } });
                onDone();
              })
            }
          >
            Ödendi
          </button>
          <button
            type="button"
            className={btnDangerOutline}
            disabled={busy}
            onClick={() =>
              run("Reddedildi; tutar cüzdana iade edildi.", async () => {
                if (note.trim().length < 2) throw new Error("Ret nedenini not alanına yazın.");
                if (!window.confirm("Talep reddedilsin mi? Tutar kullanıcının cüzdanına geri yatar.")) return false;
                await api(`/api/admin/usd/withdrawals/${w.id}/reject`, { method: "POST", body: { note: note.trim() }, headers: { "Idempotency-Key": `usdrej-${w.id}` } });
                onDone();
              })
            }
          >
            Reddet
          </button>
        </div>
      )}
      <div className="mt-2">
        <ActionMsg msg={msg} />
      </div>
    </div>
  );
}

function Adjust({ onDone }: { onDone: () => void }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [key, setKey] = useState(newKey);
  const { busy, msg, run } = useAction();
  const wallet = useApi<{ balanceCents: string }>(user ? `/api/admin/usd/users/${user.id}` : null);
  const cents = (() => {
    const n = Number(amount.replace(",", "."));
    return Number.isFinite(n) && n !== 0 ? Math.round(n * 100) : 0;
  })();
  return (
    <Card title="Elle düzeltme" subtitle="Pozitif tutar ekler, negatif tutar düşer. İşlem kaydına yazılır.">
      <div className="space-y-4">
        {user ? (
          <div className="flex flex-wrap items-center gap-3 text-sm text-white">
            @{user.username} · bakiye: {wallet.data ? bean(wallet.data.balanceCents) : "…"}
            <button type="button" className="text-xs text-[#d7b56d]" onClick={() => setUser(null)}>
              Değiştir
            </button>
          </div>
        ) : (
          <UserPicker onPick={setUser} />
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Tutar (Fasulye)" hint="Ör. 25 ekler, -5 düşer. Kuruş için 2,50 yazın.">
            <input className={inputCls} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Not (zorunlu)">
            <input className={inputCls} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
        <ActionMsg msg={msg} />
        <button
          type="button"
          className="gold-button disabled:opacity-60"
          disabled={busy || !user || cents === 0 || note.trim().length < 2}
          onClick={() =>
            run("Bakiye düzeltildi.", async () => {
              if (!window.confirm(`@${user?.username} için ${bean(cents)} ${cents > 0 ? "eklensin" : "düşülsün"} mi?`)) return false;
              await api("/api/admin/usd/adjust", { method: "POST", body: { userId: user?.id, amountCents: String(cents), note: note.trim() }, headers: { "Idempotency-Key": key } });
              setKey(newKey());
              setAmount("");
              setNote("");
              wallet.reload();
              onDone();
            })
          }
        >
          Uygula
        </button>
      </div>
    </Card>
  );
}
