"use client";

import { useState } from "react";
import { api, fmtDate, fmtNumber } from "@/core/api/api";
import { useApi } from "@/core/api/use-api";
import { Badge, Card, Empty, ErrorBox, Loading, StatCard, inputCls, tableCls, tableWrap, tdCls, thCls } from "@/shared/components/ui";
import { ActionMsg, UserLink, btnSmall, useAction, type Brief } from "@/shared/components/kit";

type Run = {
  id: string; startedAt: string; finishedAt: string | null; usersChecked: number; usersNew: number;
  mismatches: number; coinDiff: string; diamondDiff: string; totalCoins: string; totalDiamonds: string;
  manual: boolean; failed: boolean; note: string | null;
};
type Item = {
  id: string; runId: string; coinDiff: string; diamondDiff: string; coins: string; diamonds: string;
  resolved: boolean; resolveNote: string | null; resolvedAt: string | null; createdAt: string; user: Brief;
};

const diff = (v: string) => {
  if (v === "0") return <span className="text-gray-600">0</span>;
  const neg = v.startsWith("-");
  return <span className={neg ? "text-red-300" : "text-amber-300"}>{neg ? "" : "+"}{fmtNumber(v)}</span>;
};

/**
 * Mutabakat: her kullanıcı için "bakiyedeki değişim = işlem defterindeki toplam" eşitliği denetlenir.
 * Fark çıkması, bir yerde bakiyenin defter yazılmadan değiştiği (ya da tersi) anlamına gelir.
 */
