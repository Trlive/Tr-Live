"use client";

import { useState } from "react";
import { PartyPopper, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, inputCls } from "@/components/ui";
import { ActionMsg, Field, btnDangerOutline, btnSmall, selectCls, useAction } from "./kit";

type Item = {
  id: string; title: string; subtitle: string; icon: string; openMode: "sheet" | "full" | "browser";
  ready: boolean; sortOrder: number; linkUrl: string; enabled: boolean; hasSecret: boolean;
};

const MODES: Record<string, string> = { sheet: "Alt pencere (oda arkada sürer)", full: "Tam ekran", browser: "Telefonun tarayıcısı" };
const PLACEHOLDERS = "{uid} {publicId} {name} {avatar} {lang} {roomId} {token} {ts}";

/**
 * Etkinlikler (v2.124): her satıra yalnızca bağlantı yapıştırılır → uygulamadaki "Etkinlikler" menüsünde "Yakında"
 * kalkar, dokununca bağlantı açılır. Coin'li oyun sağlayıcısı için imza anahtarı girilirse sunucu API'si açılır.
 */
export default function AdminActivities() {
  const { data, error, loading, reload } = useApi<{ items: Item[] }>("/api/admin/activities");
  const { busy, msg, run } = useAction();
  return (
    <div>
      <PageHeader icon={<PartyPopper size={18} />} kicker="Sistem" title="Oda Etkinlikleri" description="Bağlantıyı yapıştırın, kaydedin — uygulama hemen açar." />
      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && (
        <div className="space-y-4">
          <Card title="Nasıl çalışır?">
            <ul className="list-disc space-y-1 pl-5 text-sm text-gray-400">
              <li>Bağlantı boşsa uygulamada <b>Yakında</b> görünür; bağlantı yapıştırılınca dokununca açılır.</li>
              <li>Bağlantıda şu yer tutucular kullanılabilir (açılırken doldurulur): <code className="text-[#d7b56d]">{PLACEHOLDERS}</code></li>
              <li><code className="text-[#d7b56d]">{"{token}"}</code>: o kişiye ve yalnızca bu etkinliğe özel 2 saatlik oyun bileti (oturum bileti değildir).</li>
              <li>Coin&apos;li oyun sağlayıcısı: imza anahtarını girin; sağlayıcı <code>/api/activity-provider/&lt;etkinlik-id&gt;/user</code> ve <code>/balance</code> uçlarını kullanır (belge: backend/src/routes/activities.js).</li>
              <li>&quot;Hafıza Kartları&quot; uygulamanın kendi oyunudur ve her zaman ilk sıradadır.</li>
            </ul>
          </Card>
          <AccessCard />
          {data.items.length === 0 && <Empty title="Etkinlik yok." />}
          {data.items.map((x) => (
            <Row key={x.id} item={x} onDone={reload} />
          ))}
          <button
            type="button"
            disabled={busy}
            className={`${btnSmall} inline-flex items-center gap-2`}
            onClick={() => run("Etkinlik eklendi.", async () => { await api("/api/admin/activities", { method: "POST", body: { title: "Yeni etkinlik", icon: "🎮", sortOrder: 100 } }); reload(); })}
          >
            <Plus size={14} /> Etkinlik ekle
          </button>
          <ActionMsg msg={msg} />
        </div>
      )}
    </div>
  );
}

