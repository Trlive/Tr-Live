"use client";

import { useState } from "react";
import { Banknote, RefreshCw } from "lucide-react";
import { api, fmtDate, fmtNumber } from "@/core/api/api";
import { useApi } from "@/core/api/use-api";
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, inputCls, tableCls, tableWrap, tdCls, thCls } from "@/shared/components/ui";
import { ActionMsg, Field, btnDangerOutline, btnGhost, btnOk, btnSmall, useAction } from "@/shared/components/kit";

type Order = {
  orderNo: string; kind: "dealer" | "user"; status: string; provider: string; packageCode: string; coins: string; bonusCoins: string; totalCoins: string;
  priceTry: string; currency: string; amount: string; expiresAt: string; paidAt: string | null; createdAt: string;
  id: string; providerRef: string | null; email: string | null; note: string | null; username: string | null; dealerName: string | null;
};
type Status = {
  publicBaseUrl: string | null;
  paytr: { configured: boolean; testMode: boolean; enabled: boolean; callbackUrl: string | null };
  usdt: { configured: boolean; address: string | null; enabled: boolean; rateKurus: number; apiKey: boolean };
  bank: { enabled: boolean; info: string };
  webTopup: { enabled: boolean; url: string };
  available: { id: string; name: string }[];
};
type Summary = { rows: { kind: string; provider: string; today: { count: number; try: string }; month: { count: number; try: string }; open: number }[]; unmatched: number };
type Tier = { name: string; minTry: string; bonusBps: number };
type Campaign = { id: string; title: string; appliesTo: string; bonusBps: number; minPriceTry: string; startsAt: string; endsAt: string; active: boolean; live: boolean };

const PROV: Record<string, string> = { paytr: "Kart", usdt_trc20: "USDT", bank: "Havale" };
const ST: Record<string, [string, "gold" | "green" | "red" | "gray"]> = {
  created: ["Bekliyor", "gold"], paid: ["Ödendi", "green"], failed: ["Başarısız", "red"], expired: ["Süresi doldu", "gray"], cancelled: ["İptal", "gray"],
};
const tl = (v: string | number) => `₺${Number(v).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}`;
const pct = (bps: number) => `%${(bps / 100).toLocaleString("tr-TR")}`;

