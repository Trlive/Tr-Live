"use client";

import { useEffect, useState } from "react";
import { api, fmtNumber } from "@/core/api/api";
import { useApi } from "@/core/api/use-api";
import { Card, ErrorBox, Loading, inputCls } from "@/shared/components/ui";
import { ActionMsg, Field, btnGhost, useAction } from "@/shared/components/kit";
import { useConfirm } from "@/shared/components/confirm";

/**
 * Maaş koşul ağırlıkları + ay başı otomatik aktarım.
 *
 * Sahibinin tasarımı: yayıncının temel maaşı sözleşme kademesinden gelir, ay içinde
 * tamamladığı koşullar bu maaşın yüzde kaçını hak ettiğini belirler:
 *
 *     hak edilen = temel maaş × Σ(koşul ağırlığı × gerçekleşme oranı)
 *
 * Bu ekranın asıl işi ağırlıkları düzenlemek DEĞİL, düzenlemenin SONUCUNU göstermek.
 * Sahibi "gün ve saat eksikse maaşın %50-60'ı yatsın" dedi; aşağıdaki önizleme, girilen
 * ağırlıklarla o oranın kaç çıktığını anında yazıyor. Yoksa 2500 yazıp sonucun %50 mi %60 mı
 * olduğunu kafadan hesaplamak gerekirdi.
 */

type Weights = { attendance: number; diamonds: number; tasks: number };

type Cfg = {
  settings: Record<string, string | number | boolean> & { salaryWeights?: Weights };
};

type Run = {
  periodKey: string; startedAt: string; finishedAt: string | null;
  trigger: string; startedBy: string | null;
  paidCount: number; paidCents: string; skippedCount: number;
};

const KEYS: { key: keyof Weights; label: string; hint: string }[] = [
  {
    key: "attendance",
    label: "Gün ve yayın saati",
    hint: "Gün VE saat hedefinin ikisi de tutmalı. Biri eksikse bu koşul hiç puan katmaz — 22 gün isteniyorsa 21 gün eksiktir.",
  },
  { key: "diamonds", label: "Elmas hedefi", hint: "Kademenin elmas hedefine ulaşıldı mı" },
  { key: "tasks", label: "Görev / etkinlik", hint: "Tuttu ya da tutmadı" },
];

const TOTAL = 10000;
const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;

