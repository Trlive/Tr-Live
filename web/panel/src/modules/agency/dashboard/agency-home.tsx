"use client";

import { useEffect, useState } from "react";
import { Crown, Trophy } from "lucide-react";
import { api, fmtMoney, fmtNumber } from "@/core/api/api";
import { useApi } from "@/core/api/use-api";
import { t } from "@/shared/utils/i18n";
import { ErrorBox, Loading, Notice, inputCls } from "@/shared/components/ui";
import { Section, Tile, btn, currentAgency, periodText, type Period } from "@/modules/agency/shell/common";

type Home = {
  role: string;
  agency: { name: string; agencyCode?: string | null; status: string; broadcasterCount: number; announcement?: string | null; assistantsCanAnnounce?: boolean };
  period: Period;
  currency: string;
  earnings: { monthCents?: string; todayCents?: string; yesterdayCents?: string; myCents?: string; myHosts?: number; shareBps?: number };
  stats: {
    monthDiamonds: string; changePct: number | null; todayDiamonds: string; yesterdayDiamonds: string;
    broadcasters: number; activeToday: number; liveNow: number; newThisMonth: number; dropped: number; behindDays: number; qualified: number;
  };
  grade: { name: string | null; next: { name: string; remaining: string } | null };
  rank: { rank: number | null; total: number };
  tasks: { key: string; title: string; value: number; target: number }[];
  pendingTransfers: number;
  pendingInvites: number;
};

