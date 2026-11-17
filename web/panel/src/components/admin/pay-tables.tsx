"use client";

import { useEffect, useState } from "react";
import { Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { api, fmtMoney } from "@/lib/api";
import { Card, inputCls, tableCls, tableWrap, tdCls, thCls } from "@/components/ui";
import { ActionMsg, Tabs, btnGhost, btnSmall, confirmTyped, useAction } from "./kit";

export type PayLevel = {
  level: number; days: number; hours: number; gameHours: number; diamonds: string;
  salary1Cents: string; salary2Cents: string; agencyCents: string;
  vipLevel: number | null; vipDays: number | null; badge: string | null; specialIdDays?: number; specialIdCount?: number;
};
type Row = Record<"days" | "hours" | "gameHours" | "diamonds" | "salary1" | "salary2" | "agency" | "vipLevel" | "vipDays" | "badge" | "specialIdDays" | "specialIdCount", string>;

const BADGES: [string, string][] = [["", "—"], ["bronz", "Bronz"], ["gumus", "Gümüş"], ["altin", "Altın"], ["super", "Süper"], ["ozel", "Özel"]];
const centsToText = (c: string) => {
  const n = BigInt(c || "0");
  const w = n / BigInt(100);
  const f = (n % BigInt(100)).toString().padStart(2, "0");
  return f === "00" ? w.toString() : `${w}.${f}`;
};
/** "12,5" / "12.50" → sent (string). Geçersizse hata. */
function textToCents(v: string, label: string): string {
  const t = v.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) throw new Error(`${label}: tutar geçersiz.`);
  const [w, f = ""] = t.split(".");
  return (BigInt(w) * BigInt(100) + BigInt((f + "00").slice(0, 2))).toString();
}
const toRow = (l: PayLevel): Row => ({
  days: String(l.days ?? 0), hours: String(l.hours ?? 0), gameHours: String(l.gameHours ?? 0), diamonds: String(l.diamonds),
  salary1: centsToText(l.salary1Cents), salary2: centsToText(l.salary2Cents), agency: centsToText(l.agencyCents),
  vipLevel: l.vipLevel ? String(l.vipLevel) : "", vipDays: l.vipDays ? String(l.vipDays) : "", badge: l.badge ?? "",
  specialIdDays: String(l.specialIdDays ?? 0), specialIdCount: String(l.specialIdCount ?? 1),
});

const COLS: [keyof Row, string, string][] = [
  ["days", "Gün", "w-16"], ["hours", "Saat", "w-16"], ["gameHours", "Oyun sa", "w-16"], ["diamonds", "Elmas kotası", "w-32"],
  ["salary1", "Maaş 1", "w-24"], ["salary2", "Maaş 2", "w-24"], ["agency", "Ajans primi", "w-24"],
  ["vipLevel", "WIP", "w-14"], ["vipDays", "WIP gün", "w-16"], ["specialIdDays", "Özel ID gün", "w-16"], ["specialIdCount", "ID adet", "w-14"],
];

/** Sesli ve görüntülü maaş tabloları: satır ekle / sil, kaydet, varsayılana dön. */
export function PayTables({ audio, video, currency, onSaved }: { audio: PayLevel[]; video: PayLevel[]; currency: string; onSaved: () => void }) {
  const [kind, setKind] = useState<"audio" | "video">("audio");
  return (
    <Card title="Yayıncı maaş tabloları" subtitle="Seviye sırası elmas kotasına göre artmalı. Kaydedince açık dönemin tahminleri hemen yeni tabloyla hesaplanır.">
      <Tabs tabs={[{ key: "audio", label: "Sesli oda" }, { key: "video", label: "Görüntülü yayın" }]} value={kind} onChange={setKind} />
      <Editor key={kind} kind={kind} levels={kind === "audio" ? audio : video} currency={currency} onSaved={onSaved} />
    </Card>
  );
}

