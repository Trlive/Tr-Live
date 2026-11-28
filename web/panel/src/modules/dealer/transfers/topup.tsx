"use client";

import { useEffect, useState } from "react";
import { Copy, Wallet } from "lucide-react";
import { api, fmtDate, fmtNumber } from "@/core/api/api";
import { useApi } from "@/core/api/use-api";
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, inputCls, tableCls, tableWrap, tdCls, thCls } from "@/shared/components/ui";
import { ActionMsg, newKey, useAction } from "@/shared/components/kit";

type Pkg = { code: string; coins: string; label: string; priceTry: number; listTry: number; discountPct: number };
type Req = { id: string; requestedCoins: string; packageCode: string; referenceNote?: string | null; status: string; reviewNote?: string | null; reviewedAt?: string | null; createdAt: string };

const statusText: Record<string, [string, "gold" | "green" | "red" | "gray"]> = {
  pending: ["Bekliyor", "gold"],
  approved: ["Onaylandı", "green"],
  rejected: ["Reddedildi", "red"],
};
const tl = (n: number) => `${n.toLocaleString("tr-TR")} ₺`;

function LegacyTopup() {
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

// ---------------------------------------------------------------- v2.153: otomatik ödemeli stok alımı
type ShopPkg = { code: string; label: string; coins: string; priceTry: number; bonusCoins: string; totalCoins: string; coinsPerTry: number | null;
  bonus: { package: string; tier: string; tierBps: number; tierName: string | null; campaign: string; campaignBps: number; campaignTitle: string | null } };
type Shop = {
  dealer: { name: string; coinBalance: string };
  packages: ShopPkg[];
  providers: { id: string; name: string; auto: boolean }[];
  month: { paidTry: string; tier: { name: string; bonusBps: number } | null; next: { name: string; bonusBps: number; remainingTry: string } | null };
  tiers: { name: string; minTry: string; bonusBps: number }[];
  campaign: { title: string; bonusBps: number; endsAt: string } | null;
};
type Pay = { type: "redirect"; url: string } | { type: "crypto"; network: string; address: string; amount: string; warning: string } | { type: "bank"; info: string; amount: string; reference: string; warning: string };
type DOrder = { orderNo: string; status: string; provider: string; totalCoins: string; bonusCoins: string; priceTry: string; currency: string; amount: string; pay: Pay | null; expiresAt: string; createdAt: string; paidAt: string | null };

const OST: Record<string, [string, "gold" | "green" | "red" | "gray"]> = {
  created: ["Ödeme bekleniyor", "gold"], paid: ["Ödendi · stoğa eklendi", "green"], failed: ["Başarısız", "red"], expired: ["Süresi doldu", "gray"], cancelled: ["İptal", "gray"],
};
const pct = (bps: number) => `%${(bps / 100).toLocaleString("tr-TR")}`;

export default function DealerTopup() {
  const shop = useApi<Shop>("/api/dealer/shop");
  if (shop.loading && !shop.data) return <Loading />;
  // Otomatik yöntem tanımlı değilse (ya da eski sunucu) eski usul talep sayfası.
  if (shop.error || !shop.data || shop.data.providers.length === 0) return <LegacyTopup />;
  return <AutoTopup shop={shop.data} reload={shop.reload} />;
}

function AutoTopup({ shop, reload }: { shop: Shop; reload: () => void }) {
  const orders = useApi<{ orders: DOrder[] }>("/api/dealer/orders");
  const [pick, setPick] = useState("");
  const [prov, setProv] = useState(shop.providers[0]?.id ?? "");
  const [active, setActive] = useState<DOrder | null>(null);
  const { busy, msg, run } = useAction();
  const pkg = shop.packages.find((p) => p.code === pick);

  // Açık siparişi 5 sn'de bir yokla; ödenince stok ve liste yenilenir.
  useEffect(() => {
    if (!active || active.status !== "created") return;
    const t = setInterval(async () => {
      try {
        const r = await api<{ order: DOrder }>(`/api/dealer/orders/${active.orderNo}`);
        if (r.order.status !== active.status) { setActive(r.order); reload(); orders.reload(); }
      } catch { /* sonraki tur */ }
    }, 5000);
    return () => clearInterval(t);
  }, [active, reload, orders]);

  function buy() {
    if (!pkg || !prov) return;
    run("Sipariş oluşturuldu.", async () => {
      const r = await api<{ order: DOrder }>("/api/dealer/orders", { method: "POST", body: { packageCode: pkg.code, provider: prov } });
      setActive(r.order);
      if (r.order.pay?.type === "redirect") window.open(r.order.pay.url, "_blank", "noopener");
      orders.reload();
    });
  }

  return (
    <div>
      <PageHeader icon={<Wallet size={18} />} kicker="Bayi" title="Stok Satın Al"
        description={`Stok: ${fmtNumber(shop.dealer.coinBalance)} Coin. Ödeme doğrulanınca stoğunuza otomatik eklenir (havale: dekont teyidinden sonra).`} />
      <div className="space-y-6">
        <Card title="Bu ay" subtitle="Aylık alım tutarınız arttıkça her stok alımında ek Coin oranı yükselir.">
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-300">
            <span>Alım: <b className="text-white">{tl(Number(shop.month.paidTry))}</b></span>
            {shop.month.tier && <Badge tone="gold">{shop.month.tier.name} · +{pct(shop.month.tier.bonusBps)}</Badge>}
            {shop.month.next && <span className="text-gray-500">{shop.month.next.name} (+{pct(shop.month.next.bonusBps)}) için {tl(Number(shop.month.next.remainingTry))} kaldı</span>}
            {shop.campaign && <Badge tone="green">🎁 {shop.campaign.title} · +{pct(shop.campaign.bonusBps)} · {fmtDate(shop.campaign.endsAt)}’e kadar</Badge>}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
            {shop.tiers.map((t) => <span key={t.name}>{t.name}: ≥ {tl(Number(t.minTry))} → +{pct(t.bonusBps)}</span>)}
          </div>
        </Card>

        <Card title="Paket" subtitle="Ek Coin: paket bonusu + kademe + kampanya. Siparişte sabitlenir.">
          <div className="mb-4 flex flex-wrap gap-2">
            {shop.providers.map((p) => (
              <button key={p.id} type="button" onClick={() => setProv(p.id)}
                className={`rounded-full border px-4 py-2 text-sm ${prov === p.id ? "border-[#d7b56d] text-[#d7b56d]" : "border-[#30291e] text-gray-300"}`}>
                {p.name}{p.auto && <span className="ml-2 text-xs text-green-500">anında</span>}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shop.packages.map((p) => (
              <button key={p.code} type="button" onClick={() => setPick(p.code)}
                className={`rounded-xl border p-4 text-left transition ${pick === p.code ? "border-[#d7b56d] bg-[#292114]" : "border-[#30291e] hover:border-[#8c713d]"}`}>
                <div className="text-lg font-bold text-white">{fmtNumber(p.coins)} Coin</div>
                {p.bonusCoins !== "0" && <div className="text-sm text-green-500">+{fmtNumber(p.bonusCoins)} ek → {fmtNumber(p.totalCoins)}</div>}
                <div className="mt-1 text-sm text-[#d7b56d]">{tl(p.priceTry)}</div>
                {p.coinsPerTry && <div className="text-xs text-gray-500">1 ₺ = {fmtNumber(String(p.coinsPerTry))} Coin</div>}
              </button>
            ))}
          </div>
          <div className="mt-4">
            <ActionMsg msg={msg} />
            <button type="button" onClick={buy} disabled={busy || !pkg} className="gold-button disabled:opacity-60">
              {busy ? "Oluşturuluyor..." : pkg ? `${tl(pkg.priceTry)} öde` : "Paket seçin"}
            </button>
          </div>
        </Card>

        {active && <OrderBox o={active} />}

        <Card title="Siparişlerim">
          {!orders.data ? <Loading /> : orders.data.orders.length === 0 ? <Empty title="Henüz sipariş yok." /> : (
            <div className={tableWrap}>
              <table className={tableCls}>
                <thead><tr><th className={thCls}>Tarih</th><th className={thCls}>Sipariş</th><th className={thCls}>Coin</th><th className={thCls}>Tutar</th><th className={thCls}>Durum</th></tr></thead>
                <tbody>
                  {orders.data.orders.map((o) => {
                    const [label, tone] = OST[o.status] ?? [o.status, "gray"];
                    return (
                      <tr key={o.orderNo} className={o.status === "created" ? "cursor-pointer" : ""} onClick={() => o.status === "created" && setActive(o)}>
                        <td className={tdCls}>{fmtDate(o.createdAt)}</td>
                        <td className={tdCls}><code className="text-xs">{o.orderNo}</code></td>
                        <td className={tdCls}>{fmtNumber(o.totalCoins)}</td>
                        <td className={tdCls}>{o.currency === "USDT" ? `${o.amount} USDT` : tl(Number(o.amount))}</td>
                        <td className={tdCls}><Badge tone={tone}>{label}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function CopyLine({ k, v }: { k: string; v: string }) {
  return (
    <div className="mt-2">
      <div className="text-xs text-gray-500">{k}</div>
      <div className="flex items-center gap-2 break-all text-white">
        <span className="whitespace-pre-wrap">{v}</span>
        <button type="button" className="text-[#d7b56d]" onClick={() => navigator.clipboard?.writeText(v)} title="Kopyala"><Copy size={14} /></button>
      </div>
    </div>
  );
}

function OrderBox({ o }: { o: DOrder }) {
  const [label, tone] = OST[o.status] ?? [o.status, "gray"];
  const p = o.pay;
  return (
    <Card title={`Sipariş ${o.orderNo}`} subtitle="Bu kutu ödeme doğrulanınca kendiliğinden güncellenir.">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Badge tone={tone}>{label}</Badge>
        <span className="text-white">{fmtNumber(o.totalCoins)} Coin</span>
        <span className="text-gray-400">{o.currency === "USDT" ? `${o.amount} USDT` : tl(Number(o.amount))}</span>
      </div>
      {o.status === "created" && p?.type === "redirect" && (
        <a className="gold-button mt-3 inline-block" href={p.url} target="_blank" rel="noreferrer">Ödeme sayfasını aç</a>
      )}
      {o.status === "created" && p?.type === "crypto" && (
        <div>
          <CopyLine k="Ağ" v={p.network} /><CopyLine k="Adres" v={p.address} /><CopyLine k="Gönderilecek tutar (USDT)" v={p.amount} />
          <p className="mt-2 text-xs text-amber-400">{p.warning}</p>
        </div>
      )}
      {o.status === "created" && p?.type === "bank" && (
        <div>
          <CopyLine k="Havale bilgisi" v={p.info} /><CopyLine k="Tutar (₺)" v={p.amount} /><CopyLine k="Açıklama" v={p.reference} />
          <p className="mt-2 text-xs text-amber-400">{p.warning}</p>
        </div>
      )}
    </Card>
  );
}
