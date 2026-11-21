"use client";

import { useState, type FormEvent } from "react";
import { api, fmtMoney, fmtNumber } from "@/core/api/api";
import { useApi } from "@/core/api/use-api";
import { t } from "@/shared/utils/i18n";
import { Badge, Empty, ErrorBox, Loading, Notice, inputCls } from "@/shared/components/ui";
import { MemberRow, Section, btn, btnGreen, btnRed, currentAgency, dateText, type Member } from "@/modules/agency/shell/common";

type Msg = { tone: "ok" | "error"; text: string } | null;
function useRun(after: () => void) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
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

/** Kullanıcı arama kutusu (asistan ve ajans önerisi için). */
function PickUser({ onPick }: { onPick: (u: Member) => void }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Member[] | null>(null);
  async function search(e: FormEvent) {
    e.preventDefault();
    if (q.trim().length < 2) return;
    const r = await api<{ users: Member[] }>(`/api/users/search?q=${encodeURIComponent(q.trim())}`).catch(() => ({ users: [] as Member[] }));
    setFound(r.users ?? []);
  }
  return (
    <div>
      <form onSubmit={search} className="flex gap-2">
        <input className={`${inputCls} flex-1`} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Kullanıcı ara")} />
        <button type="submit" className="gold-button shrink-0 px-4">
          {t("Ara")}
        </button>
      </form>
      {found && (
        <div className="mt-2 space-y-2">
          {found.length === 0 && <p className="py-2 text-center text-sm text-gray-500">{t("Kullanıcı bulunamadı.")}</p>}
          {found.map((u) => (
            <MemberRow key={u.id} m={u} right={<button type="button" className={btn} onClick={() => { onPick(u); setFound(null); setQ(""); }}>{t("Seç")}</button>} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- Asistanlar ----------------
type Assist = {
  currency: string; maxAssistants: number; maxShareBps: number; inviteDays: number;
  active: { id: string; user: Member; shareBps: number; since: string; hosts: number; amountCents: string }[];
  pending: { id: string; user: Member; shareBps: number; createdAt: string; expiresAt: string }[];
};

export function AgencyAssistants() {
  const ag = currentAgency();
  const { data, error, loading, reload } = useApi<Assist>(ag.id ? `/api/agency-center/${ag.id}/assistants` : null);
  const { busy, msg, run } = useRun(reload);
  const [who, setWho] = useState<Member | null>(null);
  const [pct, setPct] = useState("10");
  const [edit, setEdit] = useState<Record<string, string>>({});
  if (loading && !data) return <Loading label={t("Yükleniyor...")} />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;
  const max = data.maxShareBps / 100;
  const bps = (v: string) => Math.round(Number(v.replace(",", ".")) * 100);
  return (
    <div className="space-y-4">
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Section title={t("Asistanlar ({n}/{m})", { n: data.active.length + data.pending.length, m: data.maxAssistants })} sub={t("Asistan, davet ettiği yayıncıların priminden belirlediğiniz payı alır (en çok %{p}).", { p: max })}>
        {data.active.length === 0 ? (
          <Empty title={t("Asistan yok.")} />
        ) : (
          <div className="space-y-3">
            {data.active.map((a) => (
              <div key={a.id} className="rounded-xl border border-[#262117] bg-[#141210] p-3">
                <MemberRow m={a.user} sub={t("{n} yayıncı · pay %{p}", { n: a.hosts, p: (a.shareBps / 100).toFixed(0) })} right={<span className="text-sm font-semibold text-sky-300">{fmtMoney(a.amountCents, data.currency)}</span>} />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input className={`${inputCls} w-24`} inputMode="decimal" value={edit[a.id] ?? String(a.shareBps / 100)} onChange={(e) => setEdit({ ...edit, [a.id]: e.target.value })} />
                  <span className="text-xs text-gray-500">%</span>
                  <button type="button" className={btn} disabled={busy} onClick={() => run(() => api(`/api/agency-center/${ag.id}/assistants/${a.id}/share`, { method: "POST", body: { shareBps: bps(edit[a.id] ?? String(a.shareBps / 100)) } }), t("Pay güncellendi."))}>
                    {t("Payı kaydet")}
                  </button>
                  <button
                    type="button"
                    className={btnRed}
                    disabled={busy}
                    onClick={() => {
                      if (!window.confirm(t("Asistanlık sonlandırılsın mı?"))) return;
                      run(() => api(`/api/agency-center/${ag.id}/assistants/${a.id}/remove`, { method: "POST" }), t("Asistanlık sonlandırıldı."));
                    }}
                  >
                    {t("Sonlandır")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {data.pending.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold text-gray-400">{t("Yanıt bekleyen asistan davetleri")}</p>
            {data.pending.map((p) => (
              <MemberRow
                key={p.id}
                m={p.user}
                sub={t("pay %{p} · son gün {d}", { p: (p.shareBps / 100).toFixed(0), d: dateText(p.expiresAt, false) })}
                right={
                  <button type="button" className={btnRed} disabled={busy} onClick={() => run(() => api(`/api/agency-center/${ag.id}/assistants/${p.id}/remove`, { method: "POST" }), t("Davet geri alındı."))}>
                    {t("Geri al")}
                  </button>
                }
              />
            ))}
          </div>
        )}
      </Section>
      <Section title={t("Asistan davet et")} sub={t("Davet {d} gün geçerlidir.", { d: data.inviteDays })}>
        {who ? (
          <div className="space-y-3">
            <MemberRow m={who} right={<button type="button" className="text-xs text-[#f2b92a]" onClick={() => setWho(null)}>{t("Değiştir")}</button>} />
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">{t("Pay")}</span>
              <input className={`${inputCls} w-24`} inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} />
              <span className="text-sm text-gray-400">%</span>
            </div>
            <button
              type="button"
              className="gold-button disabled:opacity-60"
              disabled={busy}
              onClick={() => run(async () => { await api(`/api/agency-center/${ag.id}/assistants/invite`, { method: "POST", body: { userId: who.id, shareBps: bps(pct) } }); setWho(null); }, t("Asistan daveti gönderildi."))}
            >
              {t("Davet gönder")}
            </button>
          </div>
        ) : (
          <PickUser onPick={setWho} />
        )}
      </Section>
    </div>
  );
}

// ---------------- Ajans önerisi (davet primi) ----------------
type Center = {
  code: string | null; referralBps: number; currency: string;
  rewards: { todayCents: string; yesterdayCents: string; monthCents: string; paidCents: string; pendingCents: string };
  invited: { id: string; name: string; status: string; hosts: number; owner: Member; monthDiamonds: string; myRewardCents: string }[];
  applications: { id: string; name: string; status: string; createdAt: string; user: Member }[];
  ranking: { id: string; name: string; invited: number; isMe: boolean }[];
};
const appStatus: Record<string, [string, "gold" | "green" | "red" | "gray"]> = {
  pending: ["İnceleniyor", "gold"],
  approved: ["Onaylandı", "green"],
  rejected: ["Reddedildi", "red"],
  cancelled: ["İptal", "gray"],
};

export function AgencyReferrals() {
  const ag = currentAgency();
  const { data, error, loading, reload } = useApi<Center>(ag.id ? `/api/agency-center/${ag.id}/invite-center` : null);
  const { busy, msg, run } = useRun(reload);
  const [who, setWho] = useState<Member | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  if (loading && !data) return <Loading label={t("Yükleniyor...")} />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;
  const cur = data.currency;
  return (
    <div className="space-y-4">
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Section title={t("Davet primi")} sub={t("Önerdiğiniz ajansların priminden %{p} kazanırsınız.", { p: (data.referralBps / 100).toFixed(0) })}>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg bg-[#1a1712] p-2">
            <p className="text-xs text-gray-500">{t("Bu ay")}</p>
            <p className="font-bold text-emerald-300">{fmtMoney(data.rewards.monthCents, cur)}</p>
          </div>
          <div className="rounded-lg bg-[#1a1712] p-2">
            <p className="text-xs text-gray-500">{t("Bugün")}</p>
            <p className="font-bold text-white">{fmtMoney(data.rewards.todayCents, cur)}</p>
          </div>
          <div className="rounded-lg bg-[#1a1712] p-2">
            <p className="text-xs text-gray-500">{t("Ödenen")}</p>
            <p className="font-bold text-white">{fmtMoney(data.rewards.paidCents, cur)}</p>
          </div>
          <div className="rounded-lg bg-[#1a1712] p-2">
            <p className="text-xs text-gray-500">{t("Bekleyen")}</p>
            <p className="font-bold text-[#f2b92a]">{fmtMoney(data.rewards.pendingCents, cur)}</p>
          </div>
        </div>
      </Section>
      <Section title={t("Önerdiğim ajanslar")}>
        {data.invited.length === 0 ? (
          <Empty title={t("Henüz yok.")} />
        ) : (
          <div className="space-y-2">
            {data.invited.map((x) => (
              <MemberRow key={x.id} m={{ ...x.owner, displayName: x.name }} sub={t("{n} yayıncı · {d} elmas", { n: x.hosts, d: fmtNumber(x.monthDiamonds) })} right={<span className="text-sm font-semibold text-emerald-300">{fmtMoney(x.myRewardCents, cur)}</span>} />
            ))}
          </div>
        )}
      </Section>
      {ag.role === "owner" && (
        <Section title={t("Yeni ajans öner")} sub={t("Yönetim onaylayınca ajans açılır ve davet eden ajans olarak siz kaydedilirsiniz.")}>
          {who ? (
            <div className="space-y-3">
              <MemberRow m={who} right={<button type="button" className="text-xs text-[#f2b92a]" onClick={() => setWho(null)}>{t("Değiştir")}</button>} />
              <input className={inputCls} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={t("Ajans adı")} />
              <input className={inputCls} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder={t("Not (isteğe bağlı)")} />
              <button
                type="button"
                className="gold-button disabled:opacity-60"
                disabled={busy || name.trim().length < 3}
                onClick={() => run(async () => { await api(`/api/agency-center/${ag.id}/referrals`, { method: "POST", body: { userId: who.id, name: name.trim(), note: note.trim() || undefined } }); setWho(null); setName(""); setNote(""); }, t("Öneri gönderildi."))}
              >
                {t("Öner")}
              </button>
            </div>
          ) : (
            <PickUser onPick={setWho} />
          )}
          {data.applications.length > 0 && (
            <div className="mt-4 space-y-2">
              {data.applications.map((a) => {
                const st = appStatus[a.status] ?? [a.status, "gray"];
                return (
                  <MemberRow
                    key={a.id}
                    m={{ ...a.user, displayName: a.name }}
                    sub={dateText(a.createdAt, false)}
                    right={
                      <div className="flex items-center gap-2">
                        <Badge tone={st[1]}>{t(st[0])}</Badge>
                        {a.status === "pending" && (
                          <button type="button" className={btnRed} disabled={busy} onClick={() => run(() => api(`/api/agency-center/${ag.id}/referrals/${a.id}/cancel`, { method: "POST" }), t("Öneri geri alındı."))}>
                            {t("Geri al")}
                          </button>
                        )}
                      </div>
                    }
                  />
                );
              })}
            </div>
          )}
        </Section>
      )}
      {data.ranking.length > 0 && (
        <Section title={t("Davet sıralaması")}>
          <ol className="space-y-1 text-sm">
            {data.ranking.map((r, i) => (
              <li key={r.id} className={`flex justify-between ${r.isMe ? "text-[#f2b92a]" : "text-gray-300"}`}>
                <span>
                  {i + 1}. {r.name}
                </span>
                <span>{r.invited}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}
    </div>
  );
}

// ---------------- Transferler ----------------
type Transfer = {
  id: string; kind: string; status: string; createdAt: string; autoAt?: string | null; note?: string | null;
  direction: "in" | "out"; canDecide: boolean; from: { name: string | null } | null; to: { name: string | null } | null; user?: Member;
};
export const kindText: Record<string, string> = { join: "Katılma", transfer: "Ajans değiştirme", leave: "Ayrılma", removed: "Çıkarıldı" };
export const transferStatus: Record<string, [string, "green" | "gold" | "red" | "gray" | "blue"]> = {
  pending_source: ["Ajans onayı bekliyor", "gold"],
  pending_platform: ["Platform incelemesinde", "blue"],
  approved: ["Onaylandı", "green"],
  rejected: ["Reddedildi", "red"],
  cancelled: ["İptal", "gray"],
};

export function AgencyTransfers() {
  const ag = currentAgency();
  const { data, error, loading, reload } = useApi<{ transfers: Transfer[]; counts: { joined: number; left: number; pending: number } }>(ag.id ? `/api/agency-center/${ag.id}/transfers` : null);
  const { busy, msg, run } = useRun(reload);
  if (loading && !data) return <Loading label={t("Yükleniyor...")} />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;
  function decide(x: Transfer, approve: boolean) {
    let note: string | null = null;
    if (!approve) {
      const typed = window.prompt(t("Reddetme nedeni (isteğe bağlı):"));
      if (typed === null) return;
      note = typed.trim().slice(0, 200) || null;
    } else if (!window.confirm(t("Onaylıyor musunuz?"))) return;
    run(() => api(`/api/agency-transfers/${x.id}/respond`, { method: "POST", body: { approve, ...(note ? { note } : {}) } }), approve ? t("Onaylandı.") : t("Reddedildi."));
  }
  return (
    <div className="space-y-4">
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Section title={t("Transferler")} sub={t("Katılan {a} · Ayrılan {b} · Onay bekleyen {c}", { a: data.counts.joined, b: data.counts.left, c: data.counts.pending })}>
        {data.transfers.length === 0 ? (
          <Empty title={t("Henüz transfer kaydı yok.")} />
        ) : (
          <div className="space-y-2">
            {data.transfers.map((x) => {
              const st = transferStatus[x.status] ?? [x.status, "gray"];
              return (
                <div key={x.id} className="rounded-xl border border-[#262117] bg-[#141210] p-3">
                  <MemberRow m={x.user} sub={`${t(kindText[x.kind] ?? x.kind)} · ${x.from?.name ?? "—"} → ${x.to?.name ?? "—"}`} right={<Badge tone={st[1]}>{t(st[0])}</Badge>} />
                  <p className="mt-2 text-[11px] text-gray-500">
                    {dateText(x.createdAt)}
                    {x.status === "pending_source" && x.autoAt ? ` · ${t("Otomatik onay: {d}", { d: dateText(x.autoAt) })}` : ""}
                  </p>
                  {x.canDecide && (
                    <div className="mt-2 flex gap-2">
                      <button type="button" className={btnGreen} disabled={busy} onClick={() => decide(x, true)}>
                        {t("Onayla")}
                      </button>
                      <button type="button" className={btnRed} disabled={busy} onClick={() => decide(x, false)}>
                        {t("Reddet")}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}
