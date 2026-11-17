"use client";

import { useState } from "react";
import { Palette } from "lucide-react";
import { api, apiUpload, absoluteUrl, fmtDate, fmtNumber } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, inputCls } from "@/components/ui";
import { ActionMsg, Field, Tabs, btnDangerOutline, btnGhost, btnOk, btnSmall, confirmTyped, selectCls, useAction } from "./kit";
import { UserPicker, type AdminUser } from "./user-picker";

type Theme = { key: string; label: string; colors: string[]; imageUrl: string | null; thumbUrl: string | null; effect: string; priceCoins: string; free: boolean; durationDays: number; sortOrder: number; active: boolean; inUse: number };
type Custom = { id: string; days: number; status: string; imageUrl: string | null; reviewNote: string | null; createdAt: string; username?: string; userId?: string };

export default function AdminRoomThemes() {
  const [tab, setTab] = useState<"themes" | "new" | "custom" | "gift">("themes");
  const t = useApi<{ themes: Theme[]; effects: string[] }>("/api/admin/room-themes");
  const pend = useApi<{ items: Custom[] }>("/api/admin/room-themes/custom?status=pending");
  return (
    <div>
      <PageHeader icon={<Palette size={18} />} kicker="Katalog" title="Oda Temaları" description="Katalog temaları, özel tema onayları ve tema hediye etme." />
      <Tabs
        tabs={[
          { key: "themes", label: "Temalar" },
          { key: "new", label: "Yeni tema" },
          { key: "custom", label: "Özel tema onayları", count: pend.data?.items.length ?? null },
          { key: "gift", label: "Hediye et" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {(tab === "themes" || tab === "new" || tab === "gift") && t.loading && !t.data && <Loading />}
      {t.error && <ErrorBox message={t.error} onRetry={t.reload} />}
      {t.data && tab === "themes" && (
        <Card>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {t.data.themes.map((x) => (
              <ThemeCard key={x.key} t={x} effects={t.data?.effects ?? []} onDone={t.reload} />
            ))}
          </div>
        </Card>
      )}
      {t.data && tab === "new" && <NewTheme effects={t.data.effects} onDone={() => { t.reload(); setTab("themes"); }} />}
      {tab === "custom" && <CustomList onDone={pend.reload} />}
      {t.data && tab === "gift" && <GiftTheme themes={t.data.themes} />}
    </div>
  );
}

function Preview({ t }: { t: { imageUrl: string | null; thumbUrl: string | null; colors: string[] } }) {
  const src = absoluteUrl(t.thumbUrl ?? t.imageUrl);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="h-28 w-full rounded-lg object-cover" />
  ) : (
    <div className="h-28 w-full rounded-lg" style={{ background: `linear-gradient(135deg, ${(t.colors.length ? t.colors : ["#0B0906", "#17130C"]).join(", ")})` }} />
  );
}

function ThemeCard({ t, effects, onDone }: { t: Theme; effects: string[]; onDone: () => void }) {
  const { busy, msg, run } = useAction();
  const [edit, setEdit] = useState(false);
  const [label, setLabel] = useState(t.label);
  const [price, setPrice] = useState(t.priceCoins);
  const [days, setDays] = useState(String(t.durationDays));
  const [effect, setEffect] = useState(t.effect);
  const patch = (body: Record<string, unknown>, ok: string) =>
    run(ok, async () => {
      await api(`/api/admin/room-themes/${t.key}`, { method: "PATCH", body });
      onDone();
    });
  return (
    <div className="rounded-xl border border-[#30291e] p-3">
      <Preview t={t} />
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="font-semibold text-white">{t.label}</div>
        <Badge tone={t.active ? "green" : "gray"}>{t.active ? "Açık" : "Kapalı"}</Badge>
      </div>
      <div className="text-xs text-gray-500">
        {t.key} · {t.free ? "Ücretsiz" : `${fmtNumber(t.priceCoins)} Coin / ${t.durationDays} gün`} · {t.inUse} odada · efekt: {t.effect}
      </div>
      {edit && (
        <div className="mt-3 space-y-2">
          <input className={inputCls} value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} />
          <div className="flex gap-2">
            <input className={inputCls} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} placeholder="Fiyat" />
            <input className={inputCls} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} placeholder="Gün" />
          </div>
          <select className={`${selectCls} w-full`} value={effect} onChange={(e) => setEffect(e.target.value)}>
            {effects.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
          <button type="button" className={btnOk} disabled={busy} onClick={() => patch({ label: label.trim(), priceCoins: price || "0", durationDays: Number(days) || 14, effect }, "Kaydedildi.")}>
            Kaydet
          </button>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={btnSmall} onClick={() => setEdit(!edit)}>
          {edit ? "Kapat" : "Düzenle"}
        </button>
        <button type="button" className={btnSmall} disabled={busy} onClick={() => patch({ active: !t.active }, t.active ? "Kapatıldı." : "Açıldı.")}>
          {t.active ? "Kapat" : "Aç"}
        </button>
        <button
          type="button"
          className={btnSmall}
          disabled={busy}
          onClick={() =>
            run("Silindi.", async () => {
              if (!confirmTyped(`"${t.label}" teması silinecek; kullanan ${t.inUse} oda varsayılana döner.`)) return false;
              await api(`/api/admin/room-themes/${t.key}`, { method: "DELETE" });
              onDone();
            })
          }
        >
          Sil
        </button>
      </div>
      <ActionMsg msg={msg} />
    </div>
  );
}

function NewTheme({ effects, onDone }: { effects: string[]; onDone: () => void }) {
  const { busy, msg, run } = useAction();
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [price, setPrice] = useState("0");
  const [days, setDays] = useState("14");
  const [effect, setEffect] = useState("none");
  const [img, setImg] = useState<{ imageUrl: string; thumbUrl: string | null } | null>(null);
  const [upErr, setUpErr] = useState("");
  return (
    <Card title="Yeni tema" subtitle="Görsel otomatik boyutlandırılır ve küçük resmi yapılır.">
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Anahtar" hint="2-20 karakter: küçük harf, rakam, alt çizgi; harfle başlar">
            <input className={inputCls} value={key} onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20))} />
          </Field>
          <Field label="Ad">
            <input className={inputCls} value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Field label="Fiyat (Coin, 0 = ücretsiz)">
            <input className={inputCls} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="Süre (gün)">
            <input className={inputCls} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="Efekt">
            <select className={`${selectCls} w-full`} value={effect} onChange={(e) => setEffect(e.target.value)}>
              {effects.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Görsel (png / jpeg / webp, en fazla 3 MB)">
            <input
              type="file"
              accept=".png,.jpg,.jpeg,.webp"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setUpErr("");
                try {
                  setImg((await apiUpload("/api/admin/room-themes/image", f)) as unknown as { imageUrl: string; thumbUrl: string | null });
                } catch (er) {
                  setUpErr(er instanceof Error ? er.message : "Yüklenemedi.");
                }
              }}
              className="text-sm text-gray-300 file:mr-3 file:rounded-lg file:border-0 file:bg-[#292114] file:px-3 file:py-2 file:text-[#d7b56d]"
            />
            {upErr && <p className="mt-1 text-sm text-red-300">{upErr}</p>}
          </Field>
        </div>
        {img && (
          <div className="max-w-xs">
            <Preview t={{ imageUrl: img.imageUrl, thumbUrl: img.thumbUrl, colors: [] }} />
          </div>
        )}
        <ActionMsg msg={msg} />
        <button
          type="button"
          className="gold-button disabled:opacity-60"
          disabled={busy || key.length < 2 || !label.trim() || !img}
          onClick={() =>
            run("Tema eklendi.", async () => {
              await api("/api/admin/room-themes", {
                method: "POST",
                body: { key, label: label.trim(), priceCoins: price || "0", durationDays: Number(days) || 14, effect, imageUrl: img?.imageUrl, thumbUrl: img?.thumbUrl ?? null },
              });
              onDone();
            })
          }
        >
          Temayı ekle
        </button>
      </div>
    </Card>
  );
}

