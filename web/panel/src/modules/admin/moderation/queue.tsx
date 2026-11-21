"use client";
import { useState } from "react";
import { api } from "@/core/api/api";
import { useApi } from "@/core/api/use-api";
import { Card, Loading, ErrorBox, inputCls } from "@/shared/components/ui";

type Item = {
  userId: string; displayName: string; username: string | null; avatarUrl: string | null;
  banned: boolean; reports: number; reporters: number; severe: number; strikes: number;
  lastReason: string; oldest: string; newest: string; score: number;
};
type Summary = { open: number; users: number; severe: number; oldest: string | null };
type Evidence = { type?: string; text?: string; authorName?: string; roomName?: string; sentAt?: string; at?: string } | null;
type Report = { id: string; kind: string; reason: string; details: string | null; evidence: Evidence; created_at: string; reporter_name: string | null; room_id: string | null };
type Strike = { kind: string; context: string; sample: string | null; created_at: string };
type Action = { action: string; reason: string; reports_closed: number; created_at: string; moderator_name: string | null };
type Dossier = {
  user: { id: string; display_name: string; username: string | null; account_status: string; banned_until: string | null; ban_reason: string | null; chat_restricted_until: string | null; created_at: string };
  reports: Report[]; strikes: Strike[]; actions: Action[];
};

const REASON_TR: Record<string, string> = {
  spam: "Spam", harassment: "Taciz", sexual: "Müstehcen içerik", violence: "Şiddet",
  child_safety: "Çocuk güvenliği", self_harm: "Kendine zarar", scam: "Dolandırıcılık",
  impersonation: "Kimlik taklidi", illegal: "Yasa dışı", other: "Diğer",
};
const tr = (r: string) => REASON_TR[r] ?? r;
const SEVERE = new Set(["child_safety", "sexual", "harassment", "violence", "self_harm"]);

