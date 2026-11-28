"use client";

import { Incentives } from "@/modules/admin/payments/payments";
import { useState } from "react";
import { CreditCard, Plus, Trash2 } from "lucide-react";
import { api, fmtNumber } from "@/core/api/api";
import { useApi } from "@/core/api/use-api";
import { Badge, Card, ErrorBox, Loading, PageHeader, inputCls } from "@/shared/components/ui";
import { ActionMsg, Field, btnDangerOutline, btnSmall, useAction } from "@/shared/components/kit";

type Pkg = { code: string; coins: string; priceTry: number; listTry: number; label: string; active: boolean; sortOrder: number; bonusCoins?: string };
type Method = { id: string; name: string; icon: string; badge: string; ready: boolean; urlTemplate: string; active: boolean; sortOrder: number };

const TPL = "{price} {coins} {code} {ref} {dealer}";

/**
 * Bayi mağazası (v2.124): bayilerin uygulamada "Stok yükle" ile gördüğü toptan paketler ve ödeme yöntemleri.
 * Ödeme yöntemine bağlantı yapıştırılır; bayi paket seçince bağlantı doldurulup açılır, talep "Bayiler > Talepler"e düşer.
 */
export default function AdminDealerShop() {
  const { data, error, loading, reload } = useApi<{ packages: Pkg[]; methods: Method[] }>("/api/admin/dealer-shop");
  const add = useAction();
  return (
    <div>
      <PageHeader icon={<CreditCard size={18} />} kicker="Para" title="Bayi Mağazası" description="Bayilere satılan toptan Coin paketleri, teşvikler (aylık kademe, kampanya) ve eski usul ödeme bağlantıları." />
      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && (
        <div className="space-y-4">
          <Card title="Toptan paketler" subtitle="Bayinin göreceği Coin miktarı ve TL fiyatı.">
            <div className="space-y-3">
              {data.packages.map((p) => <PkgRow key={p.code} p={p} onDone={reload} />)}
              <PkgRow p={{ code: "", coins: "", priceTry: 0, listTry: 0, label: "", active: true, sortOrder: 100, bonusCoins: "" }} onDone={reload} isNew />
            </div>
          </Card>
          <Incentives />
          <Card title="Ödeme bağlantıları (eski usul)" subtitle={`Otomatik ödeme (Kart / USDT / Havale) açıksa bayi onu görür; bu bağlantılar yalnızca otomatik yöntem kapalıyken kullanılır. Yer tutucular: ${TPL}.`}>
            <div className="space-y-3">
              {data.methods.map((m) => <MethodRow key={m.id} m={m} onDone={reload} />)}
              <button
                type="button"
                disabled={add.busy}
                className={`${btnSmall} inline-flex items-center gap-2`}
                onClick={() => add.run("Yöntem eklendi.", async () => { await api("/api/admin/dealer-shop/methods", { method: "POST", body: { name: "Kart ile öde", icon: "💳" } }); reload(); })}
              >
                <Plus size={14} /> Ödeme yöntemi ekle
              </button>
              <ActionMsg msg={add.msg} />
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function MethodRow({ m, onDone }: { m: Method; onDone: () => void }) {
  const [f, setF] = useState({ name: m.name, icon: m.icon, urlTemplate: m.urlTemplate, badge: m.badge, active: m.active, sortOrder: String(m.sortOrder) });
  const { busy, msg, run } = useAction();
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));
  return (
    <div className="rounded-xl border border-[#383024] p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xl">{/^https:|^\//.test(f.icon) ? "🖼️" : f.icon}</span>
        <b className="text-white">{m.name}</b>
        {m.ready ? <Badge tone="green">Bağlantı var</Badge> : <Badge tone="gold">Bağlantı yok</Badge>}
        {!m.active && <Badge tone="red">Kapalı</Badge>}
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <Field label="Ödeme bağlantısı"><input className={inputCls} value={f.urlTemplate} onChange={(e) => set("urlTemplate", e.target.value)} placeholder="https://odeme.ornek.com/pay?tutar={price}&not={ref}" /></Field>
        <Field label="Ad"><input className={inputCls} value={f.name} maxLength={60} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Simge" hint="Emoji ya da görsel adresi"><input className={inputCls} value={f.icon} onChange={(e) => set("icon", e.target.value)} /></Field>
        <Field label="Etiket" hint="ör. Çok kullanılan"><input className={inputCls} value={f.badge} maxLength={30} onChange={(e) => set("badge", e.target.value)} /></Field>
        <Field label="Sıra"><input className={inputCls} value={f.sortOrder} onChange={(e) => set("sortOrder", e.target.value.replace(/[^\d-]/g, ""))} /></Field>
        <Field label="Durum"><label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} /> Açık</label></Field>
      </div>
      <div className="mt-2 flex gap-2">
        <button type="button" disabled={busy} className={btnSmall} onClick={() => run("Kaydedildi.", async () => { await api(`/api/admin/dealer-shop/methods/${m.id}`, { method: "PATCH", body: { ...f, sortOrder: Number(f.sortOrder) || 0 } }); onDone(); })}>Kaydet</button>
        <button type="button" disabled={busy} className={`${btnDangerOutline} inline-flex items-center gap-1`} onClick={() => run("Silindi.", async () => { if (!window.confirm(`"${m.name}" silinsin mi?`)) return false; await api(`/api/admin/dealer-shop/methods/${m.id}`, { method: "DELETE" }); onDone(); })}><Trash2 size={14} /> Sil</button>
      </div>
      <div className="mt-2"><ActionMsg msg={msg} /></div>
    </div>
  );
}

function PkgRow({ p, onDone, isNew = false }: { p: Pkg; onDone: () => void; isNew?: boolean }) {
  const [f, setF] = useState({ code: p.code, coins: p.coins, priceTry: String(p.priceTry || ""), label: p.label, active: p.active, sortOrder: String(p.sortOrder), bonusCoins: p.bonusCoins && p.bonusCoins !== "0" ? p.bonusCoins : "" });
  const { busy, msg, run } = useAction();
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  return (
    <div className="rounded-xl border border-[#383024] p-3">
      {!isNew && <div className="mb-2 text-sm text-gray-400"><b className="text-[#d7b56d]">{fmtNumber(p.coins)} Coin</b>{p.bonusCoins && p.bonusCoins !== "0" ? ` + ${fmtNumber(p.bonusCoins)} ek` : ""} · ₺{fmtNumber(String(Math.round(p.priceTry)))} {!p.active && <Badge tone="red">Kapalı</Badge>}</div>}
      <div className="grid gap-2 md:grid-cols-7">
        <Field label="Kod"><input className={inputCls} value={f.code} disabled={!isNew} onChange={(e) => set("code", e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))} placeholder="Y_480K" /></Field>
        <Field label="Coin"><input className={inputCls} value={f.coins} inputMode="numeric" onChange={(e) => set("coins", e.target.value.replace(/\D/g, ""))} /></Field>
        <Field label="Fiyat (TL)"><input className={inputCls} value={f.priceTry} inputMode="decimal" onChange={(e) => set("priceTry", e.target.value.replace(/[^\d.]/g, ""))} /></Field>
        <Field label="Ek Coin" hint="Paket bonusu (en çok paketin yarısı)"><input className={inputCls} value={f.bonusCoins} inputMode="numeric" onChange={(e) => set("bonusCoins", e.target.value.replace(/\D/g, ""))} placeholder="0" /></Field>
        <Field label="Ad"><input className={inputCls} value={f.label} maxLength={80} onChange={(e) => set("label", e.target.value)} /></Field>
        <Field label="Sıra"><input className={inputCls} value={f.sortOrder} onChange={(e) => set("sortOrder", e.target.value.replace(/[^\d-]/g, ""))} /></Field>
        <Field label="Durum"><label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} /> Açık</label></Field>
      </div>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={busy || !f.code || !f.coins}
          className={btnSmall}
          onClick={() => run(isNew ? "Paket eklendi." : "Kaydedildi.", async () => {
            await api(`/api/admin/dealer-shop/packages/${encodeURIComponent(f.code)}`, { method: "PUT", body: { coins: f.coins, priceTry: Number(f.priceTry) || 0, label: f.label, active: f.active, sortOrder: Number(f.sortOrder) || 0, bonusCoins: f.bonusCoins || "0" } });
            onDone();
          })}
        >
          {isNew ? "Paket ekle" : "Kaydet"}
        </button>
        {!isNew && (
          <button type="button" disabled={busy} className={`${btnDangerOutline} inline-flex items-center gap-1`} onClick={() => run("Silindi.", async () => { if (!window.confirm(`${p.code} silinsin mi?`)) return false; await api(`/api/admin/dealer-shop/packages/${encodeURIComponent(p.code)}`, { method: "DELETE" }); onDone(); })}><Trash2 size={14} /> Sil</button>
        )}
      </div>
      <div className="mt-2"><ActionMsg msg={msg} /></div>
    </div>
  );
}
