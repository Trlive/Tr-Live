"use client";

import { useMemo, useState, type FormEvent } from "react";
import { api, appMessage, fmtMoney, fmtNumber, inApp } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { t } from "@/lib/i18n";
import { Badge, Empty, ErrorBox, Loading, Notice, inputCls } from "@/components/ui";
import { MemberRow, Section, btn, btnRed, currentAgency, dateText, durationText, periodText, type Member, type Period } from "./common";

type Host = Member & {
  liveNow: boolean; seconds: number; todaySeconds: number; validDays: number; diamonds: string; changePct: number | null;
  level: number | null; salaryCents: string; agencyCents: string; dropped: boolean; behindDays: boolean; isNew: boolean;
  next: { level: number; remaining: string } | null; joinedAt?: string | null; invitedBy?: { id: string; displayName?: string } | null;
};
type HostsResp = { role: string; period: Period; currency: string; requirements: { validDayMinutes: number; minDays: number | null }; hosts: Host[] };
type Req = { id: string; direction: string; createdAt: string; user: Member };
type Filter = "all" | "live" | "new" | "risk" | "dropped";

/** Yayıncılarım: her yayıncının bu dönemki yayın süresi, geçerli günü, elması, maaşı ve ajans primi; davet ve çıkarma. */
export default function AgencyHosts() {
  const ag = currentAgency();
  const { data, error, loading, reload } = useApi<HostsResp>(ag.id ? `/api/agency-center/${ag.id}/hosts` : null);
  const reqs = useApi<{ requests: Req[] }>(ag.id ? `/api/agencies/${ag.id}/requests` : null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const owner = data?.role !== "assistant";
  const cur = data?.currency ?? "USD";

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data?.hosts ?? []).filter((h) => {
      if (s && !`${h.displayName ?? ""} ${h.username ?? ""} ${h.publicId ?? ""}`.toLowerCase().includes(s)) return false;
      if (filter === "live") return h.liveNow;
      if (filter === "new") return h.isNew;
      if (filter === "risk") return h.behindDays;
      if (filter === "dropped") return h.dropped;
      return true;
    });
  }, [data, q, filter]);

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ tone: "ok", text: ok });
      reload();
      reqs.reload();
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : t("İşlem başarısız.") });
    } finally {
      setBusy(false);
    }
  }

  const invites = (reqs.data?.requests ?? []).filter((r) => r.direction === "invite");
  const count = (f: Filter) => (data?.hosts ?? []).filter((h) => (f === "live" ? h.liveNow : f === "new" ? h.isNew : f === "risk" ? h.behindDays : f === "dropped" ? h.dropped : true)).length;

  return (
    <div className="space-y-4">
      <InviteBox agencyId={ag.id} onDone={() => reqs.reload()} />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {invites.length > 0 && (
        <Section title={t("Yanıt bekleyen davetler")} sub={t("Kabul edince ajansınıza katılır.")}>
          <div className="space-y-3">
            {invites.map((r) => (
              <MemberRow
                key={r.id}
                m={r.user}
                sub={dateText(r.createdAt)}
                right={
                  <button type="button" className={btnRed} disabled={busy} onClick={() => act(() => api(`/api/agency-center/${ag.id}/invites/${r.id}/cancel`, { method: "POST" }), t("Davet geri alındı."))}>
                    {t("Geri al")}
                  </button>
                }
              />
            ))}
          </div>
        </Section>
      )}
      {loading && !data && <Loading label={t("Yükleniyor...")} />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && (
        <Section
          title={t("Yayıncılarım ({n})", { n: data.hosts.length })}
          sub={`${periodText(data.period)}${data.role === "assistant" ? ` · ${t("davet ettikleriniz")}` : ""}`}
        >
          <input className={`${inputCls} mb-3`} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Ad veya ID ara")} />
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {(
              [
                ["all", t("Tümü")],
                ["live", t("Canlı")],
                ["new", t("Yeni")],
                ["risk", t("Gün riski")],
                ["dropped", t("Düşüşte")],
              ] as [Filter, string][]
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs ${filter === k ? "bg-[#292114] text-[#f2b92a] ring-1 ring-[#8c713d]" : "border border-[#30291e] text-gray-400"}`}
              >
                {l} · {count(k)}
              </button>
            ))}
          </div>
          {list.length === 0 ? (
            <Empty title={t("Yayıncı bulunamadı.")} />
          ) : (
            <div className="space-y-2">
              {list.map((h) => (
                <div key={h.id} className="rounded-xl border border-[#262117] bg-[#141210] p-3">
                  <button type="button" className="w-full text-start" onClick={() => setOpen(open === h.id ? null : h.id)}>
                    <MemberRow
                      m={h}
                      sub={
                        <span className="flex flex-wrap gap-1">
                          {h.liveNow && <Badge tone="green">{t("Canlı")}</Badge>}
                          {h.isNew && <Badge tone="blue">{t("Yeni")}</Badge>}
                          {h.dropped && <Badge tone="red">{t("Düşüşte")}</Badge>}
                          {h.behindDays && <Badge tone="red">{t("Gün riski")}</Badge>}
                          {!h.liveNow && !h.isNew && !h.dropped && !h.behindDays && `ID ${h.publicId ?? "—"}`}
                        </span>
                      }
                      right={
                        <div className="text-end">
                          <p className="text-sm font-bold text-[#f2b92a]">{fmtNumber(h.diamonds)}</p>
                          <p className="text-[11px] text-gray-500">{durationText(h.seconds)}</p>
                        </div>
                      }
                    />
                  </button>
                  {open === h.id && (
                    <div className="mt-3 space-y-3 border-t border-[#262117] pt-3">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <Info k={t("Yayın süresi (dönem)")} v={durationText(h.seconds)} />
                        <Info k={t("Bugün yayın")} v={durationText(h.todaySeconds)} />
                        <Info k={t("Geçerli gün")} v={String(h.validDays)} />
                        <Info k={t("Elmas (dönem)")} v={`${fmtNumber(h.diamonds)}${h.changePct != null ? ` (%${h.changePct})` : ""}`} />
                        <Info k={t("Seviye")} v={h.level ? String(h.level) : "—"} />
                        <Info k={t("Sonraki seviye")} v={h.next ? t("{n} elmas kaldı", { n: fmtNumber(h.next.remaining) }) : "—"} />
                        <Info k={t("Tahmini maaş")} v={fmtMoney(h.salaryCents, cur)} />
                        <Info k={t("Ajans primi")} v={fmtMoney(h.agencyCents, cur)} />
                        {h.joinedAt && <Info k={t("Katılma")} v={dateText(h.joinedAt, false)} />}
                        {h.invitedBy?.displayName && <Info k={t("Davet eden")} v={h.invitedBy.displayName} />}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {inApp() && (
                          <button type="button" className={btn} onClick={() => appMessage({ type: "open", screen: "profile", userId: h.id })}>
                            {t("Profili aç")}
                          </button>
                        )}
                        {owner && (
                          <button
                            type="button"
                            className={btnRed}
                            disabled={busy}
                            onClick={() => {
                              if (!window.confirm(t("{n} ajanstan çıkarılsın mı?", { n: h.displayName || h.username || "" }))) return;
                              act(() => api(`/api/agencies/${ag.id}/broadcasters/${h.id}/remove`, { method: "POST" }), t("Yayıncı ajanstan çıkarıldı."));
                            }}
                          >
                            {t("Ajanstan çıkar")}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] text-gray-500">
            {t("Geçerli gün: günde en az {m} dk yayın.", { m: data.requirements?.validDayMinutes ?? 60 })}
          </p>
        </Section>
      )}
    </div>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg bg-[#1a1712] p-2">
      <p className="text-gray-500">{k}</p>
      <p className="mt-0.5 font-semibold text-white">{v}</p>
    </div>
  );
}

/** Kullanıcı arayıp yayıncı daveti gönderir. */
export function InviteBox({ agencyId, onDone }: { agencyId: string; onDone: () => void }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Member[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  async function search(e: FormEvent) {
    e.preventDefault();
    if (q.trim().length < 2) {
      setMsg({ tone: "error", text: t("Aramak için en az 2 karakter girin.") });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ users: Member[] }>(`/api/users/search?q=${encodeURIComponent(q.trim())}`);
      setFound(r.users ?? []);
    } catch (err) {
      setMsg({ tone: "error", text: err instanceof Error ? err.message : t("İşlem başarısız.") });
    } finally {
      setBusy(false);
    }
  }
  async function invite(u: Member) {
    setBusy(true);
    setMsg(null);
    try {
      await api(`/api/agency-center/${agencyId}/invite`, { method: "POST", body: { userId: u.id } });
      setMsg({ tone: "ok", text: t("{n} kişisine yayıncı daveti gönderildi.", { n: u.displayName || u.username || "" }) });
      setFound(null);
      setQ("");
      onDone();
    } catch (err) {
      setMsg({ tone: "error", text: err instanceof Error ? err.message : t("İşlem başarısız.") });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Section title={t("Yayıncı davet et")} sub={t("Kullanıcı adı, görünen ad veya ID ile arayın.")}>
      <form onSubmit={search} className="flex gap-2">
        <input className={`${inputCls} flex-1`} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Kullanıcı ara")} />
        <button type="submit" className="gold-button shrink-0 px-4" disabled={busy}>
          {t("Ara")}
        </button>
      </form>
      {msg && (
        <div className="mt-3">
          <Notice tone={msg.tone}>{msg.text}</Notice>
        </div>
      )}
      {found && (
        <div className="mt-3 space-y-2">
          {found.length === 0 && <p className="py-3 text-center text-sm text-gray-500">{t("Kullanıcı bulunamadı.")}</p>}
          {found.map((u) => (
            <MemberRow
              key={u.id}
              m={u}
              right={
                <button type="button" className={btn} disabled={busy} onClick={() => invite(u)}>
                  {t("Davet et")}
                </button>
              }
            />
          ))}
        </div>
      )}
    </Section>
  );
}
