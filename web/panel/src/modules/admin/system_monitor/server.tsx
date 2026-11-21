"use client";

import { useState } from "react";
import { Server } from "lucide-react";
import { api } from "@/core/api/api";
import { useApi } from "@/core/api/use-api";
import { Card, ErrorBox, Loading, Notice, PageHeader, StatCard, inputCls } from "@/shared/components/ui";
import { ActionMsg, btnGhost, useAction } from "@/shared/components/kit";

type Status = { serverVersion: string; gitToken: boolean; available: boolean; updateLog: string | null; installLog: string | null };

export default function AdminServer() {
  const { data, error, loading, reload } = useApi<Status>("/api/admin/server/status");
  const { busy, msg, run } = useAction();
  const [token, setToken] = useState("");
  return (
    <div>
      <PageHeader icon={<Server size={18} />} kicker="Sistem" title="Sunucu" description="Sürüm, güncelleme kayıtları ve şimdi güncelle. Sunucu GitHub'daki yeni sürümü birkaç dakikada bir kendiliğinden alır." />
      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Sunucu sürümü" value={data.serverVersion} />
            <StatCard label="Güncelleme isteği" value={data.available ? "Alınabiliyor" : "Kapalı"} tone={data.available ? "green" : "red"} />
            <StatCard label="GitHub anahtarı" value={data.gitToken ? "Kayıtlı" : "Yok"} note="Depo gizliyse gerekir" tone={data.gitToken ? "green" : "gold"} />
          </div>
          <Card title="Şimdi güncelle" subtitle="GitHub'daki son sürüm hemen indirilip kurulur (birkaç dakika sürer, kısa kesinti olabilir).">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="gold-button disabled:opacity-60"
                disabled={busy || !data.available}
                onClick={() =>
                  run("İstek gönderildi. Kayıtları birkaç dakika sonra yenileyin.", async () => {
                    if (!window.confirm("Sunucu şimdi güncellensin mi? Kısa bir kesinti olabilir.")) return false;
                    await api("/api/admin/server/update", { method: "POST" });
                  })
                }
              >
                Şimdi güncelle
              </button>
              <button type="button" className={btnGhost} onClick={reload}>
                Kayıtları yenile
              </button>
            </div>
            <div className="mt-3">
              <ActionMsg msg={msg} />
            </div>
          </Card>
          <Card title="GitHub erişim anahtarı" subtitle="Yalnızca depo gizliyse gerekir. Anahtar sunucuya yazılır, geri okunamaz. Boş kaydederseniz silinir.">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input className={`${inputCls} flex-1`} type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="github_pat_…" />
              <button
                type="button"
                className={btnGhost}
                disabled={busy}
                onClick={() =>
                  run(token.trim() ? "Anahtar kaydedildi." : "Anahtar silindi.", async () => {
                    await api("/api/admin/server/git-token", { method: "POST", body: { token: token.trim() } });
                    setToken("");
                    reload();
                  })
                }
              >
                Kaydet
              </button>
            </div>
          </Card>
          {!data.updateLog && !data.installLog && <Notice tone="error">Sunucu kayıtları okunamadı (kurulum klasörü bağlı değil).</Notice>}
          {data.updateLog && <Log title="Güncelleme kaydı" text={data.updateLog} />}
          {data.installLog && <Log title="Kurulum kaydı" text={data.installLog} />}
        </div>
      )}
    </div>
  );
}

function Log({ title, text }: { title: string; text: string }) {
  return (
    <Card title={title}>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 p-3 font-mono text-xs leading-5 text-gray-300">{text}</pre>
    </Card>
  );
}
