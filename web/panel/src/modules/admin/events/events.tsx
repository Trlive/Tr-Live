"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Trash2 } from "lucide-react";
import { api, fmtDate, fmtNumber } from "@/core/api/api";
import { useApi } from "@/core/api/use-api";
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, inputCls } from "@/shared/components/ui";
import { ActionMsg, Field, Tabs, btnGhost, btnSmall, selectCls, useAction } from "@/shared/components/kit";
import { UserPicker, type AdminUser } from "@/modules/admin/users/user-picker";

type Reward = { type: "coins" | "wip" | "item"; amount?: number; level?: number; days?: number; category?: string; itemKey?: string; name?: string };
type WEvent = { kind: string; title: string; enabled: boolean; isStar: boolean; gift: { id: string; name: string } | null; rewards: Record<string, Reward[]>; rules: string; defaultRules: string };
type Grantable = { key: string; name: string };

const ITEM_CATS: [string, string][] = [["frame", "Çerçeve"], ["entrance_effect", "Giriş efekti"], ["vehicle", "Araç"], ["badge", "Rozet"], ["chat_bubble", "Sohbet balonu"], ["mini_card", "Profil kartı"], ["mic_wave", "Mikrofon dalgası"], ["room_card", "Oda kartı"]];
const label = (r: Reward) =>
  r.type === "coins" ? `${fmtNumber(r.amount ?? 0)} Coin` : r.type === "wip" ? `WIP ${r.level} · ${r.days} gün` : `${r.name ?? r.itemKey} · ${r.days} gün`;

