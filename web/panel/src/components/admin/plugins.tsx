"use client";

import { useEffect, useState } from "react";
import { PartyPopper } from "lucide-react";
import { api, apiBinary } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, StatCard, inputCls } from "@/components/ui";
import { ActionMsg, Field, btnDangerOutline, btnSmall, selectCls, useAction } from "./kit";

type Pkg = { id: string; name: string; version: string; enabled: boolean; files: number; bytes: string; installedAt: string; hasPanel: boolean; running: boolean; error: string | null };
type FieldDef = { key: string; label: string; type: "number" | "text" | "select" | "bool"; hint?: string; scale?: number; options?: { value: string | number; label: string }[] };
type Schema = {
  title?: string; description?: string;
  stats?: { label: string; value: string; note?: string; tone?: "gold" | "green" | "red" | "blue" }[];
  fields?: FieldDef[]; values?: Record<string, unknown>;
  actions?: { id: string; label: string; confirm?: string }[];
  tables?: { title: string; subtitle?: string; columns: string[]; rows: (string | number)[][]; empty?: string }[];
};

/** Oyun paketleri: oyunların kodu ana depoda değildir; buradan zip yüklenir, sunucu saklar ve çalıştırır. */
export default function AdminPlugins() {
  const { data, error, loading, reload } = useApi<{ items: Pkg[] }>("/api/admin/plugins");
  const { busy, msg, run } = useAction();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div>
      <PageHeader icon={<PartyPopper size={18} />} kicker="Sistem" title="Oyun Paketleri" description="Oyunlar ana kodda bulunmaz. Oyun paketini (zip) buradan yükleyin; sunucu saklar, çalıştırır ve etkinlik kartını ekler. Yeni zip yüklemek oyunu günceller." />
      <Card title="Paket yükle">
        <input
          type="file"
          accept=".zip,application/zip"
          disabled={busy}
          className="text-sm text-gray-300"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            run("Paket yüklendi ve başlatıldı.", async () => {
              const r = await apiBinary<{ error?: string | null }>("/api/admin/plugins/upload", f);
              reload();
              if (r.error) throw new Error(`Paket yüklendi ama başlatılamadı: ${r.error}`);
            });
          }}
        />
        <ActionMsg msg={msg} />
      </Card>
      <div className="mt-4 space-y-4">
        {loading && !data && <Loading />}
        {error && <ErrorBox message={error} onRetry={reload} />}
        {data && data.items.length === 0 && <Empty title="Yüklü oyun paketi yok." />}
        {data?.items.map((p) => (
          <Card
            key={p.id}
            title={`${p.name} · v${p.version || "?"}`}
            subtitle={`${p.id} · ${p.files} dosya · ${(Number(p.bytes) / 1048576).toFixed(1)} MB`}
            action={p.error ? <Badge tone="red">Hata</Badge> : p.running ? <Badge tone="green">Çalışıyor</Badge> : <Badge tone="gray">Kapalı</Badge>}
          >
            {p.error && <p className="mb-2 text-sm text-[#e35d5d]">{p.error}</p>}
            <div className="flex flex-wrap gap-2">
              {p.hasPanel && p.running && (
                <button type="button" className={btnSmall} onClick={() => setOpen(open === p.id ? null : p.id)}>{open === p.id ? "Ayarları gizle" : "Ayarlar ve istatistik"}</button>
              )}
              <button type="button" disabled={busy} className={btnSmall} onClick={() => run(p.enabled ? "Kapatıldı." : "Açıldı.", async () => { await api(`/api/admin/plugins/${p.id}`, { method: "PATCH", body: { enabled: !p.enabled } }); reload(); })}>
                {p.enabled ? "Kapat" : "Aç"}
              </button>
              <button type="button" disabled={busy} className={btnSmall} onClick={() => run("Yeniden başlatıldı.", async () => { await api(`/api/admin/plugins/${p.id}/restart`, { method: "POST" }); reload(); })}>Yeniden başlat</button>
              <button
                type="button"
                disabled={busy}
                className={btnDangerOutline}
                onClick={() => run("Paket kaldırıldı.", async () => {
                  if (!window.confirm(`${p.name} kaldırılsın mı? Etkinlik kartı da silinir (oyun verileri veritabanında kalır).`)) return false;
                  await api(`/api/admin/plugins/${p.id}`, { method: "DELETE" });
                  setOpen(null);
                  reload();
                })}
              >
                Kaldır
              </button>
            </div>
            {open === p.id && <PluginPanel id={p.id} />}
          </Card>
        ))}
      </div>
    </div>
  );
}

