"use client";

import { useState } from "react";
import { api, appMessage, fmtMoney, fmtNumber, inApp } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { t } from "@/lib/i18n";
import { Badge, Empty, ErrorBox, Loading, Notice } from "@/components/ui";
import { MemberRow, Section, Tile, btn, btnGreen, btnRed, dateText, durationText, periodText } from "./common";
import { kindText, transferStatus } from "./agency-team";

type Side = { seconds: number; validDays: number; diamonds: string; level: number | null; cents: string; shortfall?: boolean };
type Progress = {
  periodKey: string; startsAt: string; endsAt: string; daysLeft: number;
  seconds: number; todaySeconds: number; validDays: number; gameSeconds: number; diamonds: string; balance: string;
  method: number | null; salary1Cents: string; salary2Cents: string;
  tier: number | null; estimatedCents: string; atRisk?: boolean; split: boolean;
  audio: Side; video: Side | null;
  next: { level: number; remaining: string; salaryCents: string } | null;
  blockedBy?: string[]; hoursMet: boolean; eventsMet?: boolean; eventCount?: number; requireOfficialEvents?: boolean; minEventCount?: number;
  payPref: number;
  requirements: { validDayMinutes: number; requireGameHours: boolean; allowBalanceMethod: boolean };
  currency: string;
};
type Transfer = { id: string; kind: string; status: string; createdAt: string; autoAt?: string | null; note?: string | null; from: { name: string | null } | null; to: { name: string | null } | null; canEscalate?: boolean };
type Me = {
  broadcaster: {
    status: string;
    agency: { id: string; name: string; logoUrl?: string | null } | null;
    announcement: { text: string; at: string } | null;
    joinedAgencyAt?: string | null;
    totalDiamonds: string;
    kycStatus: string;
    payPref: number;
    pendingTransfer: Transfer | null;
    rejectedTransfer: Transfer | null;
    progress?: Progress;
    withdrawEligible: boolean;
    unpaidSalaryCents: string;
  } | null;
};
type Invite = { id: string; direction: string; createdAt: string; agency: { id: string; name: string; logoUrl?: string | null }; transfer: boolean };

const kycText: Record<string, [string, "gold" | "green" | "red" | "gray"]> = {
  none: ["Doğrulanmadı", "gray"],
  pending: ["İnceleniyor", "gold"],
  approved: ["Onaylı", "green"],
  rejected: ["Reddedildi", "red"],
};

function useRun(after: () => void) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ tone: "ok", text: ok });
      after();
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : t("İşlem başarısız.") });
    } finally {
      setBusy(false);
    }
  };
  return { busy, msg, run };
}