function Editor({ kind, levels, currency, onSaved }: { kind: "audio" | "video"; levels: PayLevel[]; currency: string; onSaved: () => void }) {
  const [rows, setRows] = useState<Row[]>(() => levels.map(toRow));
  const { busy, msg, run } = useAction();
  useEffect(() => setRows(levels.map(toRow)), [levels]);
  const dirty = JSON.stringify(rows) !== JSON.stringify(levels.map(toRow));
  const set = (i: number, k: keyof Row, v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  function save() {
    run("Maaş tablosu kaydedildi.", async () => {
      const out = rows.map((r, i) => {
        const n = i + 1;
        const int = (v: string, label: string) => {
          if (!/^\d+$/.test(v.trim())) throw new Error(`${n}. seviye ${label}: tam sayı olmalı.`);
          return Number(v.trim());
        };
        if (!/^\d+$/.test(r.diamonds.trim())) throw new Error(`${n}. seviye elmas kotası geçersiz.`);
        return {
          days: int(r.days, "gün"), hours: int(r.hours, "saat"), gameHours: int(r.gameHours || "0", "oyun saati"), diamonds: r.diamonds.trim(),
          salary1Cents: textToCents(r.salary1, `${n}. seviye Maaş 1`), salary2Cents: textToCents(r.salary2, `${n}. seviye Maaş 2`),
          agencyCents: textToCents(r.agency, `${n}. seviye ajans primi`),
          vipLevel: r.vipLevel.trim() ? int(r.vipLevel, "WIP") : null, vipDays: r.vipLevel.trim() ? int(r.vipDays || "0", "WIP günü") : 0,
          badge: r.badge || null, specialIdDays: int(r.specialIdDays || "0", "özel ID günü"), specialIdCount: int(r.specialIdCount || "1", "özel ID adedi"),
        };
      });
      for (let i = 1; i < out.length; i++) {
        if (BigInt(out[i].diamonds) <= BigInt(out[i - 1].diamonds)) throw new Error(`${i + 1}. seviyenin elmas kotası bir öncekinden büyük olmalı.`);
      }
      if (!window.confirm(`${kind === "audio" ? "Sesli" : "Görüntülü"} maaş tablosu (${out.length} seviye) kaydedilsin mi?`)) return false;
      await api("/api/admin/pay-levels", { method: "PUT", body: { kind, levels: out } });
      onSaved();
    });
  }

  function reset() {
    run("Varsayılan tablo yüklendi.", async () => {
      if (!confirmTyped(`${kind === "audio" ? "Sesli" : "Görüntülü"} maaş tablosu varsayılana dönecek.`, "SIFIRLA")) return false;
      await api(`/api/admin/pay-levels/reset?kind=${kind}`, { method: "POST", body: { kind } });
      onSaved();
    });
  }

  const last = rows[rows.length - 1];
  return (
    <div className="space-y-4">
      <div className={tableWrap}>
        <table className={`${tableCls} min-w-[1200px]`}>
          <thead>
            <tr>
              <th className={thCls}>Sv.</th>
              {COLS.map(([k, label]) => (
                <th key={k} className={thCls}>
                  {label}
                </th>
              ))}
              <th className={thCls}>Rozet</th>
              <th className={thCls} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className={`${tdCls} font-semibold text-[#d7b56d]`}>{i + 1}</td>
                {COLS.map(([k, , w]) => (
                  <td key={k} className="border-b border-[#1f1b14] px-1 py-1.5">
                    <input className={`${inputCls} ${w} px-2 py-1.5 text-xs`} value={r[k]} onChange={(e) => set(i, k, e.target.value)} />
                  </td>
                ))}
                <td className="border-b border-[#1f1b14] px-1 py-1.5">
                  <select className={`${inputCls} w-24 px-2 py-1.5 text-xs`} value={r.badge} onChange={(e) => set(i, "badge", e.target.value)}>
                    {BADGES.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="border-b border-[#1f1b14] px-1 py-1.5">
                  <button type="button" aria-label="Seviyeyi sil" className={btnSmall} disabled={rows.length <= 1} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500">
        Tutarlar {currency} cinsinden (ör. 12,50). Örnek: 1. seviye Maaş 1 = {rows[0] ? fmtMoney(safeCents(rows[0].salary1), currency) : "—"}.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={btnGhost}
          disabled={rows.length >= 60}
          onClick={() => setRows([...rows, last ? { ...last, diamonds: String(BigInt(/^\d+$/.test(last.diamonds) ? last.diamonds : "0") + BigInt(1000)) } : toRow(EMPTY)])}
        >
          <Plus size={15} /> Seviye ekle
        </button>
        <button type="button" className="gold-button disabled:opacity-60" disabled={busy || !dirty} onClick={save}>
          <Save size={16} /> Kaydet
        </button>
        {dirty && (
          <button type="button" className={btnGhost} onClick={() => setRows(levels.map(toRow))}>
            Değişiklikleri geri al
          </button>
        )}
        <button type="button" className={btnGhost} disabled={busy} onClick={reset}>
          <RefreshCw size={15} /> Varsayılana dön
        </button>
      </div>
      <ActionMsg msg={msg} />
    </div>
  );
}

const EMPTY: PayLevel = { level: 1, days: 0, hours: 0, gameHours: 0, diamonds: "1000", salary1Cents: "0", salary2Cents: "0", agencyCents: "0", vipLevel: null, vipDays: null, badge: null };
function safeCents(v: string) {
  try {
    return textToCents(v, "");
  } catch {
    return "0";
  }
}
