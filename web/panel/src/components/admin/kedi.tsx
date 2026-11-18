"use client";

import { useEffect, useState } from "react";
import { PartyPopper } from "lucide-react";
import { api, fmtNumber } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { Card, ErrorBox, Loading, PageHeader, StatCard, inputCls } from "@/components/ui";
import { ActionMsg, Field, btnSmall, useAction } from "./kit";

type Overview = {
  online: number; round: number; phase: string; pool: number;
  ledger: { bet: number; win: number; rounds: number; profit: number; rtp: number | null };
  control: { rounds: number; bet: number; pay: number; profit: number; houseShare: number | null; targetHouseShare: number; enabled: boolean };
  settings: { winControl: { enabled: boolean; houseShare: number }; maxItemsPerRound: number; bettingEnabled: boolean; maxBetPerRound: number; maxRoundPayout: number };
  unpaid: unknown[];
  players: { id: string; name: string; bet: number; win: number; net: number; online: boolean }[];
};

const pct = (v: number | null | undefined) => (v == null ? "—" : `%${(v * 100).toFixed(1)}`);

/** Kedi Çarkı: kasa payı, kol sınırı, bahis limitleri ve canlı özet. Oyun sunucuda çalışır; Coin'imizle oynanır. */
export default function AdminKedi() {
  const { data, error, loading, reload } = useApi<Overview>("/api/admin/kedi");
  const { busy, msg, run } = useAction();
  const [f, setF] = useState({ house: "80", ctl: true, arms: "7", open: true, maxBet: "0", maxPay: "0" });

  useEffect(() => {
    if (!data) return;
    const s = data.settings;
    setF({
      house: String(Math.round(s.winControl.houseShare * 1000) / 10), ctl: s.winControl.enabled, arms: String(s.maxItemsPerRound),
      open: s.bettingEnabled, maxBet: String(s.maxBetPerRound ?? 0), maxPay: String(s.maxRoundPayout ?? 0),
    });
  }, [data]);

  // Canlı özet 10 sn'de bir yenilenir.
  useEffect(() => {
    const t = setInterval(reload, 10000);
    return () => clearInterval(t);
  }, [reload]);

  const save = () =>
    run("Kaydedildi.", async () => {
      await api("/api/admin/kedi/settings", {
        method: "PUT",
        body: {
          winControl: { enabled: f.ctl, houseShare: (Number(f.house) || 0) / 100 },
          maxItemsPerRound: Number(f.arms) || 7, bettingEnabled: f.open,
          maxBetPerRound: Number(f.maxBet) || 0, maxRoundPayout: Number(f.maxPay) || 0,
        },
      });
      reload();
    });

  return (
    <div>
      <PageHeader icon={<PartyPopper size={18} />} kicker="Sistem" title="Kedi Çarkı" description="Oyun sunucuda çalışır, Coin'inizle oynanır. Etkinliğe izni olanlar görür (Oda Etkinlikleri → İzinli kişiler)." />
      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Çevrimiçi" value={fmtNumber(data.online)} note={`Tur ${data.round} · ${data.phase}`} />
            <StatCard label="Kasa kârı" value={fmtNumber(data.ledger.profit)} tone={data.ledger.profit >= 0 ? "green" : "red"} note={`${fmtNumber(data.ledger.rounds)} tur`} />
            <StatCard label="Gerçekleşen kasa payı" value={pct(data.control.houseShare)} note={`Hedef ${pct(data.control.targetHouseShare)}`} tone="blue" />
            <StatCard label="Ödül havuzu" value={fmtNumber(data.pool)} note={data.unpaid.length ? `${data.unpaid.length} ödenmemiş kazanç var` : "Ödenmemiş yok"} tone={data.unpaid.length ? "red" : "gold"} />
          </div>

          <Card title="Ayarlar" subtitle="Değişiklik anında geçerli olur.">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Kasa payı (%)" hint="Oyuncuların toplam bahsinin bu kadarı kasada kalır; geri kalanı kazanç olarak döner.">
                <input className={inputCls} inputMode="decimal" value={f.house} onChange={(e) => setF({ ...f, house: e.target.value })} />
              </Field>
              <Field label="Bir turda en fazla kaç farklı kola bahis (1-8)">
                <input className={inputCls} inputMode="numeric" value={f.arms} onChange={(e) => setF({ ...f, arms: e.target.value })} />
              </Field>
              <Field label="Tur başına bahis sınırı (Coin, 0 = sınırsız)">
                <input className={inputCls} inputMode="numeric" value={f.maxBet} onChange={(e) => setF({ ...f, maxBet: e.target.value })} />
              </Field>
              <Field label="Tur başına en çok ödeme (Coin, 0 = sınırsız)">
                <input className={inputCls} inputMode="numeric" value={f.maxPay} onChange={(e) => setF({ ...f, maxPay: e.target.value })} />
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap gap-5 text-sm text-gray-300">
              <label className="flex items-center gap-2"><input type="checkbox" checked={f.ctl} onChange={(e) => setF({ ...f, ctl: e.target.checked })} /> Kasa payı kontrolü açık</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={f.open} onChange={(e) => setF({ ...f, open: e.target.checked })} /> Bahis açık</label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" disabled={busy} className={btnSmall} onClick={save}>Kaydet</button>
              <button type="button" disabled={busy} className={btnSmall} onClick={() => run("Sayaçlar sıfırlandı.", async () => { await api("/api/admin/kedi/reset-control", { method: "POST" }); reload(); })}>Kasa sayaçlarını sıfırla</button>
              <button type="button" disabled={busy} className={btnSmall} onClick={() => run("Yeniden denendi.", async () => { await api("/api/admin/kedi/retry-unpaid", { method: "POST" }); reload(); })}>Ödenmemiş kazançları yeniden dene</button>
            </div>
            <ActionMsg msg={msg} />
          </Card>

          <Card title="Bugünün oyuncuları" subtitle="Bahse göre ilk 20.">
            {data.players.length === 0 ? (
              <p className="text-sm text-gray-500">Henüz oynayan yok.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-300">
                  <thead className="text-xs text-gray-500"><tr><th className="py-1 pr-3">Oyuncu</th><th className="pr-3">Bahis</th><th className="pr-3">Kazanç</th><th>Net</th></tr></thead>
                  <tbody>
                    {data.players.slice(0, 20).map((p) => (
                      <tr key={p.id} className="border-t border-[#30291e]">
                        <td className="py-1 pr-3">{p.online ? "🟢 " : ""}{p.name}</td>
                        <td className="pr-3">{fmtNumber(p.bet)}</td>
                        <td className="pr-3">{fmtNumber(p.win)}</td>
                        <td className={p.net >= 0 ? "text-[#53bd86]" : "text-[#e35d5d]"}>{fmtNumber(p.net)}</td>
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
