"use client";

import { useState } from "react";
import { Store } from "lucide-react";
import { api, fmtDate, fmtNumber } from "@/core/api/api";
import { useApi } from "@/core/api/use-api";
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, StatCard, inputCls, tableCls, tableWrap, tdCls, thCls } from "@/shared/components/ui";
import { ActionMsg, Field, Tabs, btnGhost, btnOk, btnDangerOutline, btnSmall, newKey, useAction } from "@/shared/components/kit";
import { UserPicker, type AdminUser } from "@/modules/admin/users/user-picker";
import { PanelLinkBox } from "@/modules/admin/shared/panel-link";

type Dealer = { id: string; name: string; ownerUserId: string | null; ownerUsername: string | null; coinBalance: string; commissionBps: number; isActive: boolean;
  // Ana bayi / Alt bayi. parentDealerId doluysa bu bir ALT bayidir. En fazla iki kat.
  parentDealerId: string | null; parentName: string | null; kind: "main" | "sub" };
type Tx = { id: string; type: string; coinAmount: string; description?: string | null; username?: string | null; adminUsername?: string | null; createdAt: string };
type Req = { id: string; requestedCoins: string; packageCode: string; referenceNote?: string | null; status: string; reviewNote?: string | null; createdAt: string; reviewedAt?: string | null; dealerName?: string; username?: string };

const txText: Record<string, string> = { sale: "Satış", admin_topup: "Talep onayı", credit: "Yönetici yüklemesi", usd_transfer: "Fasulye ile gelen",
  sub_transfer_out: "Alt bayiye aktarım", sub_transfer_in: "Ana bayiden gelen" };