export default function Reconcile() {
  const { data, error, loading, reload } = useApi<{
    last: Run | null; openItems: number; runs: Run[]; items: Item[];
  }>("/api/admin/finance/reconcile");
  const { busy, msg, run } = useAction();
  const [note, setNote] = useState<Record<string, string>>({});

  const start = () =>
    run("Mutabakat çalıştı.", async () => {
      const r = await api<{ mismatches: number; usersChecked: number }>("/api/admin/finance/reconcile/run", { method: "POST" });
      reload();
      if (r.mismatches > 0) throw new Error(`${r.usersChecked} kullanıcı denetlendi, ${r.mismatches} kullanıcıda fark bulundu.`);
    });

  const last = data?.last ?? null;
  const healthy = last && !last.failed && last.mismatches === 0 && (data?.openItems ?? 0) === 0;

  return (
    <div className="space-y-4">
      {data && (data.openItems > 0 || last?.failed) && (
        <div className="rounded-lg border border-[#7a2b2b] bg-[#2a1212] p-3 text-sm text-[#ffb4b4]">
          <b>Dikkat:</b>{" "}
          {last?.failed
            ? `Son mutabakat çalışması hata verdi${last.note ? `: ${last.note}` : "."}`
            : `${data.openItems} kullanıcıda kapatılmamış bakiye farkı var. Her fark, bakiyenin işlem defteri yazılmadan değiştiği anlamına gelir; incelenmeden kapatılmamalı.`}
        </div>
      )}

      <Card
        title="Mutabakat"
        subtitle="Bakiye ile işlem defteri her gün karşılaştırılır. Fark = bir yerde kayıtsız para hareketi."
        action={
          <button type="button" disabled={busy} className={btnSmall} onClick={start}>
            Şimdi çalıştır
          </button>
        }
      >
        {loading && !data && <Loading />}
        {error && <ErrorBox message={error} onRetry={reload} />}
        {data && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard
                label="Son durum"
                value={healthy ? "Temiz" : last ? "Fark var" : "Henüz çalışmadı"}
                tone={healthy ? "green" : last ? "red" : undefined}
                note={last ? fmtDate(last.startedAt) : "Günde bir kez otomatik çalışır"}
              />
              <StatCard label="Açık fark" value={fmtNumber(data.openItems)} tone={data.openItems ? "red" : "green"} note="çözülmemiş kayıt" />
              <StatCard label="Denetlenen" value={last ? fmtNumber(last.usersChecked) : "—"} note={last ? `${fmtNumber(last.usersNew)} yeni taban` : ""} />
              <StatCard label="Toplam Coin" value={last ? fmtNumber(last.totalCoins) : "—"} tone="gold" note={last ? `${fmtNumber(last.totalDiamonds)} Elmas` : ""} />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-gray-500">
              Denetlenen eşitlik, kullanıcı başına: <code>bakiye farkı = defterdeki toplam</code>. İki taraf da tek
              sorguda okunur, bu yüzden sorgu sürerken yapılan hediye yanlış alarm üretmez. Fark bulunursa mali
              denetim günlüğüne de yazılır ve siz kapatana kadar her çalışmada görünmeye devam eder.
            </p>
          </>
        )}
        <ActionMsg msg={msg} />
      </Card>

      {data && data.items.length > 0 && (
        <Card title="Farklar" subtitle="İncelenip kapatılmayı bekleyen ve geçmişte kapatılmış kayıtlar">
          <div className={tableWrap}>
            <table className={tableCls}>
              <thead>
                <tr>
                  <th className={thCls}>Kullanıcı</th>
                  <th className={`${thCls} text-right`}>Coin farkı</th>
                  <th className={`${thCls} text-right`}>Elmas farkı</th>
                  <th className={`${thCls} text-right`}>Güncel bakiye</th>
                  <th className={thCls}>Bulundu</th>
                  <th className={thCls}>Durum</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((i) => (
                  <tr key={i.id} className={i.resolved ? "opacity-50" : ""}>
                    <td className={tdCls}><UserLink user={i.user} /></td>
                    <td className={`${tdCls} text-right`}>{diff(i.coinDiff)}</td>
                    <td className={`${tdCls} text-right`}>{diff(i.diamondDiff)}</td>
                    <td className={`${tdCls} text-right text-gray-400`}>{fmtNumber(i.coins)}</td>
                    <td className={`${tdCls} text-xs text-gray-500`}>{fmtDate(i.createdAt)}</td>
                    <td className={tdCls}>
                      {i.resolved ? (
                        <span className="text-xs text-gray-500" title={i.resolveNote ?? ""}>Kapatıldı{i.resolveNote ? ` · ${i.resolveNote}` : ""}</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <input
                            className={`${inputCls} h-8 w-40 text-xs`}
                            placeholder="Sebep / bulgu"
                            value={note[i.id] ?? ""}
                            onChange={(e) => setNote({ ...note, [i.id]: e.target.value })}
                          />
                          <button
                            type="button"
                            disabled={busy}
                            className={btnSmall}
                            onClick={() => run("Kayıt kapatıldı.", async () => {
                              await api(`/api/admin/finance/reconcile/items/${i.id}/resolve`, { method: "POST", body: { note: note[i.id] || null } });
                              reload();
                            })}
                          >
                            Kapat
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {data && (
        <Card title="Çalışma geçmişi" subtitle="Son 30 mutabakat">
          {data.runs.length === 0 && <Empty title="Henüz çalışmadı" />}
          {data.runs.length > 0 && (
            <div className={tableWrap}>
              <table className={tableCls}>
                <thead>
                  <tr>
                    <th className={thCls}>Zaman</th>
                    <th className={`${thCls} text-right`}>Denetlenen</th>
                    <th className={`${thCls} text-right`}>Fark</th>
                    <th className={`${thCls} text-right`}>Coin farkı</th>
                    <th className={thCls}>Tür</th>
                  </tr>
                </thead>
                <tbody>
                  {data.runs.map((r) => (
                    <tr key={r.id}>
                      <td className={`${tdCls} text-xs`}>{fmtDate(r.startedAt)}</td>
                      <td className={`${tdCls} text-right`}>{fmtNumber(r.usersChecked)}</td>
                      <td className={`${tdCls} text-right`}>
                        {r.failed ? <Badge tone="red">Hata</Badge> : r.mismatches ? <Badge tone="red">{r.mismatches}</Badge> : <Badge tone="green">0</Badge>}
                      </td>
                      <td className={`${tdCls} text-right`}>{diff(r.coinDiff)}</td>
                      <td className={`${tdCls} text-xs text-gray-500`}>{r.manual ? "Elle" : "Otomatik"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
