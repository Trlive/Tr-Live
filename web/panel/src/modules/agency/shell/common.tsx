"use client";

import { getSession } from "@/core/api/api";
import { locale, t } from "@/shared/utils/i18n";
import { Avatar } from "@/modules/admin/users/user-picker";

/** Oturumdaki ajans (web girişinde ya da uygulama içi oturumda belirlenir). */
export function currentAgency() {
  const s = getSession("agency");
  return { id: s?.agencyId ?? "", name: s?.agencyName ?? "", role: s?.agencyRole ?? "assistant" };
}

export type Period = { key: string; startsAt: string; endsAt: string; daysLeft?: number };
export type Member = { id: string; username?: string; displayName?: string; avatarUrl?: string | null; publicId?: string | null };

export function periodText(p?: Period | null) {
  if (!p) return "";
  const f = (v: string) => new Date(v).toLocaleDateString(locale(), { day: "2-digit", month: "long" });
  const end = new Date(new Date(p.endsAt).getTime() - 1000).toISOString();
  return `${f(p.startsAt)} – ${f(end)}${p.daysLeft != null ? ` · ${t("{n} gün kaldı", { n: p.daysLeft })}` : ""}`;
}

export function dateText(v?: string | null, withTime = true) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(locale(), withTime ? { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function durationText(seconds: unknown) {
  const s = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? t("{h} sa {m} dk", { h, m }) : t("{m} dk", { m });
}

export function MemberRow({ m, sub, right }: { m: Member | null | undefined; sub?: React.ReactNode; right?: React.ReactNode }) {
  const name = m?.displayName || m?.username || "—";
  return (
    <div className="flex items-center gap-3">
      <Avatar url={m?.avatarUrl} name={name} size={38} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{name}</p>
        <p className="truncate text-xs text-gray-500">{sub ?? `ID ${m?.publicId ?? "—"}`}</p>
      </div>
      {right}
    </div>
  );
}

/** Küçük istatistik kutusu (mobilde iki sütun). */
export function Tile({ label, value, note, tone = "gold" }: { label: string; value: React.ReactNode; note?: React.ReactNode; tone?: "gold" | "green" | "red" | "blue" }) {
  const c = { gold: "text-[#f2b92a]", green: "text-emerald-300", red: "text-red-300", blue: "text-sky-300" }[tone];
  return (
    <div className="rounded-2xl border border-[#30291e] bg-[#141210] p-3.5">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`mt-1 text-lg font-bold ${c}`}>{value}</p>
      {note && <p className="mt-0.5 text-[11px] leading-4 text-gray-500">{note}</p>}
    </div>
  );
}

export function Section({ title, sub, action, children }: { title: string; sub?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#30291e] bg-[#111111] p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-white">{title}</h3>
          {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export const btn = "rounded-xl border border-[#4b3c22] bg-[#17140e] px-3.5 py-2 text-sm text-[#f2b92a] disabled:opacity-50";
export const btnRed = "rounded-xl border border-red-500/40 px-3.5 py-2 text-sm text-red-300 disabled:opacity-50";
export const btnGreen = "rounded-xl border border-emerald-500/40 px-3.5 py-2 text-sm text-emerald-300 disabled:opacity-50";