function CustomList({ onDone }: { onDone: () => void }) {
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "granted">("pending");
  const { data, error, loading, reload } = useApi<{ items: Custom[] }>(`/api/admin/room-themes/custom?status=${status}`);
  const { busy, msg, run } = useAction();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const act = (c: Custom, ok: boolean) =>
    run(ok ? "Onaylandı." : "Reddedildi.", async () => {
      await api(`/api/admin/room-themes/custom/${c.id}/${ok ? "approve" : "reject"}`, { method: "POST", body: ok ? {} : { note: notes[c.id] ?? "" } });
      reload();
      onDone();
    });
  return (
    <Card
      action={
        <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="pending">Bekleyen</option>
          <option value="approved">Onaylanan</option>
          <option value="rejected">Reddedilen</option>
          <option value="granted">Hakkı verilen (görsel yüklenmedi)</option>
        </select>
      }
    >
      <ActionMsg msg={msg} />
      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data &&
        (data.items.length === 0 ? (
          <Empty title="Kayıt yok." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.items.map((c) => (
              <div key={c.id} className="rounded-xl border border-[#30291e] p-3">
                <Preview t={{ imageUrl: c.imageUrl, thumbUrl: null, colors: [] }} />
                <div className="mt-2 text-sm text-white">@{c.username ?? "?"}</div>
                <div className="text-xs text-gray-500">
                  {c.days} gün · {fmtDate(c.createdAt)}
                </div>
                {c.reviewNote && <div className="text-xs text-gray-400">Not: {c.reviewNote}</div>}
                {status === "pending" && (
                  <div className="mt-2 space-y-2">
                    <input className={inputCls} value={notes[c.id] ?? ""} maxLength={200} onChange={(e) => setNotes({ ...notes, [c.id]: e.target.value })} placeholder="Ret nedeni (isteğe bağlı)" />
                    <div className="flex gap-2">
                      <button type="button" className={btnOk} disabled={busy} onClick={() => act(c, true)}>
                        Onayla
                      </button>
                      <button type="button" className={btnDangerOutline} disabled={busy} onClick={() => act(c, false)}>
                        Reddet
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
    </Card>
  );
}

function GiftTheme({ themes }: { themes: Theme[] }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [key, setKey] = useState("");
  const [days, setDays] = useState("");
  const [customDays, setCustomDays] = useState("7");
  const { busy, msg, run } = useAction();
  return (
    <Card title="Tema hediye et" subtitle="Kullanıcıya bildirim gider.">
      <div className="space-y-4">
        {user ? (
          <div className="text-sm text-white">
            @{user.username}{" "}
            <button type="button" className="text-xs text-[#d7b56d]" onClick={() => setUser(null)}>
              Değiştir
            </button>
          </div>
        ) : (
          <UserPicker onPick={setUser} />
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 rounded-xl border border-[#30291e] p-3">
            <div className="text-sm font-semibold text-white">Katalog teması</div>
            <select className={`${selectCls} w-full`} value={key} onChange={(e) => setKey(e.target.value)}>
              <option value="">Tema seçin</option>
              {themes.filter((t) => t.active).map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
            <input className={inputCls} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} placeholder="Gün (boş: temanın süresi)" />
            <button
              type="button"
              className={btnGhost}
              disabled={busy || !user || !key}
              onClick={() =>
                run("Tema hediye edildi.", async () => {
                  await api("/api/admin/room-themes/gift", { method: "POST", body: { userId: user?.id, key, days: days ? Number(days) : undefined } });
                })
              }
            >
              Hediye et
            </button>
          </div>
          <div className="space-y-2 rounded-xl border border-[#30291e] p-3">
            <div className="text-sm font-semibold text-white">Özel tema hakkı</div>
            <p className="text-xs text-gray-500">Kullanıcı kendi görselini yükler; onaydan sonra verilen gün kadar kullanır.</p>
            <input className={inputCls} inputMode="numeric" value={customDays} onChange={(e) => setCustomDays(e.target.value.replace(/\D/g, ""))} placeholder="Gün" />
            <button
              type="button"
              className={btnGhost}
              disabled={busy || !user || !customDays}
              onClick={() =>
                run("Özel tema hakkı verildi.", async () => {
                  await api("/api/admin/room-themes/custom/grant", { method: "POST", body: { userId: user?.id, days: Number(customDays) } });
                })
              }
            >
              Hak ver
            </button>
          </div>
        </div>
        <ActionMsg msg={msg} />
      </div>
    </Card>
  );
}