const show = (f: FieldDef, v: unknown) => (f.type === "number" && f.scale ? String(Math.round(Number(v ?? 0) * f.scale * 1000) / 1000) : v == null ? "" : String(v));

/** Paketin kendi yönetim şeması: istatistik kartları, ayar alanları, işlemler ve tablolar paketten gelir. */
function PluginPanel({ id }: { id: string }) {
  const base = `/api/admin/plugins/${id}/panel`;
  const { data, error, loading, reload } = useApi<Schema>(`${base}/`);
  const { busy, msg, run } = useAction();
  const [vals, setVals] = useState<Record<string, string | boolean>>({});

  useEffect(() => {
    if (!data) return;
    const v: Record<string, string | boolean> = {};
    for (const f of data.fields ?? []) v[f.key] = f.type === "bool" ? data.values?.[f.key] === true : show(f, data.values?.[f.key]);
    setVals(v);
  }, [data]);

  useEffect(() => {
    const t = setInterval(reload, 15000);
    return () => clearInterval(t);
  }, [reload]);

  const save = () =>
    run("Kaydedildi.", async () => {
      const body: Record<string, unknown> = {};
      for (const f of data?.fields ?? []) {
        const v = vals[f.key];
        if (f.type === "bool") body[f.key] = v === true;
        else if (f.type === "number") body[f.key] = (Number(v) || 0) / (f.scale || 1);
        else body[f.key] = v;
      }
      await api(`${base}/settings`, { method: "PUT", body });
      reload();
    });

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;
  const fields = data.fields ?? [];
  return (
    <div className="mt-4 space-y-4">
      {data.description && <p className="text-sm text-gray-400">{data.description}</p>}
      {!!data.stats?.length && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {data.stats.map((s) => <StatCard key={s.label} label={s.label} value={s.value} note={s.note} tone={s.tone} />)}
        </div>
      )}
      {fields.length > 0 && (
        <div>
          <div className="grid gap-3 md:grid-cols-2">
            {fields.filter((f) => f.type !== "bool").map((f) => (
              <Field key={f.key} label={f.label} hint={f.hint}>
                {f.type === "select" ? (
                  <select className={selectCls} value={String(vals[f.key] ?? "")} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })}>
                    {(f.options ?? []).map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
                  </select>
                ) : (
                  <input className={inputCls} inputMode={f.type === "number" ? "decimal" : undefined} value={String(vals[f.key] ?? "")} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} />
                )}
              </Field>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-5 text-sm text-gray-300">
            {fields.filter((f) => f.type === "bool").map((f) => (
              <label key={f.key} className="flex items-center gap-2"><input type="checkbox" checked={vals[f.key] === true} onChange={(e) => setVals({ ...vals, [f.key]: e.target.checked })} /> {f.label}</label>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {fields.length > 0 && <button type="button" disabled={busy} className={btnSmall} onClick={save}>Kaydet</button>}
        {(data.actions ?? []).map((a) => (
          <button key={a.id} type="button" disabled={busy} className={btnSmall} onClick={() => run("Tamam.", async () => {
            if (a.confirm && !window.confirm(a.confirm)) return false;
            await api(`${base}/actions/${a.id}`, { method: "POST" });
            reload();
          })}>{a.label}</button>
        ))}
      </div>
      <ActionMsg msg={msg} />
      {(data.tables ?? []).map((t) => (
        <div key={t.title}>
          <p className="mb-1 text-sm font-semibold text-white">{t.title}</p>
          {t.subtitle && <p className="mb-2 text-xs text-gray-500">{t.subtitle}</p>}
          {t.rows.length === 0 ? (
            <p className="text-sm text-gray-500">{t.empty ?? "Kayıt yok."}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-300">
                <thead className="text-xs text-gray-500"><tr>{t.columns.map((c) => <th key={c} className="py-1 pr-3">{c}</th>)}</tr></thead>
                <tbody>{t.rows.map((r, i) => <tr key={i} className="border-t border-[#30291e]">{r.map((c, j) => <td key={j} className="py-1 pr-3">{c}</td>)}</tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
