"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { Card, ErrorBox, Loading, inputCls } from "@/components/ui";
import { ActionMsg, Field, useAction } from "./kit";

/** Ayar alanı: bool → anahtar, int → sayı. scale: ekranda gösterilen = kayıtlı / scale (ör. sent → dolar için 100). */
export type ConfigField = { key: string; label: string; type: "bool" | "int"; hint?: string; scale?: number; suffix?: string };

/** Uygulama ayarlarının bir bölümünü düzenler (GET/PUT /api/admin/app-config). Yalnızca verilen anahtarlar gönderilir. */
export function ConfigForm({ title, subtitle, fields, onSaved }: { title: string; subtitle?: string; fields: ConfigField[]; onSaved?: () => void }) {
  const { data, error, loading, reload } = useApi<{ config: Record<string, unknown> }>("/api/admin/app-config");
  const { busy, msg, run } = useAction();
  const [vals, setVals] = useState<Record<string, string | boolean>>({});

  useEffect(() => {
    if (!data) return;
    const v: Record<string, string | boolean> = {};
    for (const f of fields) {
      const raw = data.config[f.key];
      v[f.key] = f.type === "bool" ? raw === true : raw == null ? "" : String(Number(raw) / (f.scale ?? 1));
    }
    setVals(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  function save() {
    run("Kaydedildi.", async () => {
      const body: Record<string, unknown> = {};
      for (const f of fields) {
        const v = vals[f.key];
        if (f.type === "bool") body[f.key] = v === true;
        else {
          const n = Number(String(v ?? "").replace(",", "."));
          if (!Number.isFinite(n)) throw new Error(`${f.label}: sayı girin.`);
          body[f.key] = Math.round(n * (f.scale ?? 1));
        }
      }
      await api("/api/admin/app-config", { method: "PUT", body });
      reload();
      onSaved?.();
    });
  }

  return (
    <Card title={title} subtitle={subtitle}>
      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {fields.map((f) =>
              f.type === "bool" ? (
                <label key={f.key} className="flex items-start gap-3 rounded-xl border border-[#30291e] p-3 text-sm text-gray-200 md:col-span-2">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#d7b56d]" checked={vals[f.key] === true} onChange={(e) => setVals({ ...vals, [f.key]: e.target.checked })} />
                  <span>
                    {f.label}
                    {f.hint && <span className="mt-0.5 block text-xs text-gray-500">{f.hint}</span>}
                  </span>
                </label>
              ) : (
                <Field key={f.key} label={f.suffix ? `${f.label} (${f.suffix})` : f.label} hint={f.hint}>
                  <input className={inputCls} inputMode="decimal" value={String(vals[f.key] ?? "")} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} />
                </Field>
              )
            )}
          </div>
          <ActionMsg msg={msg} />
          <button type="button" className="gold-button disabled:opacity-60" disabled={busy} onClick={save}>
            {busy ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      )}
    </Card>
  );
}