export default function AdminEvents() {
  const [tab, setTab] = useState<"weekly" | "official" | "checkin">("weekly");
  return (
    <div>
      <PageHeader icon={<CalendarDays size={18} />} kicker="Etkinlik ve duyuru" title="Etkinlikler ve Ödüller" description="Haftalık sıralama etkinlikleri, resmi etkinlik yoklaması ve günlük giriş ödülü." />
      <Tabs
        tabs={[
          { key: "weekly", label: "Haftalık etkinlikler" },
          { key: "official", label: "Resmi etkinlikler" },
          { key: "checkin", label: "Günlük giriş ödülü" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "weekly" && <Weekly />}
      {tab === "official" && <Official />}
      {tab === "checkin" && <Checkin />}
    </div>
  );
}

function Weekly() {
  const { data, error, loading, reload } = useApi<{ events: WEvent[] }>("/api/admin/weekly-events");
  const cat = useApi<{ gifts: { id: string; name: string; isActive: boolean }[] }>("/api/admin/catalog");
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;
  return (
    <div className="space-y-4">
      {data.events.map((e) => (
        <WeeklyCard key={e.kind} e={e} gifts={cat.data?.gifts ?? []} onDone={reload} />
      ))}
    </div>
  );
}

function WeeklyCard({ e, gifts, onDone }: { e: WEvent; gifts: { id: string; name: string; isActive: boolean }[]; onDone: () => void }) {
  const { busy, msg, run } = useAction();
  const [rules, setRules] = useState(e.rules || "");
  const put = (body: Record<string, unknown>, ok: string) =>
    run(ok, async () => {
      await api(`/api/admin/weekly-events/${e.kind}`, { method: "PUT", body });
      onDone();
    });
  const setRank = (rank: string, list: Reward[]) => put({ rewards: { ...e.rewards, [rank]: list } }, "Ödüller kaydedildi.");
  return (
    <Card
      title={e.title}
      action={
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input type="checkbox" className="h-4 w-4 accent-[#d7b56d]" checked={e.enabled} disabled={busy} onChange={(x) => put({ enabled: x.target.checked }, x.target.checked ? "Açıldı." : "Kapatıldı.")} />
          Açık
        </label>
      }
    >
      <div className="space-y-4">
        {e.isStar && (
          <Field label="Yıldız hediyesi" hint="Bu haftanın sıralaması bu hediyeye göre yapılır.">
            <select className={`${selectCls} w-full`} value={e.gift?.id ?? ""} disabled={busy} onChange={(x) => put({ giftId: x.target.value || null }, "Hediye seçildi.")}>
              <option value="">Seçilmedi</option>
              {gifts.filter((g) => g.isActive).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="grid gap-3 lg:grid-cols-3">
          {["1", "2", "3"].map((rank) => (
            <RankRewards key={rank} rank={rank} list={e.rewards?.[rank] ?? []} busy={busy} onChange={(l) => setRank(rank, l)} />
          ))}
        </div>
        <Field label="Kurallar" hint="Boş bırakılırsa varsayılan kurallar gösterilir.">
          <textarea className={`${inputCls} min-h-24`} value={rules} maxLength={3000} placeholder={e.defaultRules} onChange={(x) => setRules(x.target.value)} />
        </Field>
        <button type="button" className={btnGhost} disabled={busy || rules === (e.rules || "")} onClick={() => put({ rules }, "Kurallar kaydedildi.")}>
          Kuralları kaydet
        </button>
        <ActionMsg msg={msg} />
      </div>
    </Card>
  );
}

function RankRewards({ rank, list, busy, onChange }: { rank: string; list: Reward[]; busy: boolean; onChange: (l: Reward[]) => void }) {
  const [type, setType] = useState<"coins" | "wip" | "item">("coins");
  const [amount, setAmount] = useState("");
  const [level, setLevel] = useState("1");
  const [days, setDays] = useState("7");
  const [category, setCategory] = useState("frame");
  const [itemKey, setItemKey] = useState("");
  const items = useApi<{ items: Grantable[] }>(type === "item" ? `/api/admin/grantables?category=${category}` : null);
  useEffect(() => setItemKey(""), [category]);
  function add() {
    const d = Number(days) || 7;
    if (type === "coins") onChange([...list, { type, amount: Number(amount.replace(/\D/g, "")) }]);
    else if (type === "wip") onChange([...list, { type, level: Number(level), days: d }]);
    else onChange([...list, { type, category, itemKey, days: d }]);
    setAmount("");
  }
  const ok = type === "coins" ? Number(amount.replace(/\D/g, "")) > 0 : type === "item" ? !!itemKey : true;
  return (
    <div className="rounded-xl border border-[#30291e] p-3">
      <div className="mb-2 text-sm font-semibold text-[#d7b56d]">{rank}. sıra</div>
      {list.length === 0 && <p className="text-xs text-gray-500">Ödül yok.</p>}
      <ul className="space-y-1">
        {list.map((r, i) => (
          <li key={i} className="flex items-center justify-between gap-2 text-sm text-gray-200">
            {label(r)}
            <button type="button" aria-label="Kaldır" className={btnSmall} disabled={busy} onClick={() => onChange(list.filter((_, j) => j !== i))}>
              <Trash2 size={12} />
            </button>
          </li>
        ))}
      </ul>
      {list.length < 5 && (
        <div className="mt-3 space-y-2">
          <select className={`${selectCls} w-full`} value={type} onChange={(x) => setType(x.target.value as "coins" | "wip" | "item")}>
            <option value="coins">Coin</option>
            <option value="wip">WIP üyeliği</option>
            <option value="item">Öğe</option>
          </select>
          {type === "coins" && <input className={inputCls} inputMode="numeric" value={amount} onChange={(x) => setAmount(x.target.value)} placeholder="Coin" />}
          {type === "wip" && (
            <select className={`${selectCls} w-full`} value={level} onChange={(x) => setLevel(x.target.value)}>
              {Array.from({ length: 10 }, (_, i) => String(i + 1)).map((l) => (
                <option key={l} value={l}>
                  WIP {l}
                </option>
              ))}
            </select>
          )}
          {type === "item" && (
            <>
              <select className={`${selectCls} w-full`} value={category} onChange={(x) => setCategory(x.target.value)}>
                {ITEM_CATS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <select className={`${selectCls} w-full`} value={itemKey} onChange={(x) => setItemKey(x.target.value)}>
                <option value="">{items.loading ? "Yükleniyor…" : "Öğe seçin"}</option>
                {(items.data?.items ?? []).map((it) => (
                  <option key={it.key} value={it.key}>
                    {it.name}
                  </option>
                ))}
              </select>
            </>
          )}
          {type !== "coins" && <input className={inputCls} inputMode="numeric" value={days} onChange={(x) => setDays(x.target.value.replace(/\D/g, ""))} placeholder="Gün" />}
          <button type="button" className={btnSmall} disabled={busy || !ok} onClick={add}>
            Ödül ekle
          </button>
        </div>
      )}
    </div>
  );
}

function Official() {
  const { data, error, loading, reload } = useApi<{ events: { id: string; title: string; startsAt: string; attendees: number }[] }>("/api/admin/events");
  const { busy, msg, run } = useAction();
  const [title, setTitle] = useState("");
  const [at, setAt] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [picked, setPicked] = useState<AdminUser[]>([]);
  return (
    <div className="space-y-4">
      <Card title="Yeni resmi etkinlik" subtitle="Maaş şartında 'resmi etkinlik' açıksa yayıncıların katılımı buradan işaretlenir.">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <input className={inputCls} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Başlık" />
          <input className={inputCls} type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
          <button
            type="button"
            className="gold-button disabled:opacity-60"
            disabled={busy || title.trim().length < 3 || !at}
            onClick={() =>
              run("Etkinlik eklendi.", async () => {
                await api("/api/admin/events", { method: "POST", body: { title: title.trim(), startsAt: new Date(at).toISOString() } });
                setTitle("");
                setAt("");
                reload();
              })
            }
          >
            Ekle
          </button>
        </div>
        <div className="mt-3">
          <ActionMsg msg={msg} />
        </div>
      </Card>
      <Card title="Etkinlikler">
        {loading && !data && <Loading />}
        {error && <ErrorBox message={error} onRetry={reload} />}
        {data &&
          (data.events.length === 0 ? (
            <Empty title="Etkinlik yok." />
          ) : (
            <div className="space-y-2">
              {data.events.map((e) => (
                <div key={e.id} className="rounded-xl border border-[#30291e] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-medium text-white">{e.title}</div>
                      <div className="text-xs text-gray-500">{fmtDate(e.startsAt)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge>{e.attendees} katılımcı</Badge>
                      <button
                        type="button"
                        className={btnSmall}
                        onClick={() => {
                          setOpen(open === e.id ? null : e.id);
                          setPicked([]);
                        }}
                      >
                        Katılım işaretle
                      </button>
                    </div>
                  </div>
                  {open === e.id && (
                    <div className="mt-3 space-y-2">
                      <UserPicker onPick={(u) => setPicked(picked.some((p) => p.id === u.id) ? picked : [...picked, u])} placeholder="Yayıncı ara" />
                      {picked.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {picked.map((p) => (
                            <button key={p.id} type="button" className={btnSmall} onClick={() => setPicked(picked.filter((x) => x.id !== p.id))}>
                              @{p.username} ✕
                            </button>
                          ))}
                        </div>
                      )}
                      <button
                        type="button"
                        className={btnGhost}
                        disabled={busy || !picked.length}
                        onClick={() =>
                          run("Katılım işaretlendi (yalnızca yayıncılar sayılır).", async () => {
                            await api(`/api/admin/events/${e.id}/attendance`, { method: "POST", body: { userIds: picked.map((p) => p.id) } });
                            setPicked([]);
                            reload();
                          })
                        }
                      >
                        {picked.length} kişiyi işaretle
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
      </Card>
    </div>
  );
}

function Checkin() {
  const cfg = useApi<{ config: Record<string, unknown> }>("/api/admin/app-config");
  const frames = useApi<{ items: Grantable[] }>("/api/admin/grantables?category=frame");
  const vehicles = useApi<{ items: Grantable[] }>("/api/admin/grantables?category=vehicle");
  const { busy, msg, run } = useAction();
  const [on, setOn] = useState(true);
  const [coins, setCoins] = useState<string[]>(["20", "20", "20", "20", "50", "50", "100"]);
  const [silver, setSilver] = useState<string[]>(["1000", "1000", "1000", "1000", "1000", "1000", "10000"]);
  const [frame, setFrame] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [days, setDays] = useState("7");
  useEffect(() => {
    const c = cfg.data?.config;
    if (!c) return;
    setOn(c.checkinEnabled !== false);
    const parts = String(c.checkinCoins ?? "20,20,20,20,50,50,100").split(",");
    setCoins(Array.from({ length: 7 }, (_, i) => (parts[i] ?? "0").trim()));
    const sp = String(c.checkinSilver ?? "1000,1000,1000,1000,1000,1000,10000").split(",");
    setSilver(Array.from({ length: 7 }, (_, i) => (sp[i] ?? "0").trim()));
    setFrame(String(c.checkinFrameId ?? ""));
    setVehicle(String(c.checkinVehicleId ?? ""));
    setDays(String(c.checkinItemDays ?? 7));
  }, [cfg.data]);
  if (cfg.loading && !cfg.data) return <Loading />;
  if (cfg.error) return <ErrorBox message={cfg.error} onRetry={cfg.reload} />;
  return (
    <Card title="Günlük giriş ödülü" subtitle="7 günlük döngü. 7. günde seçilen çerçeve ve araç da verilir.">
      <div className="space-y-4">
        <label className="flex items-center gap-3 text-sm text-gray-200">
          <input type="checkbox" className="h-4 w-4 accent-[#d7b56d]" checked={on} onChange={(e) => setOn(e.target.checked)} />
          Açık
        </label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {coins.map((c, i) => (
            <Field key={i} label={`${i + 1}. gün (Coin)`}>
              <input className={inputCls} inputMode="numeric" value={c} onChange={(e) => setCoins(coins.map((x, j) => (j === i ? e.target.value.replace(/\D/g, "") : x)))} />
            </Field>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {silver.map((c, i) => (
            <Field key={i} label={`${i + 1}. gün (Gümüş)`} hint={i === 0 ? "Yalnızca Ludo / Uno girişinde harcanır." : undefined}>
              <input className={inputCls} inputMode="numeric" value={c} onChange={(e) => setSilver(silver.map((x, j) => (j === i ? e.target.value.replace(/\D/g, "") : x)))} />
            </Field>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="7. gün çerçevesi">
            <select className={`${selectCls} w-full`} value={frame} onChange={(e) => setFrame(e.target.value)}>
              <option value="">Yok</option>
              {(frames.data?.items ?? []).map((x) => (
                <option key={x.key} value={x.key}>
                  {x.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="7. gün aracı">
            <select className={`${selectCls} w-full`} value={vehicle} onChange={(e) => setVehicle(e.target.value)}>
              <option value="">Yok</option>
              {(vehicles.data?.items ?? []).map((x) => (
                <option key={x.key} value={x.key}>
                  {x.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Öğe süresi (gün)">
            <input className={inputCls} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} />
          </Field>
        </div>
        <ActionMsg msg={msg} />
        <button
          type="button"
          className="gold-button disabled:opacity-60"
          disabled={busy}
          onClick={() =>
            run("Kaydedildi.", async () => {
              if (coins.some((c) => c === "") || silver.some((c) => c === "")) throw new Error("Her gün için Coin ve Gümüş girin (0 olabilir).");
              await api("/api/admin/app-config", {
                method: "PUT",
                body: { checkinEnabled: on, checkinCoins: coins.join(","), checkinSilver: silver.join(","), checkinFrameId: frame, checkinVehicleId: vehicle, checkinItemDays: Number(days) || 7 },
              });
              cfg.reload();
            })
          }
        >
          Kaydet
        </button>
      </div>
    </Card>
  );
}