export default function AdminPayments() {
  const [tab, setTab] = useState<"orders" | "unmatched" | "incentives" | "status">("orders");
  return (
    <div>
      <PageHeader icon={<Banknote size={18} />} kicker="Ekonomi" title="Ödemeler"
        description="Bayi stok siparişleri ve web yüklemeleri. Kart ve USDT ödemeleri doğrulanınca Coin otomatik yazılır; havale burada teyit edilir." />
      <div className="mb-4 flex flex-wrap gap-2">
        {([["orders", "Siparişler"], ["unmatched", "Eşleşmeyen ödemeler"], ["incentives", "Bayi teşvikleri"], ["status", "Kurulum durumu"]] as const).map(([k, l]) => (
          <button key={k} type="button" className={tab === k ? btnOk : btnGhost} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === "orders" && <Orders />}
      {tab === "unmatched" && <Unmatched />}
      {tab === "incentives" && <Incentives />}
      {tab === "status" && <SetupStatus />}
    </div>
  );
}

function SummaryCards() {
  const { data } = useApi<Summary>("/api/admin/payments/summary");
  if (!data || !data.rows.length) return null;
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {data.rows.map((r) => (
        <div key={`${r.kind}-${r.provider}`} className="rounded-xl border border-[#30291e] bg-[#17130c] p-3">
          <div className="text-xs text-gray-500">{r.kind === "dealer" ? "Bayi stoku" : "Web yükleme"} · {PROV[r.provider] ?? r.provider}</div>
          <div className="mt-1 text-lg font-bold text-white">{tl(r.month.try)} <span className="text-xs font-normal text-gray-500">bu ay ({r.month.count})</span></div>
          <div className="text-xs text-gray-400">Bugün {tl(r.today.try)} ({r.today.count}) · açık {r.open}</div>
        </div>
      ))}
    </div>
  );
}

function Orders() {
  const [status, setStatus] = useState("");
  const [provider, setProvider] = useState("");
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const params = new URLSearchParams({ ...(status && { status }), ...(provider && { provider }), ...(kind && { kind }), ...(query && { q: query }) });
  const { data, error, loading, reload } = useApi<{ orders: Order[] }>(`/api/admin/payments/orders?${params}`);
  return (
    <>
      <SummaryCards />
      <Card title="Siparişler" subtitle="Havale: dekontu kontrol edin, dekont / işlem numarasıyla teyit edin. Aynı dekont iki siparişe sayılmaz.">
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tüm durumlar</option>
            {Object.entries(ST).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select className={inputCls} value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="">Tüm yöntemler</option>
            {Object.entries(PROV).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">Bayi + web</option>
            <option value="dealer">Bayi stoku</option>
            <option value="user">Web yükleme</option>
          </select>
          <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && setQuery(q.trim())} placeholder="Sipariş no / kullanıcı / ID / bayi / işlem no" />
          <button type="button" className={btnSmall} onClick={() => setQuery(q.trim())}>Ara</button>
          <button type="button" className={`${btnGhost} inline-flex items-center gap-1`} onClick={reload}><RefreshCw size={14} /> Yenile</button>
        </div>
        {loading && !data && <Loading />}
        {error && <ErrorBox message={error} onRetry={reload} />}
        {data && (data.orders.length === 0 ? <Empty title="Sipariş yok." /> : (
          <div className={tableWrap}>
            <table className={tableCls}>
              <thead>
                <tr>
                  <th className={thCls}>Tarih</th><th className={thCls}>Sipariş</th><th className={thCls}>Kime</th><th className={thCls}>Coin</th>
                  <th className={thCls}>Tutar</th><th className={thCls}>Yöntem</th><th className={thCls}>Durum</th><th className={thCls}>İşlem</th>
                </tr>
              </thead>
              <tbody>{data.orders.map((o) => <OrderRow key={o.orderNo} o={o} onDone={reload} />)}</tbody>
            </table>
          </div>
        ))}
      </Card>
    </>
  );
}

function OrderRow({ o, onDone }: { o: Order; onDone: () => void }) {
  const { busy, msg, run } = useAction();
  const [label, tone] = ST[o.status] ?? [o.status, "gray"];
  const open = o.status === "created" || o.status === "expired";
  return (
    <tr>
      <td className={tdCls}>{fmtDate(o.createdAt)}</td>
      <td className={tdCls}><code className="text-xs">{o.orderNo}</code>{o.providerRef && <div className="max-w-[180px] truncate text-xs text-gray-500" title={o.providerRef}>{o.providerRef}</div>}</td>
      <td className={tdCls}>{o.kind === "dealer" ? <>🏪 {o.dealerName}</> : <>👤 {o.username}</>}</td>
      <td className={tdCls}>{fmtNumber(o.totalCoins)}{o.bonusCoins !== "0" && <div className="text-xs text-green-500">+{fmtNumber(o.bonusCoins)} ek</div>}</td>
      <td className={tdCls}>{o.currency === "USDT" ? `${o.amount} USDT` : tl(o.amount)}{o.currency === "USDT" && <div className="text-xs text-gray-500">{tl(o.priceTry)}</div>}</td>
      <td className={tdCls}>{PROV[o.provider] ?? o.provider}</td>
      <td className={tdCls}><Badge tone={tone}>{label}</Badge>{o.note && <div className="max-w-[160px] truncate text-xs text-gray-500" title={o.note}>{o.note}</div>}</td>
      <td className={tdCls}>
        <div className="flex flex-wrap gap-1">
          {open && o.provider !== "paytr" && (
            <button type="button" disabled={busy} className={btnOk} onClick={() => run("Ödeme teyit edildi, Coin yazıldı.", async () => {
              const ref = window.prompt(o.provider === "bank" ? "Dekont / işlem numarası:" : "Zincirdeki işlem özeti (txid):");
              if (!ref) return false;
              if (!window.confirm(`${o.orderNo}: ${fmtNumber(o.totalCoins)} Coin ${o.kind === "dealer" ? `"${o.dealerName}" stoğuna` : `@${o.username} hesabına`} yazılsın mı? Geri alınamaz.`)) return false;
              await api(`/api/admin/payments/orders/${o.orderNo}/confirm`, { method: "POST", body: { reference: ref.trim() } });
              onDone();
            })}>Teyit et</button>
          )}
          {o.status !== "paid" && o.status !== "cancelled" && (
            <button type="button" disabled={busy} className={btnDangerOutline} onClick={() => run("İptal edildi.", async () => {
              const note = window.prompt("İptal notu (isteğe bağlı):") ?? "";
              await api(`/api/admin/payments/orders/${o.orderNo}/cancel`, { method: "POST", body: { note } });
              onDone();
            })}>İptal</button>
          )}
        </div>
        <ActionMsg msg={msg} />
      </td>
    </tr>
  );
}

function Unmatched() {
  const { data, error, loading, reload } = useApi<{ events: { id: number; provider: string; kind: string; data: Record<string, string>; createdAt: string }[] }>("/api/admin/payments/unmatched");
  const KIND: Record<string, string> = { unmatched: "Sipariş bulunamadı", ambiguous: "Aynı tutarda birden çok sipariş", amount_mismatch: "Tutar uyuşmuyor" };
  return (
    <Card title="Eşleşmeyen ödemeler" subtitle="Cüzdana gelen ama hiçbir siparişe otomatik eşlenemeyen transferler. Müşteriyle konuşup doğru siparişi 'Teyit et' ile işlem özetini girerek kapatın.">
      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && (data.events.length === 0 ? <Empty title="Eşleşmeyen ödeme yok." /> : (
        <div className={tableWrap}>
          <table className={tableCls}>
            <thead><tr><th className={thCls}>Tarih</th><th className={thCls}>Tür</th><th className={thCls}>Tutar</th><th className={thCls}>İşlem / gönderen</th></tr></thead>
            <tbody>
              {data.events.map((e) => (
                <tr key={e.id}>
                  <td className={tdCls}>{fmtDate(e.createdAt)}</td>
                  <td className={tdCls}>{KIND[e.kind] ?? e.kind}</td>
                  <td className={tdCls}>{e.data.amount ?? (e.data.got ? `${e.data.got} (beklenen ${e.data.expected})` : "—")}</td>
                  <td className={tdCls}><code className="text-xs break-all">{e.data.txid ?? e.data.providerRef ?? "—"}</code>{e.data.from && <div className="text-xs text-gray-500">{e.data.from}</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </Card>
  );
}

function Incentives() {
  const { data, error, loading, reload } = useApi<{ tiers: Tier[]; campaigns: Campaign[] }>("/api/admin/payments/incentives");
  return (
    <div className="space-y-4">
      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && <TierEditor tiers={data.tiers} onDone={reload} />}
      {data && <Campaigns list={data.campaigns} onDone={reload} />}
    </div>
  );
}

function TierEditor({ tiers, onDone }: { tiers: Tier[]; onDone: () => void }) {
  const [rows, setRows] = useState(tiers.map((t) => ({ name: t.name, minTry: String(Number(t.minTry)), bonus: String(t.bonusBps / 100) })));
  const { busy, msg, run } = useAction();
  const set = (i: number, k: "name" | "minTry" | "bonus", v: string) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <Card title="Aylık hacim kademeleri" subtitle="Bayinin bu ay ödediği toptan bedel (siparişle birlikte) eşiği geçince stok alımına ek Coin. Üst kademenin oranı alttakinden düşük olamaz; en çok %30.">
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid items-end gap-2 md:grid-cols-4">
            <Field label="Ad"><input className={inputCls} value={r.name} maxLength={40} onChange={(e) => set(i, "name", e.target.value)} /></Field>
            <Field label="Aylık alım eşiği (₺)"><input className={inputCls} value={r.minTry} inputMode="decimal" onChange={(e) => set(i, "minTry", e.target.value.replace(/[^\d.]/g, ""))} /></Field>
            <Field label="Ek Coin (%)"><input className={inputCls} value={r.bonus} inputMode="decimal" onChange={(e) => set(i, "bonus", e.target.value.replace(/[^\d.]/g, ""))} /></Field>
            <button type="button" className={btnDangerOutline} onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>Kaldır</button>
          </div>
        ))}
        <div className="flex gap-2">
          <button type="button" className={btnGhost} onClick={() => setRows((x) => [...x, { name: "", minTry: "", bonus: "0" }])}>Kademe ekle</button>
          <button type="button" disabled={busy} className={btnSmall} onClick={() => run("Kademeler kaydedildi.", async () => {
            await api("/api/admin/payments/tiers", { method: "PUT", body: { tiers: rows.map((r) => ({ name: r.name, minTry: r.minTry || "0", bonusBps: Math.round(Number(r.bonus || 0) * 100) })) } });
            onDone();
          })}>Kaydet</button>
        </div>
        <ActionMsg msg={msg} />
      </div>
    </Card>
  );
}

function Campaigns({ list, onDone }: { list: Campaign[]; onDone: () => void }) {
  const now = new Date();
  const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60e3).toISOString().slice(0, 16);
  const [f, setF] = useState({ title: "", appliesTo: "dealer", bonus: "5", minPriceTry: "0", startsAt: iso(now), endsAt: iso(new Date(now.getTime() + 7 * 86400e3)) });
  const { busy, msg, run } = useAction();
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Card title="Kampanyalar" subtitle="Belirli tarihler arasında ek Coin. Bayi stok alımına, web yüklemesine ya da ikisine. Kademe ile toplanır (toplam en çok %60).">
      <div className="grid items-end gap-2 md:grid-cols-6">
        <Field label="Başlık"><input className={inputCls} value={f.title} maxLength={80} onChange={(e) => set("title", e.target.value)} placeholder="Hafta sonu %5" /></Field>
        <Field label="Kapsam">
          <select className={inputCls} value={f.appliesTo} onChange={(e) => set("appliesTo", e.target.value)}>
            <option value="dealer">Bayi stoku</option><option value="user">Web yükleme</option><option value="all">İkisi</option>
          </select>
        </Field>
        <Field label="Ek Coin (%)"><input className={inputCls} value={f.bonus} inputMode="decimal" onChange={(e) => set("bonus", e.target.value.replace(/[^\d.]/g, ""))} /></Field>
        <Field label="En az tutar (₺)"><input className={inputCls} value={f.minPriceTry} inputMode="decimal" onChange={(e) => set("minPriceTry", e.target.value.replace(/[^\d.]/g, ""))} /></Field>
        <Field label="Başlangıç"><input type="datetime-local" className={inputCls} value={f.startsAt} onChange={(e) => set("startsAt", e.target.value)} /></Field>
        <Field label="Bitiş"><input type="datetime-local" className={inputCls} value={f.endsAt} onChange={(e) => set("endsAt", e.target.value)} /></Field>
      </div>
      <div className="mt-2">
        <button type="button" disabled={busy || !f.title} className={btnSmall} onClick={() => run("Kampanya eklendi.", async () => {
          await api("/api/admin/payments/campaigns", { method: "POST", body: {
            title: f.title, appliesTo: f.appliesTo, bonusBps: Math.round(Number(f.bonus) * 100), minPriceTry: f.minPriceTry || "0",
            startsAt: new Date(f.startsAt).toISOString(), endsAt: new Date(f.endsAt).toISOString(),
          } });
          set("title", "");
          onDone();
        })}>Kampanya ekle</button>
        <ActionMsg msg={msg} />
      </div>
      {list.length > 0 && (
        <div className={`${tableWrap} mt-4`}>
          <table className={tableCls}>
            <thead><tr><th className={thCls}>Başlık</th><th className={thCls}>Kapsam</th><th className={thCls}>Ek</th><th className={thCls}>Tarih</th><th className={thCls}>Durum</th><th className={thCls} /></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td className={tdCls}>{c.title}</td>
                  <td className={tdCls}>{{ dealer: "Bayi", user: "Web", all: "İkisi" }[c.appliesTo] ?? c.appliesTo}</td>
                  <td className={tdCls}>{pct(c.bonusBps)}{Number(c.minPriceTry) > 0 && <div className="text-xs text-gray-500">≥ {tl(c.minPriceTry)}</div>}</td>
                  <td className={tdCls}>{fmtDate(c.startsAt)} → {fmtDate(c.endsAt)}</td>
                  <td className={tdCls}>{c.live ? <Badge tone="green">Yayında</Badge> : c.active ? <Badge tone="gold">Bekliyor / bitti</Badge> : <Badge tone="gray">Kapalı</Badge>}</td>
                  <td className={tdCls}>
                    {c.active && <button type="button" className={btnDangerOutline} onClick={() => run("Kampanya kapatıldı.", async () => { await api(`/api/admin/payments/campaigns/${c.id}`, { method: "DELETE" }); onDone(); })}>Kapat</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function SetupStatus() {
  const { data, error, loading, reload } = useApi<Status>("/api/admin/payments/status");
  const ok = (v: boolean) => (v ? <Badge tone="green">Hazır</Badge> : <Badge tone="red">Eksik</Badge>);
  return (
    <Card title="Kurulum durumu" subtitle="Gizli anahtarlar sunucunun .env dosyasındadır; açma/kapama Ayarlar → Coin satış kanalları.">
      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && (
        <div className="space-y-4 text-sm text-gray-300">
          <div><b className="text-white">Sunucu adresi (PUBLIC_BASE_URL):</b> {data.publicBaseUrl ?? <span className="text-red-400">tanımlı değil — kart ödemesi çalışmaz</span>}</div>
          <div>
            <b className="text-white">Kart (PayTR)</b> {ok(data.paytr.configured)} {data.paytr.enabled ? <Badge tone="green">Açık</Badge> : <Badge tone="gray">Kapalı</Badge>} {data.paytr.testMode && <Badge tone="gold">Test modu</Badge>}
            <div className="mt-1 text-xs text-gray-500">PayTR Mağaza Paneli → Ayarlar → Bildirim URL: <code>{data.paytr.callbackUrl ?? "(önce PUBLIC_BASE_URL)"}</code></div>
          </div>
          <div>
            <b className="text-white">USDT (TRC20)</b> {ok(data.usdt.configured)} {data.usdt.enabled ? <Badge tone="green">Açık</Badge> : <Badge tone="gray">Kapalı</Badge>}
            <div className="mt-1 text-xs text-gray-500">Cüzdan: <code>{data.usdt.address ?? "USDT_TRC20_ADDRESS yok"}</code> · kur {(data.usdt.rateKurus / 100).toLocaleString("tr-TR")} ₺ · TronGrid anahtarı {data.usdt.apiKey ? "var" : "yok (düşük hız sınırı)"}</div>
          </div>
          <div><b className="text-white">Havale / EFT</b> {data.bank.enabled ? <Badge tone="green">Açık</Badge> : <Badge tone="gray">Kapalı</Badge>} {!data.bank.info && <span className="text-xs text-red-400">havale bilgisi boş</span>}</div>
          <div><b className="text-white">Web yükleme sayfası</b> {data.webTopup.enabled ? <Badge tone="green">Açık</Badge> : <Badge tone="gray">Kapalı</Badge>} <a className="text-[#d7b56d] underline" href={data.webTopup.url} target="_blank" rel="noreferrer">{data.webTopup.url}</a></div>
          <div><b className="text-white">Bayinin göreceği yöntemler:</b> {data.available.length ? data.available.map((a) => a.name).join(", ") : "yok — bayi eski usul (bağlantı + talep) akışını görür"}</div>
        </div>
      )}
    </Card>
  );
}
