"use client";

import { useEffect, useState } from "react";
import { PartyPopper } from "lucide-react";
import { api, fmtNumber } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { Card, ErrorBox, Loading, PageHeader, StatCard, inputCls } from "@/components/ui";
import { ActionMsg, Field, btnSmall, useAction } from "./kit";

type Overview = {
  settings: { enabled: boolean; mode: "auto" | "pure"; rtp: number; hit: number; maxWinX: number; freeChance: number; jpChance: number; payFactor: number; contribPct: number; jpFloor: number; maxBetIdx: number; gambleOn: boolean; gambleMax: number; gambleWinPct: number };
  theoreticalRtp: number;
  pool: number;
  total: { wag: number; paid: number; jpPaid: number; spins: number; profit: number; rtp: number | null };
  day: { spins: number; wag: number; paid: number; players: number };
};

const BET_STEPS = ["200", "500", "1.000", "2.500", "5.000", "25.000", "50.000", "250.000", "400.000", "500.000"];

/** Wild King slotu: sunucuda saf rastgele çalışır. Burada yalnızca ödeme çarpanı, havuz ve limitler ayarlanır. */
export default function AdminWildKing() {
  const { data, error, loading, reload } = useApi<Overview>("/api/admin/wildking");
  const { busy, msg, run } = useAction();
  const [f, setF] = useState({ enabled: true, mode: "auto", rtp: "92", hit: "30", maxWin: "500", freeCh: "0.4", jpCh: "0.01", pay: "100", contrib: "1", floor: "0", maxBet: "9", gOn: true, gMax: "5", gWin: "50" });

  useEffect(() => {
    if (!data) return;
    const s = data.settings;
    setF({ enabled: s.enabled, mode: s.mode, rtp: String(s.rtp), hit: String(s.hit), maxWin: String(s.maxWinX), freeCh: String(s.freeChance), jpCh: String(s.jpChance), pay: String(Math.round(s.payFactor * 1000) / 10), contrib: String(s.contribPct), floor: String(s.jpFloor), maxBet: String(s.maxBetIdx), gOn: s.gambleOn, gMax: String(s.gambleMax), gWin: String(s.gambleWinPct) });
  }, [data]);

  useEffect(() => {
    const t = setInterval(reload, 15000);
    return () => clearInterval(t);
  }, [reload]);

  const save = () =>
    run("Kaydedildi.", async () => {
      await api("/api/admin/wildking/settings", {
        method: "PUT",
        body: { enabled: f.enabled, mode: f.mode, rtp: Number(f.rtp) || 0, hit: Number(f.hit) || 0, maxWinX: Number(f.maxWin) || 0, freeChance: Number(f.freeCh) || 0, jpChance: Number(f.jpCh) || 0, payFactor: (Number(f.pay) || 0) / 100, contribPct: Number(f.contrib) || 0, jpFloor: Number(f.floor) || 0, maxBetIdx: Number(f.maxBet) || 0, gambleOn: f.gOn, gambleMax: Number(f.gMax) || 1, gambleWinPct: Number(f.gWin) || 0 },
      });
      reload();
    });

  const pct = (v: number | null) => (v == null ? "—" : `%${(v * 100).toFixed(1)}`);

  return (
    <div>
      <PageHeader icon={<PartyPopper size={18} />} kicker="Sistem" title="Wild King" description="Slot sunucuda çalışır; sonuç, bakiye ve bonuslar sunucuda hesaplanır. Etkinlik izni olanlar oynar." />
      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Kasa kârı (toplam)" value={fmtNumber(data.total.profit)} tone={data.total.profit >= 0 ? "green" : "red"} note={`${fmtNumber(data.total.spins)} spin`} />
            <StatCard label="Gerçekleşen geri ödeme" value={pct(data.total.rtp)} note={`Teorik ≈ %${data.theoreticalRtp}`} tone="blue" />
            <StatCard label="Jackpot havuzu" value={fmtNumber(data.pool)} note={`Ödenen: ${fmtNumber(data.total.jpPaid)}`} />
            <StatCard label="Son 24 saat" value={fmtNumber(data.day.wag - data.day.paid)} note={`${data.day.players} oyuncu · ${fmtNumber(data.day.spins)} spin`} />
          </div>

          <Card title="Ayarlar" subtitle="Değişiklik 10 saniye içinde geçerli olur.">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Kazanç kontrolü" hint="Otomatik: hedef RTP ve isabet oranına göre. Saf rastgele: şeritler ve ödeme tablosu, ayar yok.">
                <select className={inputCls} value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value as "auto" | "pure" })}>
                  <option value="auto">Otomatik (hedef RTP)</option>
                  <option value="pure">Saf rastgele</option>
                </select>
              </Field>
              <Field label="Hedef RTP (%)" hint="Otomatik modda uzun vadede geri ödenmesi istenen oran.">
                <input className={inputCls} inputMode="decimal" value={f.rtp} onChange={(e) => setF({ ...f, rtp: e.target.value })} />
              </Field>
              <Field label="İsabet oranı (%)" hint="Spinlerin kaçında kazanç çıksın (otomatik mod).">
                <input className={inputCls} inputMode="decimal" value={f.hit} onChange={(e) => setF({ ...f, hit: e.target.value })} />
              </Field>
              <Field label="En yüksek kazanç (× toplam bahis)">
                <input className={inputCls} inputMode="numeric" value={f.maxWin} onChange={(e) => setF({ ...f, maxWin: e.target.value })} />
              </Field>
              <Field label="Free spin şansı (% spin başına)">
                <input className={inputCls} inputMode="decimal" value={f.freeCh} onChange={(e) => setF({ ...f, freeCh: e.target.value })} />
              </Field>
              <Field label="Jackpot şansı (% spin başına)" hint="Jackpot tabakası için toplam bahis yeterliyse.">
                <input className={inputCls} inputMode="decimal" value={f.jpCh} onChange={(e) => setF({ ...f, jpCh: e.target.value })} />
              </Field>
              <Field label="Ödeme çarpanı (%)" hint="Ödeme tablosundaki tüm kazançlara uygulanır (oyuncuya da gösterilir). %100 = tablo aynen.">
                <input className={inputCls} inputMode="decimal" value={f.pay} onChange={(e) => setF({ ...f, pay: e.target.value })} />
              </Field>
              <Field label="Havuz payı (% bahis)" hint="Her ücretli spinin bu kadarı jackpot havuzuna girer (0-5).">
                <input className={inputCls} inputMode="decimal" value={f.contrib} onChange={(e) => setF({ ...f, contrib: e.target.value })} />
              </Field>
              <Field label="Havuz tabanı (Coin)" hint="Jackpot ödenince havuz bu tutarın altına inmez (fark kasadan karşılanır). 0 = kapalı.">
                <input className={inputCls} inputMode="numeric" value={f.floor} onChange={(e) => setF({ ...f, floor: e.target.value })} />
              </Field>
              <Field label="En yüksek bahis" hint="Toplam bahis (50 çizgi) bu basamağa kadar açılır.">
                <select className={inputCls} value={f.maxBet} onChange={(e) => setF({ ...f, maxBet: e.target.value })}>
                  {BET_STEPS.map((b, i) => <option key={b} value={i}>{b} Coin</option>)}
                </select>
              </Field>
              <Field label="Kart kumarı: en çok tur (1-8)">
                <input className={inputCls} inputMode="numeric" value={f.gMax} onChange={(e) => setF({ ...f, gMax: e.target.value })} />
              </Field>
              <Field label="Kart kumarı: kazanma şansı (%)" hint="Adil oyun için 50.">
                <input className={inputCls} inputMode="decimal" value={f.gWin} onChange={(e) => setF({ ...f, gWin: e.target.value })} />
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap gap-5 text-sm text-gray-300">
              <label className="flex items-center gap-2"><input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} /> Oyun açık</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={f.gOn} onChange={(e) => setF({ ...f, gOn: e.target.checked })} /> Kart kumarı açık</label>
            </div>
            <div className="mt-4"><button type="button" disabled={busy} className={btnSmall} onClick={save}>Kaydet</button></div>
            <ActionMsg msg={msg} />
          </Card>
        </div>
      )}
    </div>
  );
}