/** Yayıncı Merkezi: bu dönem yayın süresi, elmas, seviye, tahmini maaş; davetler, ödeme yöntemi, kimlik, ajans işlemleri. */
export function HostHome() {
  const me = useApi<Me>("/api/broadcaster/me");
  const inv = useApi<{ requests: Invite[] }>("/api/broadcaster/requests");
  const reload = () => {
    me.reload();
    inv.reload();
  };
  const { busy, msg, run } = useRun(reload);
  if (me.loading && !me.data) return <Loading label={t("Yükleniyor...")} />;
  if (me.error) return <ErrorBox message={me.error} onRetry={me.reload} />;
  const b = me.data?.broadcaster ?? null;
  const p = b?.progress;
  const cur = p?.currency ?? "USD";
  const invites = (inv.data?.requests ?? []).filter((r) => r.direction === "invite");
  return (
    <div className="space-y-4">
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {invites.map((r) => (
        <Section key={r.id} title={t("Ajans daveti")} sub={r.transfer ? t("Kabul edersen mevcut ajansından bu ajansa geçiş isteği oluşur.") : t("Kabul edersen bu ajansın yayıncısı olursun.")}>
          <MemberRow m={{ id: r.agency.id, displayName: r.agency.name, avatarUrl: r.agency.logoUrl }} sub={dateText(r.createdAt)} />
          <div className="mt-3 flex gap-2">
            <button type="button" className={btnGreen} disabled={busy} onClick={() => run(() => api(`/api/agency-requests/${r.id}/respond`, { method: "POST", body: { accept: true } }), t("Davet kabul edildi."))}>
              {t("Kabul et")}
            </button>
            <button type="button" className={btnRed} disabled={busy} onClick={() => run(() => api(`/api/agency-requests/${r.id}/respond`, { method: "POST", body: { accept: false } }), t("Davet reddedildi."))}>
              {t("Reddet")}
            </button>
          </div>
        </Section>
      ))}
      {(!b || b.status !== "approved") && invites.length === 0 && (
        <Section title={t("Yayıncı Merkezi")}>
          <p className="text-sm text-gray-300">{t("Henüz onaylı bir yayıncı değilsin. Bir ajanstan davet gelince burada görünür; davetler Mesajlar'a da düşer.")}</p>
        </Section>
      )}
      {b && b.status === "approved" && (
        <>
          <div className="rounded-2xl border border-[#4b3c22] bg-gradient-to-br from-[#2a2010] to-[#111] p-4">
            <p className="text-xs text-[#f2b92a]">{t("Ajans")}</p>
            <h2 className="mt-1 text-lg font-black text-white">{b.agency?.name ?? t("Ajansa bağlı değil")}</h2>
            {p && <p className="mt-1 text-xs text-gray-400">{periodText({ key: p.periodKey, startsAt: p.startsAt, endsAt: p.endsAt, daysLeft: p.daysLeft })}</p>}
          </div>
          {b.announcement && (
            <Section title={t("Ajans duyurusu")} sub={dateText(b.announcement.at)}>
              <p className="whitespace-pre-wrap text-sm text-gray-300">{b.announcement.text}</p>
            </Section>
          )}
          {p && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Tile label={t("Yayın süresi (dönem)")} value={durationText(p.seconds)} note={`${t("Bugün")}: ${durationText(p.todaySeconds)}`} tone="blue" />
                <Tile label={t("Geçerli gün")} value={String(p.validDays)} note={t("Günde en az {m} dk", { m: p.requirements.validDayMinutes })} tone="blue" />
                <Tile label={t("Elmas (dönem)")} value={fmtNumber(p.diamonds)} note={p.tier ? t("Seviye {n}", { n: p.tier }) : t("Seviye yok")} />
                <Tile label={t("Tahmini maaş")} value={fmtMoney(p.estimatedCents, cur)} note={p.atRisk ? t("Şartlar eksik: maaş düşebilir") : t("Dönem sonunda kesinleşir")} tone={p.atRisk ? "red" : "green"} />
              </div>
              {p.split && (
                <Section title={t("Sesli / görüntülü")}>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {([[t("Sesli oda"), p.audio], [t("Görüntülü yayın"), p.video]] as const).map(([name, s]) =>
                      s ? (
                        <div key={name} className="rounded-lg bg-[#1a1712] p-2.5">
                          <p className="font-semibold text-white">{name}</p>
                          <p className="mt-1 text-gray-400">{durationText(s.seconds)} · {t("{n} gün", { n: s.validDays })}</p>
                          <p className="text-gray-400">
                            {fmtNumber(s.diamonds)} {t("elmas")} · {s.level ? t("Seviye {n}", { n: s.level }) : "—"}
                          </p>
                          <p className="mt-1 font-semibold text-[#f2b92a]">{fmtMoney(s.cents, cur)}</p>
                          {s.shortfall && <p className="mt-1 text-red-300">{t("Süre şartı eksik: kesinti uygulanır.")}</p>}
                        </div>
                      ) : null
                    )}
                  </div>
                </Section>
              )}
              <Section title={t("Hedef")}>
                {p.next ? (
                  <>
                    <p className="text-sm text-gray-300">{t("Seviye {l} için {n} elmas daha gerekiyor (maaş {s}).", { l: p.next.level, n: fmtNumber(p.next.remaining), s: fmtMoney(p.next.salaryCents, cur) })}</p>
                    {/* Günlük tempo: dönem sonuna kadar kalan günlere bölünmüş hedef (Bigo / Yoho günlük görev gibi). */}
                    {p.daysLeft > 0 && (
                      <p className="mt-1 text-sm font-semibold text-[#f2b92a]">
                        {t("Günde ortalama {n} elmas ile dönem sonunda bu seviyeye ulaşırsın.", { n: fmtNumber(((BigInt(p.next.remaining) + BigInt(p.daysLeft) - BigInt(1)) / BigInt(p.daysLeft)).toString()) })}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-300">{t("En üst seviyedesin.")}</p>
                )}
                {/* Bugünün geçerli gün ilerlemesi: süre çubuğu. */}
                {(() => {
                  const need = p.requirements.validDayMinutes * 60;
                  const pct = need > 0 ? Math.min(100, Math.round((p.todaySeconds / need) * 100)) : 100;
                  const left = Math.max(0, need - p.todaySeconds);
                  return (
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-gray-400">
                        <span>{t("Bugünkü geçerli gün")}</span>
                        <span className={left === 0 ? "text-emerald-300" : ""}>{left === 0 ? t("Tamamlandı") : t("{d} kaldı", { d: durationText(left) })}</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#2a2418]">
                        <div className={`h-full rounded-full ${left === 0 ? "bg-emerald-400" : "bg-[#f2b92a]"}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })()}
                {!p.hoursMet && <p className="mt-2 text-sm text-red-300">{t("Yayın süresi / geçerli gün şartı henüz tamamlanmadı.")}</p>}
                {p.requireOfficialEvents && (
                  <p className={`mt-2 text-sm ${p.eventsMet ? "text-emerald-300" : "text-red-300"}`}>
                    {t("Resmi etkinlik: {a} / {b}", { a: p.eventCount ?? 0, b: p.minEventCount ?? 0 })}
                  </p>
                )}
              </Section>
              {p.requirements.allowBalanceMethod && (
                <Section title={t("Maaş yöntemi")} sub={t("Yöntem 2'de maaş, elmas bakiyenden düşülerek hesaplanır.")}>
                  <div className="grid grid-cols-2 gap-2">
                    {[0, 1].map((v) => (
                      <button
                        key={v}
                        type="button"
                        disabled={busy || b.payPref === v}
                        onClick={() => run(() => api("/api/broadcaster/pay-pref", { method: "POST", body: { pref: v } }), t("Kaydedildi."))}
                        className={`rounded-xl border p-3 text-start text-sm ${b.payPref === v ? "border-[#f2b92a] bg-[#292114] text-white" : "border-[#30291e] text-gray-400"}`}
                      >
                        <p className="font-semibold">{v === 0 ? t("Yöntem 1") : t("Yöntem 2")}</p>
                        <p className="mt-0.5 text-xs">{fmtMoney(v === 0 ? p.salary1Cents : p.salary2Cents, cur)}</p>
                      </button>
                    ))}
                  </div>
                </Section>
              )}
            </>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Tile label={t("Toplam aldığın elmas")} value={fmtNumber(b.totalDiamonds)} />
            <Tile label={t("Ödenmemiş maaş")} value={fmtMoney(b.unpaidSalaryCents, cur)} tone="green" />
          </div>
          <Section title={t("Kimlik doğrulama")} sub={t("Maaşın cüzdanına yatması için gerekir.")}>
            <div className="flex items-center justify-between gap-3">
              <Badge tone={(kycText[b.kycStatus] ?? kycText.none)[1]}>{t((kycText[b.kycStatus] ?? kycText.none)[0])}</Badge>
              {(b.kycStatus === "none" || b.kycStatus === "rejected") && (
                <button type="button" className={btn} disabled={busy} onClick={() => run(() => api("/api/me/kyc/request", { method: "POST" }), t("Başvurun alındı."))}>
                  {t("Doğrulama iste")}
                </button>
              )}
            </div>
          </Section>
          {inApp() && (
            <button type="button" className="gold-button w-full" onClick={() => appMessage({ type: "open", screen: "usd_wallet" })}>
              {t("Fasulye cüzdanını aç")}
            </button>
          )}
          <AgencyActions b={b} busy={busy} run={run} />
        </>
      )}
    </div>
  );
}

function AgencyActions({ b, busy, run }: { b: NonNullable<Me["broadcaster"]>; busy: boolean; run: (fn: () => Promise<unknown>, ok: string) => void }) {
  const tr = b.pendingTransfer;
  const rej = b.rejectedTransfer;
  return (
    <Section title={t("Ajans işlemleri")}>
      {tr && (
        <div className="mb-3 rounded-xl border border-[#30291e] p-3 text-sm">
          <p className="text-white">
            {t(kindText[tr.kind] ?? tr.kind)}: {tr.from?.name ?? "—"} → {tr.to?.name ?? "—"}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {t((transferStatus[tr.status] ?? [tr.status])[0])}
            {tr.autoAt ? ` · ${t("Otomatik onay: {d}", { d: dateText(tr.autoAt) })}` : ""}
          </p>
          <button type="button" className={`${btnRed} mt-2`} disabled={busy} onClick={() => run(() => api(`/api/agency-transfers/${tr.id}/cancel`, { method: "POST" }), t("İstek geri alındı."))}>
            {t("İsteği geri al")}
          </button>
        </div>
      )}
      {rej && rej.canEscalate && (
        <div className="mb-3 rounded-xl border border-red-500/30 p-3 text-sm">
          <p className="text-red-300">{t("Ajansın isteğini reddetti.")}{rej.note ? ` ${rej.note}` : ""}</p>
          <button type="button" className={`${btn} mt-2`} disabled={busy} onClick={() => run(() => api(`/api/agency-transfers/${rej.id}/escalate`, { method: "POST" }), t("İstek platforma iletildi."))}>
            {t("Platforma ilet")}
          </button>
        </div>
      )}
      {b.agency && !tr && (
        <button
          type="button"
          className={btnRed}
          disabled={busy}
          onClick={() => {
            if (!window.confirm(t("Ajanstan ayrılmak istediğine emin misin? Ajansın onayı gerekebilir."))) return;
            run(() => api("/api/broadcaster/leave-agency", { method: "POST" }), t("Ayrılma isteğin gönderildi."));
          }}
        >
          {t("Ajanstan ayrıl")}
        </button>
      )}
      <HostTransfers />
    </Section>
  );
}

function HostTransfers() {
  const { data } = useApi<{ transfers: Transfer[] }>("/api/broadcaster/transfers");
  if (!data?.transfers.length) return null;
  return (
    <div className="mt-4 space-y-1.5">
      <p className="text-xs font-semibold text-gray-400">{t("Geçmiş")}</p>
      {data.transfers.map((x) => (
        <div key={x.id} className="flex justify-between gap-2 text-xs text-gray-400">
          <span>
            {t(kindText[x.kind] ?? x.kind)}: {x.from?.name ?? "—"} → {x.to?.name ?? "—"}
          </span>
          <span>{t((transferStatus[x.status] ?? [x.status])[0])}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------- Geçmiş dönemler ----------------
type St = { id: string; periodKey: string; startsAt: string; endsAt: string; agencyName?: string; seconds: number; validDays: number; diamonds: string; tier: number | null; salaryCents: string; penaltyApplied?: boolean; status: string; paidAt?: string | null };
const stText: Record<string, [string, "green" | "gold" | "gray"]> = { paid: ["Ödendi", "green"], pending: ["Bekliyor", "gold"], void: ["İptal", "gray"] };

export function HostStatements() {
  const { data, error, loading, reload } = useApi<{ statements: St[] }>("/api/broadcaster/statements");
  if (loading && !data) return <Loading label={t("Yükleniyor...")} />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;
  if (!data.statements.length) return <Empty title={t("Henüz kapanmış dönem yok.")} />;
  return (
    <div className="space-y-2">
      {data.statements.map((s) => {
        const st = stText[s.status] ?? [s.status, "gray"];
        return (
          <div key={s.id} className="rounded-2xl border border-[#30291e] bg-[#111111] p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-white">{periodText({ key: s.periodKey, startsAt: s.startsAt, endsAt: s.endsAt })}</p>
              <Badge tone={st[1]}>{t(st[0])}</Badge>
            </div>
            {s.agencyName && <p className="text-xs text-gray-500">{s.agencyName}</p>}
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-400">
              <span>{t("Yayın süresi")}: {durationText(s.seconds)}</span>
              <span>{t("Geçerli gün")}: {s.validDays}</span>
              <span>{t("Elmas")}: {fmtNumber(s.diamonds)}</span>
              <span>{t("Seviye")}: {s.tier ?? "—"}</span>
            </div>
            <p className="mt-2 text-lg font-bold text-[#f2b92a]">{fmtMoney(s.salaryCents)}</p>
            {s.penaltyApplied && <p className="text-xs text-red-300">{t("Şart eksikliği kesintisi uygulandı.")}</p>}
            {s.paidAt && <p className="text-xs text-gray-500">{t("Ödeme: {d}", { d: dateText(s.paidAt, false) })}</p>}
          </div>
        );
      })}
    </div>
  );
}

// ---------------- Maaş tablosu ----------------
type Lvl = { level: number; days: number; hours: number; gameHours: number; diamonds: string; salary1Cents: string; salary2Cents: string; agencyCents: string; vipLevel: number | null; vipDays: number | null; badge: string | null };
type PT = { currency: string; levels: Lvl[]; videoLevels: Lvl[]; split: boolean; badges: Record<string, string>; settings: { allowBalanceMethod: boolean; validDayMinutes: number } };

export function PayTable({ highlight }: { highlight?: number | null }) {
  const { data, error, loading, reload } = useApi<PT>("/api/agency-center/pay-table");
  const [kind, setKind] = useState<"audio" | "video">("audio");
  if (loading && !data) return <Loading label={t("Yükleniyor...")} />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;
  const levels = kind === "video" && data.split ? data.videoLevels : data.levels;
  return (
    <div className="space-y-3">
      {data.split && (
        <div className="flex gap-2">
          {(["audio", "video"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-full px-4 py-1.5 text-sm ${kind === k ? "bg-[#292114] text-[#f2b92a] ring-1 ring-[#8c713d]" : "border border-[#30291e] text-gray-400"}`}>
              {k === "audio" ? t("Sesli oda") : t("Görüntülü yayın")}
            </button>
          ))}
        </div>
      )}
      <div className="space-y-2">
        {levels.map((l) => (
          <div key={l.level} className={`rounded-xl border p-3 text-sm ${highlight === l.level ? "border-[#f2b92a] bg-[#292114]" : "border-[#30291e] bg-[#111111]"}`}>
            <div className="flex items-center justify-between">
              <p className="font-bold text-white">{t("Seviye {n}", { n: l.level })}</p>
              <p className="font-bold text-[#f2b92a]">{fmtMoney(l.salary1Cents, data.currency)}</p>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              {fmtNumber(l.diamonds)} {t("elmas")} · {t("{d} gün · {h} saat", { d: l.days, h: l.hours })}
              {l.gameHours ? ` · ${t("oyun {h} sa", { h: l.gameHours })}` : ""}
            </p>
            {data.settings.allowBalanceMethod && <p className="text-xs text-gray-500">{t("Yöntem 2")}: {fmtMoney(l.salary2Cents, data.currency)}</p>}
            {(l.vipLevel || l.badge) && (
              <p className="text-xs text-sky-300">
                {[l.vipLevel ? `WIP ${l.vipLevel} · ${t("{n} gün", { n: l.vipDays ?? 0 })}` : "", l.badge ? t(data.badges[l.badge] ?? l.badge) : ""].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