export default function AdminDealers() {
  const [tab, setTab] = useState<"dealers" | "requests" | "history">("dealers");
  const pend = useApi<{ requests: Req[] }>("/api/admin/topup-requests?status=pending");
  return (
    <div>
      <PageHeader icon={<Store size={18} />} kicker="Ekonomi" title="Bayiler" description="Coin bayileri, bakiye yükleme ve bayi bakiye talepleri." />
      <PanelLinkBox kind="dealer" />
      <Tabs
        tabs={[
          { key: "dealers", label: "Bayiler" },
          { key: "requests", label: "Bekleyen talepler", count: pend.data?.requests.length ?? null },
          { key: "history", label: "Sonuçlanan talepler" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "dealers" && <DealerList />}
      {tab === "requests" && <Requests status="pending" onChanged={pend.reload} />}
      {tab === "history" && <Requests status="done" onChanged={pend.reload} />}
    </div>
  );
}

function DealerList() {
  const { data, error, loading, reload } = useApi<{ dealers: Dealer[] }>("/api/admin/dealers");
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const list = data?.dealers ?? [];
  const total = list.reduce((t, d) => t + BigInt(d.coinBalance), BigInt(0)).toString();
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Bayi" value={String(list.length)} note={`${list.filter((d) => d.isActive).length} aktif`} />
        <StatCard label="Bayilerdeki toplam Coin" value={fmtNumber(total)} tone="green" />
        <div className="flex items-center">
          <button type="button" className="gold-button w-full" onClick={() => setCreating((v) => !v)}>
            {creating ? "Vazgeç" : "Yeni bayi"}
          </button>
        </div>
      </div>
      {creating && (
        <NewDealer
          onDone={() => {
            setCreating(false);
            reload();
          }}
        />
      )}
      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && (
        <Card>
          {list.length === 0 ? (
            <Empty title="Henüz bayi yok." />
          ) : (
            <div className="space-y-3">
              {list.map((d) => (
                <DealerRow key={d.id} d={d} all={list} open={open === d.id} onToggle={() => setOpen(open === d.id ? null : d.id)} onChanged={reload} />
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function NewDealer({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [owner, setOwner] = useState<AdminUser | null>(null);
  const { busy, msg, run } = useAction();
  return (
    <Card title="Yeni bayi" subtitle="Bayi, sahibi olan hesapla bayi paneline girer (giriş bağlantısı yukarıda).">
      <div className="space-y-4">
        <Field label="Bayi adı">
          <input className={inputCls} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Sahibi (giriş yapacak hesap)">
          {owner ? (
            <div className="flex items-center gap-3 text-sm text-white">
              @{owner.username}
              <button type="button" className={btnSmall} onClick={() => setOwner(null)}>
                Değiştir
              </button>
            </div>
          ) : (
            <UserPicker onPick={setOwner} />
          )}
        </Field>
        <ActionMsg msg={msg} />
        <button
          type="button"
          className={btnOk}
          disabled={busy || name.trim().length < 2 || !owner}
          onClick={() =>
            run("Bayi oluşturuldu.", async () => {
              await api("/api/admin/dealers", { method: "POST", body: { name: name.trim(), ownerUserId: owner?.id } });
              onDone();
            })
          }
        >
          Oluştur
        </button>
      </div>
    </Card>
  );
}

function DealerRow({ d, all, open, onToggle, onChanged }: { d: Dealer; all: Dealer[]; open: boolean; onToggle: () => void; onChanged: () => void }) {
  return (
    <div className="rounded-xl border border-[#30291e]">
      <button type="button" onClick={onToggle} className="flex w-full flex-wrap items-center gap-3 p-4 text-left">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-white">{d.name}</div>
          <div className="text-xs text-gray-500">
            {d.ownerUsername ? `@${d.ownerUsername}` : "Sahibi yok"}
            {d.kind === "sub" && <span className="ml-2 text-[#d7b56d]">Alt bayi · {d.parentName ?? "?"}</span>}
          </div>
        </div>
        <div className="text-right">
          <div className="font-semibold text-[#d7b56d]">{fmtNumber(d.coinBalance)} Coin</div>
          <Badge tone={d.isActive ? "green" : "red"}>{d.isActive ? "Aktif" : "Durduruldu"}</Badge>
        </div>
      </button>
      {open && <DealerDetail d={d} all={all} onChanged={onChanged} />}
    </div>
  );
}

function DealerDetail({ d, all, onChanged }: { d: Dealer; all: Dealer[]; onChanged: () => void }) {
  const tx = useApi<{ transactions: Tx[] }>(`/api/admin/dealers/${d.id}/transactions`);
  const { busy, msg, run } = useAction();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [key, setKey] = useState(newKey);
  const [name, setName] = useState(d.name);
  const coins = amount.replace(/\D/g, "");
  return (
    <div className="space-y-5 border-t border-[#30291e] p-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <Field label="Bakiye yükle (Coin)" hint="Ödemesi alınmış yükleme. Mali kayıtlara yazılır.">
            <input className={inputCls} inputMode="numeric" value={coins ? fmtNumber(coins) : ""} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          </Field>
          <input className={inputCls} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Açıklama (ör. dekont no)" />
          <button
            type="button"
            className={btnOk}
            disabled={busy || !coins || coins === "0"}
            onClick={() =>
              run(`${fmtNumber(coins)} Coin yüklendi.`, async () => {
                if (!window.confirm(`${d.name} bayisine ${fmtNumber(coins)} Coin yüklensin mi?`)) return false;
                await api(`/api/admin/dealers/${d.id}/coins`, { method: "POST", body: { amount: coins, description: note.trim() || undefined }, headers: { "Idempotency-Key": key } });
                setKey(newKey());
                setAmount("");
                setNote("");
                tx.reload();
                onChanged();
              })
            }
          >
            Yükle
          </button>
        </div>
        {/* Ana bayi / Alt bayi.
            Seçenekler SUNUCUDAKİ kuralla aynı daraltmayı yapıyor: yalnızca kendi ebeveyni
            olmayan (yani ana) bayiler, kendisi hariç. Bu bayinin alt bayileri varsa hiç
            seçenek sunmuyoruz — sunucu da reddeder (en fazla iki kat). */}
        <div className="space-y-3">
          <Field
            label="Ana bayi"
            hint={
              all.some((x) => x.parentDealerId === d.id)
                ? "Bu bayinin alt bayileri var; kendisi alt bayi yapılamaz (en fazla iki kat)."
                : "Boş bırakılırsa bu bayi ANA bayidir. Ana bayi, alt bayilerine kendi stoğundan Coin aktarabilir."
            }
          >
            <select
              className={inputCls}
              value={d.parentDealerId ?? ""}
              disabled={busy || all.some((x) => x.parentDealerId === d.id)}
              onChange={(e) => {
                const next = e.target.value || null;
                void run(next ? "Ana bayi atandı." : "Ana bayi bağı kaldırıldı.", async () => {
                  await api(`/api/admin/dealers/${d.id}/parent`, { method: "POST", body: { parentDealerId: next } });
                  onChanged();
                });
              }}
            >
              <option value="">— Ana bayi (bağımsız) —</option>
              {all
                .filter((x) => x.id !== d.id && !x.parentDealerId)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        <div className="space-y-3">
          <Field label="Bayi adı">
            <input className={inputCls} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btnGhost}
              disabled={busy || name.trim() === d.name || name.trim().length < 2}
              onClick={() =>
                run("Ad güncellendi.", async () => {
                  await api(`/api/admin/dealers/${d.id}/update`, { method: "POST", body: { name: name.trim() } });
                  onChanged();
                })
              }
            >
              Adı kaydet
            </button>
            <button
              type="button"
              className={d.isActive ? btnDangerOutline : btnOk}
              disabled={busy}
              onClick={() =>
                run(d.isActive ? "Bayi durduruldu." : "Bayi açıldı.", async () => {
                  if (d.isActive && !window.confirm("Bayi durdurulsun mu? Satış yapamaz ve panele giremez; bakiyesi korunur.")) return false;
                  await api(`/api/admin/dealers/${d.id}/update`, { method: "POST", body: { isActive: !d.isActive } });
                  onChanged();
                })
              }
            >
              {d.isActive ? "Bayiyi durdur" : "Bayiyi aç"}
            </button>
          </div>
        </div>
      </div>
      <ActionMsg msg={msg} />
      <div>
        <div className="mb-2 text-sm font-semibold text-white">Son hareketler</div>
        {tx.loading && !tx.data && <Loading />}
        {tx.error && <ErrorBox message={tx.error} onRetry={tx.reload} />}
        {tx.data &&
          (tx.data.transactions.length === 0 ? (
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
                  {tx.data.transactions.map((t) => (
                    <tr key={t.id}>
                      <td className={tdCls}>{fmtDate(t.createdAt)}</td>
                      <td className={tdCls}>{txText[t.type] ?? t.type}</td>
                      <td className={tdCls}>{t.username ? `@${t.username}` : t.adminUsername ? `yönetici @${t.adminUsername}` : "—"}</td>
                      <td className={`${tdCls} ${t.type === "sale" ? "text-red-300" : "text-green-300"}`}>
                        {t.type === "sale" ? "−" : "+"}
                        {fmtNumber(t.coinAmount)}
                      </td>
                      <td className={tdCls}>{t.description || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
      </div>
    </div>
  );
}

function Requests({ status, onChanged }: { status: "pending" | "done"; onChanged: () => void }) {
  const [which, setWhich] = useState<"approved" | "rejected">("approved");
  const path = status === "pending" ? "/api/admin/topup-requests?status=pending" : `/api/admin/topup-requests?status=${which}`;
  const { data, error, loading, reload } = useApi<{ requests: Req[] }>(path);
  const { busy, msg, run } = useAction();
  const [notes, setNotes] = useState<Record<string, string>>({});

  function review(r: Req, decision: "approve" | "reject") {
    run(decision === "approve" ? "Onaylandı; Coin bayi bakiyesine eklendi." : "Reddedildi.", async () => {
      const q =
        decision === "approve"
          ? `@${r.username ?? "?"} (${r.dealerName ?? "bayi"}) için ${fmtNumber(r.requestedCoins)} Coin onaylansın mı? Ödemenin alındığından emin olun.`
          : "Talep reddedilsin mi?";
      if (!window.confirm(q)) return false;
      await api(`/api/admin/topup-requests/${r.id}/review`, {
        method: "POST",
        body: { decision, reviewNote: notes[r.id]?.trim() || undefined },
        headers: { "Idempotency-Key": `review-${r.id}-${decision}` },
      });
      reload();
      onChanged();
    });
  }

  return (
    <Card
      action={
        status === "done" ? (
          <select className={inputCls} value={which} onChange={(e) => setWhich(e.target.value as "approved" | "rejected")}>
            <option value="approved">Onaylananlar</option>
            <option value="rejected">Reddedilenler</option>
          </select>
        ) : undefined
      }
    >
      <ActionMsg msg={msg} />
      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data &&
        (data.requests.length === 0 ? (
          <Empty title={status === "pending" ? "Bekleyen talep yok." : "Kayıt yok."} />
        ) : (
          <div className="space-y-3">
            {data.requests.map((r) => (
              <div key={r.id} className="rounded-xl border border-[#30291e] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-white">
                      {r.dealerName ?? "Bayi"} · {fmtNumber(r.requestedCoins)} Coin
                    </div>
                    <div className="text-xs text-gray-500">
                      {r.username ? `@${r.username} · ` : ""}
                      {fmtDate(r.createdAt)} · {r.packageCode}
                    </div>
                  </div>
                  {status === "done" && <Badge tone={r.status === "approved" ? "green" : "red"}>{r.status === "approved" ? "Onaylandı" : "Reddedildi"}</Badge>}
                </div>
                {r.referenceNote && <p className="mt-2 text-sm text-gray-300">Referans: {r.referenceNote}</p>}
                {r.reviewNote && <p className="mt-1 text-sm text-gray-400">Not: {r.reviewNote}</p>}
                {status === "pending" && (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                      className={`${inputCls} flex-1`}
                      value={notes[r.id] ?? ""}
                      maxLength={500}
                      onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                      placeholder="İnceleme notu (isteğe bağlı)"
                    />
                    <button type="button" className={btnOk} disabled={busy} onClick={() => review(r, "approve")}>
                      Onayla
                    </button>
                    <button type="button" className={btnDangerOutline} disabled={busy} onClick={() => review(r, "reject")}>
                      Reddet
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
    </Card>
  );
}
