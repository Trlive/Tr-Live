"use client";

import { fmtMoney, fmtNumber } from "@/core/api/api";
import { useApi } from "@/core/api/use-api";
import { t } from "@/shared/utils/i18n";
import { Badge, Empty, ErrorBox, Loading } from "@/shared/components/ui";
import { Section, Tile, currentAgency, dateText, periodText, type Period } from "@/modules/agency/shell/common";

type Earnings = {
  role: string;
  period: Period;
  currency: string;
  days: { day: string; diamonds: string; primCents: string }[];
  hosts: { id: string; displayName?: string; publicId?: string; agencyDiamonds: string; level: number | null; agencyCents: string; inAgency: boolean }[];
  totals: { commissionCents?: string; assistantCents?: string; ownerCents?: string; teamDiamonds?: string; baseCents?: string; myCents?: string; shareBps?: number };
  assistants: { id: string; displayName?: string; shareBps: number; hosts: number; amountCents: string }[];
  statements: { id: string; periodKey: string; status: string; commissionCents?: string; ownerCents?: string; amountCents?: string; paidAt?: string | null }[];
};

const statusText: Record<string, [string, "green" | "gold" | "gray"]> = {
  paid: ["Ödendi", "green"],
  pending: ["Bekliyor", "gold"],
  void: ["İptal", "gray"],
};

/** Ajans kazançları: bu dönemin primi, günlük elmas grafiği, yayıncı bazında prim, asistan payları, geçmiş dönemler. */
export default function AgencyEarnings() {
  const ag = currentAgency();
  const { data, error, loading, reload } = useApi<Earnings>(ag.id ? `/api/agency-center/${ag.id}/earnings` : null);
  if (loading && !data) return <Loading label={t("Yükleniyor...")} />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;
  const cur = data.currency ?? "USD";
  const owner = data.role !== "assistant";
  const maxD = Math.max(1, ...data.days.map((d) => Number(d.diamonds) || 0));
  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">{periodText(data.period)}</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {owner ? (
          <>
            <Tile label={t("Toplam ajans primi")} value={fmtMoney(data.totals.commissionCents, cur)} note={t("Takım elması: {n}", { n: fmtNumber(data.totals.teamDiamonds) })} />
            <Tile label={t("Asistan payları")} value={fmtMoney(data.totals.assistantCents, cur)} tone="blue" />
            <Tile label={t("Size kalan (tahmini)")} value={fmtMoney(data.totals.ownerCents, cur)} tone="green" />
          </>
        ) : (
          <>
            <Tile label={t("Yayıncılarımın primi")} value={fmtMoney(data.totals.baseCents, cur)} />
            <Tile label={t("Pay oranım")} value={`%${((data.totals.shareBps ?? 0) / 100).toFixed(0)}`} tone="blue" />
            <Tile label={t("Tahmini payım")} value={fmtMoney(data.totals.myCents, cur)} tone="green" />
          </>
        )}
      </div>
      <Section title={t("Günlük elmas")}>
        {data.days.length === 0 ? (
          <Empty title={t("Bu dönemde henüz veri yok.")} />
        ) : (
          <div className="flex h-36 items-end gap-[3px]" dir="ltr">
            {data.days.map((d) => (
              <div key={d.day} className="flex min-w-0 flex-1 flex-col items-center justify-end" title={`${d.day}: ${fmtNumber(d.diamonds)}`}>
                <div className="w-full rounded-t" style={{ height: `${Math.max(2, Math.round(((Number(d.diamonds) || 0) / maxD) * 120))}px`, background: "linear-gradient(to top,#8c6a2a,#f2d28b)" }} />
                <span className="mt-1 text-[8px] text-gray-600">{d.day.slice(-2)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
      <Section title={t("Yayıncı bazında prim")}>
        {data.hosts.length === 0 ? (
          <Empty title={t("Kayıt yok.")} />
        ) : (
          <div className="divide-y divide-[#262117]">
            {data.hosts.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate text-white">
                    {h.displayName ?? "—"} {!h.inAgency && <span className="text-xs text-gray-500">({t("ayrıldı")})</span>}
                  </p>
                  <p className="text-xs text-gray-500">
                    {fmtNumber(h.agencyDiamonds)} {t("elmas")} · {h.level ? t("Seviye {n}", { n: h.level }) : "—"}
                  </p>
                </div>
                <p className="shrink-0 font-semibold text-[#f2b92a]">{fmtMoney(h.agencyCents, cur)}</p>
              </div>
            ))}
          </div>
        )}
      </Section>
      {owner && data.assistants.length > 0 && (
        <Section title={t("Asistanlar")}>
          <div className="divide-y divide-[#262117]">
            {data.assistants.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div>
                  <p className="text-white">{a.displayName ?? "—"}</p>
                  <p className="text-xs text-gray-500">{t("{n} yayıncı · pay %{p}", { n: a.hosts, p: (a.shareBps / 100).toFixed(0) })}</p>
                </div>
                <p className="font-semibold text-sky-300">{fmtMoney(a.amountCents, cur)}</p>
              </div>
            ))}
          </div>
        </Section>
      )}
      <Section title={t("Geçmiş dönemler")}>
        {data.statements.length === 0 ? (
          <Empty title={t("Henüz kapanmış dönem yok.")} />
        ) : (
          <div className="divide-y divide-[#262117]">
            {data.statements.map((s) => {
              const st = statusText[s.status] ?? [s.status, "gray"];
              return (
                <div key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div>
                    <p className="text-white">{s.periodKey}</p>
                    <p className="text-xs text-gray-500">{s.paidAt ? dateText(s.paidAt, false) : "—"}</p>
                  </div>
                  <div className="text-end">
                    <p className="font-semibold text-white">{fmtMoney(owner ? s.ownerCents ?? s.commissionCents : s.amountCents, cur)}</p>
                    <Badge tone={st[1]}>{t(st[0])}</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}
