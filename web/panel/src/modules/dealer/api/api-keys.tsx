"use client";

import { useState } from "react";
import { Copy, KeyRound, Trash2 } from "lucide-react";
import { api, fmtDate, fmtNumber } from "@/core/api/api";
import { useApi } from "@/core/api/use-api";
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, inputCls, tableCls, tableWrap, tdCls, thCls } from "@/shared/components/ui";
import { ActionMsg, Field, btnDangerOutline, btnSmall, useAction } from "@/shared/components/kit";

type Key = { id: string; prefix: string; label: string; ipAllow: string[]; dailyLimit: string; createdAt: string; lastUsedAt: string | null; lastIp: string | null; revokedAt: string | null };

/**
 * Bayi API anahtarları: bayi kendi sitesinden / botundan, kendi Coin stoğundan kullanıcı ID'sine yükleme yapar
 * (/dealer-api/v1). Anahtarın tamamı yalnızca oluşturulurken bir kez gösterilir.
 */
export default function DealerApiKeys() {
  const { data, error, loading, reload } = useApi<{ apiEnabled: boolean; keys: Key[]; docsUrl: string }>("/api/dealer/api-keys");
  const [label, setLabel] = useState("");
  const [ips, setIps] = useState("");
  const [limit, setLimit] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const { busy, msg, run } = useAction();
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <div>
      <PageHeader icon={<KeyRound size={18} />} kicker="Bayi" title="API Anahtarları"
        description="Kendi sitenizden ya da botunuzdan, Coin stoğunuzdan müşterinin ID'sine otomatik yükleme." />
      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && (
        <div className="space-y-6">
          <Card title="Nasıl çalışır" subtitle="Belge ve örnek kodlar (Node.js, PHP, curl):">
            <a className="text-[#d7b56d] underline" href={`${base}${data.docsUrl}`} target="_blank" rel="noreferrer">{base}{data.docsUrl}</a>
            <p className="mt-2 text-sm text-gray-400">API adresi: <code>{base}/dealer-api/v1</code>. Her yüklemede sizin sipariş numaranızı (<code>clientOrderId</code>) gönderin: aynı numara ikinci kez Coin yüklemez.</p>
          </Card>
          {!data.apiEnabled ? (
            <Card title="API erişimi kapalı"><p className="text-sm text-gray-400">API erişiminizin açılması için yönetimle görüşün.</p></Card>
          ) : (
            <Card title="Yeni anahtar" subtitle="Sunucunuzun IP adresini mutlaka yazın. Günlük sınır, anahtar sızarsa kaybı sınırlar.">
              <div className="grid gap-2 md:grid-cols-3">
                <Field label="Ad"><input className={inputCls} value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder="Web sitem" /></Field>
                <Field label="İzinli IP'ler" hint="Virgülle; ör. 203.0.113.7 ya da 203.0.113.0/24"><input className={inputCls} value={ips} onChange={(e) => setIps(e.target.value)} /></Field>
                <Field label="24 saatlik Coin sınırı" hint="0 ya da boş = sınırsız"><input className={inputCls} value={limit} inputMode="numeric" onChange={(e) => setLimit(e.target.value.replace(/\D/g, ""))} /></Field>
              </div>
              <button type="button" disabled={busy} className={`${btnSmall} mt-3`} onClick={() => run("Anahtar oluşturuldu. Şimdi kopyalayın; bir daha gösterilmez.", async () => {
                const r = await api<{ key: string }>("/api/dealer/api-keys", { method: "POST", body: { label, ipAllow: ips, dailyLimit: limit || "0" } });
                setFresh(r.key); setLabel(""); setIps(""); setLimit(""); reload();
              })}>Anahtar oluştur</button>
              <ActionMsg msg={msg} />
              {fresh && (
                <div className="mt-3 rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
                  <div className="font-semibold text-amber-300">Bu anahtar yalnızca şimdi görünür:</div>
                  <div className="mt-1 flex items-center gap-2 break-all"><code className="text-white">{fresh}</code>
                    <button type="button" className="text-[#d7b56d]" onClick={() => navigator.clipboard?.writeText(fresh)} title="Kopyala"><Copy size={14} /></button></div>
                  <div className="mt-1 text-xs text-gray-400">Yalnızca sunucunuzda saklayın; uygulama ya da tarayıcı koduna koymayın.</div>
                </div>
              )}
            </Card>
          )}
          <Card title="Anahtarlar">
            {data.keys.length === 0 ? <Empty title="Henüz anahtar yok." /> : (
              <div className={tableWrap}>
                <table className={tableCls}>
                  <thead><tr><th className={thCls}>Anahtar</th><th className={thCls}>IP</th><th className={thCls}>Günlük sınır</th><th className={thCls}>Son kullanım</th><th className={thCls}>Durum</th><th className={thCls} /></tr></thead>
                  <tbody>
                    {data.keys.map((k) => (
                      <tr key={k.id}>
                        <td className={tdCls}><code className="text-xs">{k.prefix}_…</code><div className="text-xs text-gray-500">{k.label || "—"} · {fmtDate(k.createdAt)}</div></td>
                        <td className={tdCls}>{k.ipAllow.length ? k.ipAllow.join(", ") : <span className="text-amber-400">her IP</span>}</td>
                        <td className={tdCls}>{k.dailyLimit === "0" ? "sınırsız" : fmtNumber(k.dailyLimit)}</td>
                        <td className={tdCls}>{k.lastUsedAt ? `${fmtDate(k.lastUsedAt)} · ${k.lastIp ?? ""}` : "—"}</td>
                        <td className={tdCls}>{k.revokedAt ? <Badge tone="gray">İptal</Badge> : <Badge tone="green">Etkin</Badge>}</td>
                        <td className={tdCls}>{!k.revokedAt && (
                          <button type="button" disabled={busy} className={`${btnDangerOutline} inline-flex items-center gap-1`} onClick={() => run("Anahtar iptal edildi.", async () => {
                            if (!window.confirm(`${k.prefix} iptal edilsin mi? Bu anahtarla yapılan istekler hemen reddedilir.`)) return false;
                            await api(`/api/dealer/api-keys/${k.id}`, { method: "DELETE" }); reload();
                          })}><Trash2 size={14} /> İptal</button>
                        )}</td>
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