export default function SalaryWeights() {
  const { data, error, loading, reload } = useApi<{ config: Cfg }>("/api/admin/agency-config");
  const runs = useApi<{ runs: Run[] }>("/api/admin/salary-transfers");
  const { busy, msg, run } = useAction();
  const { ask, confirmNode } = useConfirm();

  const [w, setW] = useState<Weights>({ attendance: 5000, diamonds: 3000, tasks: 2000 });
  const [weighted, setWeighted] = useState(false);
  const [auto, setAuto] = useState(false);
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState("3");

  useEffect(() => {
    if (!data) return;
    const s = data.config.settings;
    if (s.salaryWeights) setW({ ...s.salaryWeights });
    setWeighted(Boolean(s.salaryWeightedEnabled));
    setAuto(Boolean(s.salaryAutoTransfer));
    setFrom(String(s.salaryTransferDayFrom ?? 1));
    setTo(String(s.salaryTransferDayTo ?? 3));
  }, [data]);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;

  const sum = KEYS.reduce((a, k) => a + (Number(w[k.key]) || 0), 0);
  const okSum = sum === TOTAL;

  // Önizleme: belirli koşullar hiç tutmazsa maaşın yüzde kaçı kalır.
  const left = (missing: (keyof Weights)[]) => TOTAL - missing.reduce((a, k) => a + (Number(w[k]) || 0), 0);

  const save = () =>
    run("Maaş ayarları kaydedildi.", async () => {
      if (!okSum) throw new Error(`Ağırlıkların toplamı ${fmtNumber(String(TOTAL))} olmalı (şu an ${fmtNumber(String(sum))}).`);
      const f = Number(from);
      const t = Number(to);
      if (!Number.isInteger(f) || !Number.isInteger(t) || f < 1 || t < 1 || f > 28 || t > 28 || f > t) {
        throw new Error("Aktarım penceresi 1–28 arası ve başlangıç ≤ bitiş olmalı.");
      }
      const s = data.config.settings;
      // Ödemeye esas hesabı değiştirmek geri alınamaz sonuçlar doğurur: açıkça onaylatıyoruz.
      if (weighted && !s.salaryWeightedEnabled) {
        const okd = await ask({
          title: "Ağırlıklı hesap ÖDEMEYE esas olsun mu?",
          body: "Bundan sonra kapatılan dönemlerde maaş, sözleşme kademesi × tamamlanan koşullar olarak ödenir. Önce bir dönemi kapatıp iki sayıyı karşılaştırmanız önerilir.",
          okLabel: "Evet, ağırlıklı hesap ödesin",
          danger: true,
        });
        if (!okd) return false;
      }
      if (auto && !s.salaryAutoTransfer) {
        const okd = await ask({
          title: "Otomatik aktarım açılsın mı?",
          body: `Ayın ${from}–${to} günleri arasında, kapanmış dönemlerin maaşı yayıncıların dolar bakiyesine kendiliğinden geçer. Her dönem yalnızca bir kez aktarılır.`,
          okLabel: "Evet, aç",
          danger: true,
        });
        if (!okd) return false;
      }
      await api("/api/admin/agency-config", {
        method: "PUT",
        body: {
          settings: {
            salaryWeights: w,
            salaryWeightedEnabled: weighted,
            salaryAutoTransfer: auto,
            salaryTransferDayFrom: f,
            salaryTransferDayTo: t,
          },
        },
      });
      reload();
    });

  return (
    <div className="space-y-6">
      <Card
        title="Maaş koşul ağırlıkları"
        subtitle="Hak edilen maaş = sözleşme kademesinin maaşı × tutan koşulların ağırlık toplamı. Toplam 10000 (= %100) olmalı."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {KEYS.map((k) => (
            <Field key={k.key} label={`${k.label} — ${pct(Number(w[k.key]) || 0)}`} hint={k.hint}>
              <input
                className={inputCls}
                inputMode="numeric"
                value={String(w[k.key] ?? "")}
                onChange={(e) => setW({ ...w, [k.key]: Number(e.target.value.replace(/[^\d]/g, "").slice(0, 5)) || 0 })}
              />
            </Field>
          ))}
        </div>

        <div className={`mt-4 rounded-xl border p-3 text-sm ${okSum ? "border-emerald-700/40 text-emerald-300" : "border-red-600/50 text-red-300"}`}>
          Toplam: {fmtNumber(String(sum))} / {fmtNumber(String(TOTAL))}
          {!okSum && " — kaydedilemez. Toplam 10000 olmazsa kimse maaşının tamamını hak edemez."}
        </div>

        {/* Sahibinin asıl sorusu: "gün ve saat eksikse yüzde kaçı yatar?" */}
        <div className="mt-4 space-y-1 rounded-xl border border-[#262117] bg-[#141210] p-4 text-sm">
          <div className="mb-2 font-semibold text-white">Bu ağırlıklarla ne olur</div>
          <div className="text-gray-300">Tüm koşullar tamam → <span className="font-semibold text-emerald-300">%100</span></div>
          <div className="text-gray-300">
            Gün veya saat eksik (1 gün de olsa) → <span className="font-semibold text-[#d7b56d]">{pct(left(["attendance"]))}</span>
          </div>
          <div className="text-gray-300">Elmas hedefi eksik → <span className="font-semibold">{pct(left(["diamonds"]))}</span></div>
          <div className="text-gray-300">Görev eksik → <span className="font-semibold">{pct(left(["tasks"]))}</span></div>
          <div className="text-gray-300">Hiçbiri tutmadı → <span className="font-semibold text-red-300">%0</span></div>
          <p className="mt-2 text-xs text-gray-500">
            Koşul ya tutar ya tutmaz; kısmi kredi yoktur. 22 gün isteniyorsa 21 gün de 10 gün de aynı sonucu
            verir. Gün ve saat TEK koşuldur: biri eksikse ikisi birden eksikmiş gibi davranır.
          </p>
        </div>
      </Card>

      <Card title="Ödeme ve aktarım" subtitle="İkisi de kapalı gelir. Açmadan önce bir dönem kapatıp sayıları karşılaştırın.">
        <div className="space-y-3">
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-[#262117] bg-[#141210] px-4 py-3">
            <span className="text-sm text-gray-200">
              Ağırlıklı hesap ödemeye esas olsun
              <span className="block text-xs text-gray-500">Kapalıyken hesaplanır ve özette gösterilir ama maaşı eski kademe hesabı belirler.</span>
            </span>
            <input type="checkbox" checked={weighted} onChange={(e) => setWeighted(e.target.checked)} className="h-4 w-4 accent-[#d7b56d]" />
          </label>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-[#262117] bg-[#141210] px-4 py-3">
            <span className="text-sm text-gray-200">
              Ay başı otomatik dolar aktarımı
              <span className="block text-xs text-gray-500">Kapanmış dönemlerin maaşı, pencere içinde yayıncının dolar bakiyesine kendiliğinden geçer. Her dönem bir kez.</span>
            </span>
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="h-4 w-4 accent-[#d7b56d]" />
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Aktarım penceresi — başlangıç günü">
              <input className={inputCls} inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value.replace(/[^\d]/g, "").slice(0, 2))} />
            </Field>
            <Field label="Aktarım penceresi — bitiş günü">
              <input className={inputCls} inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value.replace(/[^\d]/g, "").slice(0, 2))} />
            </Field>
          </div>
          <p className="text-xs text-gray-500">
            Maaşın yatması için yayıncının telefonunun doğrulanmış olması yeterli; kimlik fotoğrafı istenmez. Telefonu
            doğrulanmamış yayıncının maaşı kaybolmaz, beklemede kalır ve sonraki aktarımda ödenir.
          </p>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button type="button" disabled={busy || !okSum} onClick={save} className="gold-button disabled:opacity-60 sm:w-auto sm:px-8">
            Kaydet
          </button>
          <ActionMsg msg={msg} />
        </div>
      </Card>

      <Card title="Aktarım kayıtları" subtitle="Her dönem yalnızca bir kez aktarılır; tekrar denense hiçbir şey yapılmaz.">
        {runs.data && runs.data.runs.length === 0 && <p className="text-sm text-gray-500">Henüz aktarım yapılmadı.</p>}
        {runs.data && runs.data.runs.length > 0 && (
          <div className="space-y-2">
            {runs.data.runs.map((r) => (
              <div key={r.periodKey} className="flex flex-wrap items-center gap-3 rounded-xl border border-[#262117] p-3 text-sm">
                <span className="font-semibold text-white">{r.periodKey}</span>
                <span className="text-gray-400">{r.trigger === "auto" ? "otomatik" : `elle${r.startedBy ? ` · @${r.startedBy}` : ""}`}</span>
                <span className="text-emerald-300">{r.paidCount} yayıncı · {fmtNumber(r.paidCents)} sent</span>
                {r.skippedCount > 0 && <span className="text-[#d7b56d]">{r.skippedCount} atlandı (telefon doğrulanmamış)</span>}
                {!r.finishedAt && <span className="text-red-300">yarım kaldı</span>}
              </div>
            ))}
          </div>
        )}
        <button type="button" className={`${btnGhost} mt-3`} onClick={runs.reload}>
          Yenile
        </button>
      </Card>
      {confirmNode}
    </div>
  );
}