function age(iso: string) {
  const h = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} dk`;
  if (h < 48) return `${Math.round(h)} sa`;
  return `${Math.round(h / 24)} gün`;
}

/**
 * Moderasyon kuyruğu.
 *
 * Apple ve Google, kullanıcı içeriği barındıran uygulamalarda etkin moderasyon istiyor; bu ekran
 * o şartın karşılığı.
 *
 * Şikâyetler **hedef kullanıcıya göre gruplanıyor**: karar kişi hakkındadır, aynı kişiyle ilgili
 * sekiz şikâyet sekiz ayrı karar gerektirmez. Bir karar, o kişiyle ilgili bütün açık şikâyetleri
 * birlikte kapatır — böylece hiçbiri kuyrukta unutulmaz.
 */
export default function ModerationQueue() {
  const { data, error, loading, reload } = useApi<{ summary: Summary; items: Item[] }>("/api/admin/moderation/queue");
  const [open, setOpen] = useState<string | null>(null);

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;

  const s = data.summary;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span>
            Açık şikâyet: <b className="text-[#d7b56d]">{s.open ?? 0}</b>
          </span>
          <span>
            İlgili kullanıcı: <b>{s.users ?? 0}</b>
          </span>
          {(s.severe ?? 0) > 0 && (
            <span className="text-red-300">
              Ağır nedenli: <b>{s.severe}</b>
            </span>
          )}
          {s.oldest && (
            <span className={age(s.oldest).includes("gün") ? "text-amber-300" : "text-white/60"}>
              En eski bekleyen: {age(s.oldest)}
            </span>
          )}
        </div>
        <div className="mt-2 text-xs text-white/40">
          Sıralama: kaç <b>ayrı kişinin</b> şikâyet ettiği, ağır nedenler, otomatik ihlaller ve
          bekleme süresi. Tek kişinin aynı hesabı defalarca şikâyet etmesi sıralamayı yukarı
          taşımaz — husumet, ihlal değildir.
        </div>
      </Card>

      {data.items.length === 0 ? (
        <Card>
          <div className="py-8 text-center text-white/50">Kuyruk boş. Bekleyen şikâyet yok.</div>
        </Card>
      ) : (
        data.items.map((it) => (
          <Card key={it.userId}>
            <button onClick={() => setOpen(open === it.userId ? null : it.userId)} className="w-full text-left">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{it.displayName}</span>
                    {it.username && <span className="text-xs text-white/40">@{it.username}</span>}
                    {it.banned && <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-xs text-red-200">askıda</span>}
                    {it.severe > 0 && (
                      <span className="rounded bg-red-500/25 px-1.5 py-0.5 text-xs text-red-200">
                        {it.severe} ağır
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-white/60">
                    <b>{it.reporters}</b> kişiden {it.reports} şikâyet
                    {it.strikes > 0 && ` · ${it.strikes} otomatik ihlal (7 gün)`}
                    {" · "}son: {tr(it.lastReason)} · {age(it.oldest)} bekliyor
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-[#d7b56d]">{it.score}</div>
                  <div className="text-[10px] text-white/40">öncelik</div>
                </div>
              </div>
            </button>
            {open === it.userId && <Dossier userId={it.userId} onDone={() => { setOpen(null); reload(); }} />}
          </Card>
        ))
      )}
    </div>
  );
}

function Dossier({ userId, onDone }: { userId: string; onDone: () => void }) {
  const { data } = useApi<Dossier>(`/api/admin/moderation/queue/${userId}`);
  const [action, setAction] = useState("");
  const [reason, setReason] = useState("");
  const [days, setDays] = useState("3");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  if (!data) return <div className="mt-4 text-sm text-white/40">Yükleniyor…</div>;

  async function apply() {
    setBusy(true);
    setMsg("");
    try {
      const r = await api<{ reportsClosed: number }>(`/api/admin/moderation/queue/${userId}/act`, {
        method: "POST",
        body: { action, reason, days: Number(days) || 0, roomId: data?.reports.find((x) => x.room_id)?.room_id ?? null },
      });
      setMsg(`${r.reportsClosed} şikâyet kapatıldı.`);
      setTimeout(onDone, 700);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "İşlem başarısız.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
      <div>
        <div className="mb-2 text-sm font-semibold text-white/80">Açık şikâyetler</div>
        <div className="space-y-2">
          {data.reports.map((r) => (
            <div key={r.id} className="rounded-lg bg-black/25 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className={SEVERE.has(r.reason) ? "font-semibold text-red-300" : "font-semibold"}>{tr(r.reason)}</span>
                <span className="text-xs text-white/40">
                  {r.reporter_name ?? "bilinmiyor"} · {new Date(r.created_at).toLocaleString("tr-TR")}
                </span>
              </div>
              {r.details && <div className="mt-1 text-white/70">{r.details}</div>}
              {r.evidence ? (
                <div className="mt-2 rounded border border-white/10 bg-black/40 p-2">
                  <div className="mb-1 text-[11px] uppercase tracking-wide text-white/40">
                    Şikâyet anındaki içerik
                    {r.evidence.roomName ? ` · ${r.evidence.roomName}` : ""}
                  </div>
                  <div className="whitespace-pre-wrap break-words text-white/85">
                    {r.evidence.text || <span className="text-white/40">(metin yok)</span>}
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-xs text-white/40">
                  Kanıt kopyası yok — bu şikâyet, kopya alma eklenmeden önce oluşturulmuş.
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {data.strikes.length > 0 && (
        <div>
          <div className="mb-2 text-sm font-semibold text-white/80">Otomatik ihlaller</div>
          <div className="space-y-1 text-sm">
            {data.strikes.slice(0, 8).map((s, i) => (
              <div key={i} className="text-white/60">
                {s.kind} · {s.context} · {new Date(s.created_at).toLocaleString("tr-TR")}
                {s.sample && <span className="ml-2 text-white/40">“{s.sample}”</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {data.actions.length > 0 && (
        <div>
          <div className="mb-2 text-sm font-semibold text-white/80">Geçmiş kararlar</div>
          <div className="space-y-1 text-sm text-white/60">
            {data.actions.slice(0, 6).map((a, i) => (
              <div key={i}>
                <b>{a.action}</b> · {a.reason || "—"} · {a.reports_closed} şikâyet ·{" "}
                {a.moderator_name ?? "—"} · {new Date(a.created_at).toLocaleString("tr-TR")}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg bg-white/5 p-3">
        <div className="mb-2 text-sm font-semibold text-white/80">Karar</div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={action} onChange={(e) => setAction(e.target.value)} className={`${inputCls} max-w-[200px]`}>
            <option value="">Seçin</option>
            <option value="dismiss">Sorun yok — kapat</option>
            <option value="warn">Uyarı kaydet</option>
            <option value="mute">Sohbeti kısıtla</option>
            <option value="delete_messages">Şikâyet edilen mesajları sil</option>
            <option value="room_ban">Odadan yasakla</option>
            <option value="suspend">Hesabı askıya al</option>
          </select>
          {(action === "suspend" || action === "mute") && (
            <input
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className={`${inputCls} max-w-[90px]`}
              placeholder={action === "suspend" ? "gün" : "dakika"}
            />
          )}
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Gerekçe (karar sonradan denetlenebilmeli)"
            className={`${inputCls} min-w-[240px] flex-1`}
          />
          <button
            disabled={busy || !action || (action !== "dismiss" && !reason.trim())}
            onClick={apply}
            className="rounded-md bg-[#d7b56d] px-4 py-2 font-medium text-black disabled:opacity-40"
          >
            Uygula
          </button>
        </div>
        <div className="mt-2 text-xs text-white/40">
          Karar, bu kullanıcıyla ilgili <b>bütün açık şikâyetleri</b> birlikte kapatır — hiçbiri
          kuyrukta unutulmasın diye. “Sorun yok” da bir karardır ve kaydedilir: aynı kişi tekrar
          şikâyet edilirse bir sonraki moderatör bunu görür.
        </div>
        {msg && <div className="mt-2 text-sm text-white/80">{msg}</div>}
      </div>
    </div>
  );
}