function Row({ item, onDone }: { item: Item; onDone: () => void }) {
  const [f, setF] = useState({
    title: item.title, subtitle: item.subtitle, icon: item.icon, linkUrl: item.linkUrl, openMode: item.openMode,
    enabled: item.enabled, sortOrder: String(item.sortOrder), appSecret: "",
  });
  const { busy, msg, run } = useAction();
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));
  const save = () =>
    run("Kaydedildi.", async () => {
      await api(`/api/admin/activities/${item.id}`, {
        method: "PATCH",
        body: { ...f, sortOrder: Number(f.sortOrder) || 0, ...(f.appSecret ? {} : { appSecret: undefined }) },
      });
      onDone();
    });
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-2xl">{/^https:|^\//.test(f.icon) ? "🖼️" : f.icon}</span>
        <b className="text-white">{item.title}</b>
        {item.ready ? <Badge tone="green">Açık</Badge> : <Badge tone="gold">Yakında</Badge>}
        {!item.enabled && <Badge tone="red">Gizli</Badge>}
        {item.hasSecret && <Badge tone="blue">Coin API</Badge>}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Bağlantı (yapıştırın)" hint={`https:// ile başlar. Yer tutucular: ${PLACEHOLDERS}`}>
          <input className={inputCls} value={f.linkUrl} onChange={(e) => set("linkUrl", e.target.value)} placeholder="https://oyun.ornek.com/?uid={uid}&token={token}" />
        </Field>
        <Field label="Açılış biçimi">
          <select className={selectCls} value={f.openMode} onChange={(e) => set("openMode", e.target.value)}>
            {Object.entries(MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Başlık"><input className={inputCls} value={f.title} maxLength={80} onChange={(e) => set("title", e.target.value)} /></Field>
        <Field label="Açıklama"><input className={inputCls} value={f.subtitle} maxLength={160} onChange={(e) => set("subtitle", e.target.value)} /></Field>
        <Field label="Simge" hint="Emoji ya da görsel adresi (https://…)"><input className={inputCls} value={f.icon} onChange={(e) => set("icon", e.target.value)} /></Field>
        <Field label="Sıra"><input className={inputCls} value={f.sortOrder} inputMode="numeric" onChange={(e) => set("sortOrder", e.target.value.replace(/[^\d-]/g, ""))} /></Field>
        <Field label="Coin API imza anahtarı" hint={item.hasSecret ? "Kayıtlı. Değiştirmek için yenisini yazın." : "Boş = Coin API kapalı (yalnızca bağlantı açılır)."}>
          <input className={inputCls} value={f.appSecret} onChange={(e) => set("appSecret", e.target.value)} placeholder={item.hasSecret ? "••••••••" : ""} />
        </Field>
        <Field label="Görünürlük">
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={f.enabled} onChange={(e) => set("enabled", e.target.checked)} /> Uygulamada göster
          </label>
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={save} className={btnSmall}>Kaydet</button>
        {item.linkUrl && (
          <button type="button" disabled={busy} className={btnSmall} onClick={() => { set("linkUrl", ""); }}>Bağlantıyı temizle (Yakında)</button>
        )}
        <button
          type="button"
          disabled={busy}
          className={`${btnDangerOutline} inline-flex items-center gap-1`}
          onClick={() => run("Silindi.", async () => {
            if (!window.confirm(`"${item.title}" silinsin mi?`)) return false;
            await api(`/api/admin/activities/${item.id}`, { method: "DELETE" });
            onDone();
          })}
        >
          <Trash2 size={14} /> Sil
        </button>
      </div>
      <div className="mt-2"><ActionMsg msg={msg} /></div>
    </Card>
  );
}

type Granted = { id: string; username: string; displayName: string; publicId: string; grantedAt: string };

/** Etkinlikleri görebilecek kişiler: izin yoksa uygulamada menü hiç çıkmaz, sunucu da açmaz (yöneticiler dahil, izin listesinde olmayan görmez). */
function AccessCard() {
  const { data, error, reload } = useApi<{ users: Granted[] }>("/api/admin/activities/access");
  const [q, setQ] = useState("");
  const { busy, msg, run } = useAction();
  return (
    <Card title="Görme izni" subtitle="Yalnızca burada olan kişiler Etkinlikler menüsünü görür ve açabilir, yöneticiler dahil.">
      <div className="flex gap-2">
        <input className={inputCls} value={q} placeholder="Kullanıcı ID'si ya da kullanıcı adı" onChange={(e) => setQ(e.target.value)} />
        <button
          type="button"
          disabled={busy || !q.trim()}
          className={btnSmall}
          onClick={() => run("İzin verildi.", async () => { await api("/api/admin/activities/access", { method: "POST", body: { q: q.trim() } }); setQ(""); reload(); })}
        >
          İzin ver
        </button>
      </div>
      <div className="mt-2"><ActionMsg msg={msg} /></div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      <ul className="mt-3 space-y-2">
        {data?.users.length === 0 && <li className="text-sm text-gray-500">Henüz kimseye izin verilmedi.</li>}
        {data?.users.map((u) => (
          <li key={u.id} className="flex items-center justify-between rounded-lg border border-[#383024] px-3 py-2 text-sm">
            <span className="text-gray-200">{u.displayName} <span className="text-gray-500">· ID {u.publicId}</span></span>
            <button
              type="button"
              disabled={busy}
              className={btnDangerOutline}
              onClick={() => run("İzin kaldırıldı.", async () => { await api(`/api/admin/activities/access/${u.id}`, { method: "DELETE" }); reload(); })}
            >
              Kaldır
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
