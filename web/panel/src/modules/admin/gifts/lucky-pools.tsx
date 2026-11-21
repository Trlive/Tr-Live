"use client";

import { useState } from "react";
import { Clover } from "lucide-react";
import { api, fmtNumber } from "@/core/api/api";
import { useApi } from "@/core/api/use-api";
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, inputCls } from "@/shared/components/ui";
import { ActionMsg, btnSmall, selectCls, useAction } from "@/shared/components/kit";
import { ConfigForm } from "@/modules/admin/settings/config-form";

type Pool = { giftId: string; name: string; coinPrice: string; active: boolean; base: string; jackpot: string; openAt: string; totalIn: string; totalOut: string; seeded: string; jackpotHits: number };

export default function AdminLuckyPools() {
  const { data, error, loading, reload } = useApi<{ jackpotOpen: number; pools: Pool[] }>("/api/admin/lucky-pools");
  return (
    <div>
      <PageHeader icon={<Clover size={18} />} kicker="Ekonomi" title="Şanslı Hediye Havuzları" description="Her şanslı hediyenin ödül havuzu. Büyük ödül havuzu fiyatın belli katına ulaşınca açılır." />
      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && (
        <div className="space-y-6">
          <Card subtitle={`Büyük ödül havuzu, fiyatın ${data.jackpotOpen} katı dolunca açılır.`}>
            {data.pools.length === 0 ? (
              <Empty title="Şanslı hediye yok." note="Hediye eklerken sekmeyi Şanslı seçin." />
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {data.pools.map((p) => (
                  <PoolCard key={p.giftId} p={p} onDone={reload} />
                ))}
              </div>
            )}
          </Card>
          <ConfigForm
            title="Şanslı hediye ayarları"
            fields={[
              { key: "luckyEnabled", label: "Şanslı hediyeler açık", type: "bool" },
              { key: "luckyRtpBps", label: "Geri ödeme oranı", type: "int", suffix: "baz puan, 6000 = %60, en çok 9000" },
              { key: "luckyJackpotShareBps", label: "Büyük ödül havuzuna ayrılan pay", type: "int", suffix: "baz puan" },
              { key: "luckyReceiverBps", label: "Alıcı payı", type: "int", suffix: "baz puan" },
              { key: "luckyMaxWin", label: "Tek seferde en büyük kazanç", type: "int", suffix: "Coin" },
              { key: "luckyAnnounceMultiplier", label: "Herkese duyurulan kazanç katı", type: "int", suffix: "x" },
            ]}
          />
        </div>
      )}
    </div>
  );
}

function PoolCard({ p, onDone }: { p: Pool; onDone: () => void }) {
  const { busy, msg, run } = useAction();
  const [coins, setCoins] = useState("");
  const [pool, setPool] = useState<"jackpot" | "base">("jackpot");
  const open = BigInt(p.jackpot) >= BigInt(p.openAt);
  const amount = coins.replace(/\D/g, "");
  const net = BigInt(p.totalIn) - BigInt(p.totalOut);
  return (
    <div className="rounded-xl border border-[#30291e] p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold text-white">
          {p.name} <span className="text-xs text-gray-500">· {fmtNumber(p.coinPrice)} Coin</span>
        </div>
        {!p.active && <Badge tone="gray">Kapalı</Badge>}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg bg-[#171717] p-2">
          <div className="text-xs text-gray-500">Ana havuz</div>
          <div className="text-white">{fmtNumber(p.base)}</div>
        </div>
        <div className="rounded-lg bg-[#171717] p-2">
          <div className="text-xs text-gray-500">Büyük ödül</div>
          <div className={open ? "text-green-300" : "text-[#d7b56d]"}>
            {fmtNumber(p.jackpot)} / {fmtNumber(p.openAt)}
          </div>
        </div>
      </div>
      <div className="mt-2 text-xs text-gray-500">
        Giren {fmtNumber(p.totalIn)} · çıkan {fmtNumber(p.totalOut)} · net {fmtNumber(net.toString())} · eklenen {fmtNumber(p.seeded)} · büyük ödül {p.jackpotHits} kez
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <input className={`${inputCls} w-32`} inputMode="numeric" value={amount ? fmtNumber(amount) : ""} onChange={(e) => setCoins(e.target.value)} placeholder="Coin" />
        <select className={selectCls} value={pool} onChange={(e) => setPool(e.target.value as "jackpot" | "base")}>
          <option value="jackpot">Büyük ödüle</option>
          <option value="base">Ana havuza</option>
        </select>
        <button
          type="button"
          className={btnSmall}
          disabled={busy || !amount || amount === "0"}
          onClick={() =>
            run("Havuza eklendi.", async () => {
              if (!window.confirm(`${p.name} ${pool === "jackpot" ? "büyük ödül" : "ana"} havuzuna ${fmtNumber(amount)} Coin eklensin mi? Bu Coin platformdan çıkar.`)) return false;
              await api(`/api/admin/lucky-pools/${p.giftId}/seed`, { method: "POST", body: { pool, coins: amount } });
              setCoins("");
              onDone();
            })
          }
        >
          Ekle
        </button>
      </div>
      <ActionMsg msg={msg} />
    </div>
  );
}