/** Ajans Merkezi ana sayfası: özet, seviye, sıralama, görevler, duyuru ve asistan yetkisi. */
export default function AgencyHome() {
  const ag = currentAgency();
  const { data, error, loading, reload } = useApi<Home>(ag.id ? `/api/agency-center/${ag.id}/home` : null);
  const owner = data?.role !== "assistant";
  const cur = data?.currency ?? "USD";
  const change = data?.stats.changePct;
  if (loading && !data) return <Loading label={t("Yükleniyor...")} />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#4b3c22] bg-gradient-to-br from-[#2a2010] to-[#111] p-4">
        <p className="text-xs text-[#f2b92a]">{owner ? t("Ajansım") : t("Asistan")}</p>
        <h2 className="mt-1 text-xl font-black text-white">{data.agency.name}</h2>
        <p className="mt-1 text-xs text-gray-400">
          {data.agency.agencyCode ? `${t("Ajans kodu")}: ${data.agency.agencyCode} · ` : ""}
          {periodText(data.period)}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {owner ? (
          <Tile label={t("Bu ay tahmini prim")} value={fmtMoney(data.earnings.monthCents, cur)} note={`${t("Bugün")} +${fmtMoney(data.earnings.todayCents, cur)}`} tone="green" />
        ) : (
          <Tile
            label={t("Bu ay tahmini payım")}
            value={fmtMoney(data.earnings.myCents, cur)}
            note={t("{n} yayıncı · pay %{p}", { n: data.earnings.myHosts ?? 0, p: ((data.earnings.shareBps ?? 0) / 100).toFixed(0) })}
            tone="green"
          />
        )}
        <Tile
          label={t("Bu ay elmas")}
          value={fmtNumber(data.stats.monthDiamonds)}
          note={change == null ? `${t("Bugün")} +${fmtNumber(data.stats.todayDiamonds)}` : t("Geçen aya göre %{p}", { p: change })}
          tone={change != null && change < 0 ? "red" : "gold"}
        />
        <Tile label={t("Yayıncılar")} value={fmtNumber(data.stats.broadcasters)} note={t("Bugün yayında: {a} · Bu ay yeni: {b}", { a: data.stats.activeToday, b: data.stats.newThisMonth })} tone="blue" />
        <Tile label={t("Şu an canlı")} value={fmtNumber(data.stats.liveNow)} note={t("Maaş seviyesine ulaşan: {n}", { n: data.stats.qualified })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-3 rounded-2xl border border-[#30291e] bg-[#141210] p-3.5">
          <Crown className="shrink-0 text-[#f2b92a]" size={26} />
          <div className="min-w-0">
            <p className="text-xs text-gray-400">{t("Ajans seviyesi")}</p>
            <p className="font-bold text-white">{data.grade.name ?? "—"}</p>
            {data.grade.next && <p className="text-[11px] text-gray-500">{t("{g} için {n} elmas", { g: data.grade.next.name, n: fmtNumber(data.grade.next.remaining) })}</p>}
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-[#30291e] bg-[#141210] p-3.5">
          <Trophy className="shrink-0 text-[#f2b92a]" size={26} />
          <div>
            <p className="text-xs text-gray-400">{t("Aylık sıralama")}</p>
            <p className="font-bold text-white">{data.rank.rank ? `${data.rank.rank} / ${data.rank.total}` : t("Sıralamada değil")}</p>
          </div>
        </div>
      </div>
      {(data.stats.dropped > 0 || data.stats.behindDays > 0 || data.pendingTransfers > 0 || data.pendingInvites > 0) && (
        <Section title={t("Dikkat")}>
          <ul className="space-y-1.5 text-sm text-gray-300">
            {data.stats.dropped > 0 && <li>• {t("Düşüşteki yayıncı: {n}", { n: data.stats.dropped })}</li>}
            {data.stats.behindDays > 0 && <li>• {t("Gün şartı riskinde: {n}", { n: data.stats.behindDays })}</li>}
            {owner && data.pendingTransfers > 0 && <li>• {t("Onay bekleyen transfer: {n}", { n: data.pendingTransfers })}</li>}
            {data.pendingInvites > 0 && <li>• {t("Yanıt bekleyen davet: {n}", { n: data.pendingInvites })}</li>}
          </ul>
        </Section>
      )}
      {data.tasks.length > 0 && (
        <Section title={t("Görevler")}>
          <div className="space-y-3">
            {data.tasks.map((x) => {
              const pct = Math.min(100, Math.round((x.value / Math.max(1, x.target)) * 100));
              return (
                <div key={x.key}>
                  <div className="flex justify-between text-sm text-gray-300">
                    <span>{t(x.title)}</span>
                    <span className="font-semibold text-white">
                      {x.value} / {x.target}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 rounded-full bg-[#2a2418]">
                    <div className="h-2 rounded-full bg-[#f2b92a]" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}
      <Announcement agencyId={ag.id} current={data.agency.announcement ?? ""} canEdit={owner || data.agency.assistantsCanAnnounce === true} onDone={reload} />
      {owner && <AssistantPerm agencyId={ag.id} value={data.agency.assistantsCanAnnounce === true} onDone={reload} />}
    </div>
  );
}

function Announcement({ agencyId, current, canEdit, onDone }: { agencyId: string; current: string; canEdit: boolean; onDone: () => void }) {
  const [text, setText] = useState(current);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  useEffect(() => setText(current), [current]);
  return (
    <Section title={t("Ajans duyurusu")} sub={canEdit ? t("Kaydedince ajansınızdaki tüm yayıncılara bildirim gider.") : undefined}>
      {canEdit ? (
        <div className="space-y-2">
          <textarea className={`${inputCls} min-h-24`} value={text} maxLength={200} onChange={(e) => setText(e.target.value)} placeholder={t("Yayıncılarınıza duyuru yazın")} />
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
          <button
            type="button"
            className={btn}
            disabled={busy || text.trim() === current.trim()}
            onClick={async () => {
              setBusy(true);
              setMsg(null);
              try {
                await api(`/api/agency-center/${agencyId}/announcement`, { method: "POST", body: { text: text.trim() } });
                setMsg({ tone: "ok", text: t("Duyuru kaydedildi.") });
                onDone();
              } catch (e) {
                setMsg({ tone: "error", text: e instanceof Error ? e.message : t("İşlem başarısız.") });
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("Kaydet")}
          </button>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-sm text-gray-300">{current || t("Duyuru yok.")}</p>
      )}
    </Section>
  );
}

function AssistantPerm({ agencyId, value, onDone }: { agencyId: string; value: boolean; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Section title={t("Asistan yetkileri")}>
      <label className="flex items-center justify-between gap-4 text-sm text-gray-300">
        {t("Asistanlar duyuru yazabilsin")}
        <input
          type="checkbox"
          className="h-5 w-5 accent-[#f2b92a]"
          checked={value}
          disabled={busy}
          onChange={async (e) => {
            setBusy(true);
            try {
              await api(`/api/agency-center/${agencyId}/settings`, { method: "POST", body: { assistantsCanAnnounce: e.target.checked } });
              onDone();
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
    </Section>
  );
}
