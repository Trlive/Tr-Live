"use client";

import { useEffect, useState } from "react";
import { PartyPopper, Plus, Trash2 } from "lucide-react";
import { api, apiBinary } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, inputCls } from "@/components/ui";
import { ActionMsg, Field, btnDangerOutline, btnSmall, selectCls, useAction } from "./kit";

type Item = {
  id: string; title: string; subtitle: string; icon: string; openMode: "sheet" | "full" | "browser";
  ready: boolean; sortOrder: number; linkUrl: string; enabled: boolean; hasSecret: boolean;
  coinPlay: boolean; minBet: string; maxBet: string; maxMultiplier: number;
  game: { version: number; files: number; bytes: string; uploadedAt: string } | null;
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
              <li>Kendi HTML oyunların: her etkinlikte <b>Oyun dosyası (zip)</b> yükle; sunucu yayınlar, bağlantıyı yazar ve oyun sayfasına <code>TRGame</code> SDK&apos;sını ekler (Coin bahis / sonuç tek satır). Coin&apos;li oyun için aşağıdan &quot;Coin bahsi açık&quot; yap.</li>
              <li>&quot;Hafıza Kartları&quot; uygulamanın kendi oyunudur ve her zaman ilk sıradadır.</li>
            </ul>
          </Card>
          <GameFeeCard />
          <AccessCard />
          {data.items.length === 0 && <Empty title="Etkinlik yok." />}
          {data.items.map((x) => (
            <Row key={`${x.id}:${x.linkUrl}`} item={x} onDone={reload} />
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
    coinPlay: item.coinPlay, minBet: item.minBet, maxBet: item.maxBet, maxMultiplier: String(item.maxMultiplier),
  });
  const { busy, msg, run } = useAction();
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));
  const save = () =>
    run("Kaydedildi.", async () => {
      await api(`/api/admin/activities/${item.id}`, {
        method: "PATCH",
        body: { ...f, sortOrder: Number(f.sortOrder) || 0, minBet: Number(f.minBet) || 1, maxBet: Number(f.maxBet) || 1, maxMultiplier: Number(f.maxMultiplier) || 0, ...(f.appSecret ? {} : { appSecret: undefined }) },
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
        <Field label="Coin'li oyun" hint="Açıksa oyun sayfası bahis açıp sonuç bildirebilir (Coin düşer / eklenir).">
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={f.coinPlay} onChange={(e) => set("coinPlay", e.target.checked)} /> Coin bahsi açık
          </label>
        </Field>
        {f.coinPlay && (
          <>
            <Field label="En az bahis (Coin)"><input className={inputCls} value={f.minBet} inputMode="numeric" onChange={(e) => set("minBet", e.target.value.replace(/\D/g, ""))} /></Field>
            <Field label="En çok bahis (Coin)"><input className={inputCls} value={f.maxBet} inputMode="numeric" onChange={(e) => set("maxBet", e.target.value.replace(/\D/g, ""))} /></Field>
            <Field label="En yüksek çarpan" hint="Oyunun bildireceği çarpan bunu aşamaz (güvenlik sınırı)."><input className={inputCls} value={f.maxMultiplier} inputMode="decimal" onChange={(e) => set("maxMultiplier", e.target.value.replace(/[^\d.]/g, ""))} /></Field>
          </>
        )}
        <Field label="Görünürlük">
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={f.enabled} onChange={(e) => set("enabled", e.target.checked)} /> Uygulamada göster
          </label>
        </Field>
      </div>
      <GameUpload item={item} onDone={onDone} />
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

/** Ludo ve TEK (Uno) oda oyunlarına giriş ücreti (Gümüş). Oyuncu listeye girerken düşer; oyun başlamadan çıkarsa iade edilir. */
function GameFeeCard() {
  const cfg = useApi<{ config: Record<string, unknown> }>("/api/admin/app-config");
  const [ludo, setLudo] = useState("500");
  const [tek, setTek] = useState("500");
  const { busy, msg, run } = useAction();
  useEffect(() => {
    const c = cfg.data?.config;
    if (!c) return;
    setLudo(String(c.ludoEntrySilver ?? 500));
    setTek(String(c.tekEntrySilver ?? 500));
  }, [cfg.data]);
  return (
    <Card title="Oyun giriş ücreti (Gümüş)" subtitle="Odadaki Ludo ve TEK (Uno) oyunlarına katılmak Gümüş ister. 0 = ücretsiz.">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Ludo"><input className={inputCls} inputMode="numeric" value={ludo} onChange={(e) => setLudo(e.target.value.replace(/\D/g, ""))} /></Field>
        <Field label="TEK (Uno)"><input className={inputCls} inputMode="numeric" value={tek} onChange={(e) => setTek(e.target.value.replace(/\D/g, ""))} /></Field>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={busy || cfg.loading}
          className={btnSmall}
          onClick={() => run("Kaydedildi.", async () => { await api("/api/admin/app-config", { method: "PUT", body: { ludoEntrySilver: Number(ludo) || 0, tekEntrySilver: Number(tek) || 0 } }); cfg.reload(); })}
        >
          Kaydet
        </button>
        <ActionMsg msg={msg} />
      </div>
    </Card>
  );
}

/** Oyun zip'i: sunucu açar, yayınlar ve bağlantıyı kendisi yazar. Oyun sayfasında TRGame SDK otomatik hazırdır. */
function GameUpload({ item, onDone }: { item: Item; onDone: () => void }) {
  const { busy, msg, run } = useAction();
  const g = item.game;
  return (
    <div className="mt-4 rounded-xl border border-[#383024] p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <b className="text-white">Oyun dosyası (zip)</b>
        {g ? <Badge tone="green">v{g.version} · {g.files} dosya · {(Number(g.bytes) / 1048576).toFixed(1)} MB</Badge> : <Badge tone="gray">Yüklenmedi</Badge>}
      </div>
      <p className="mb-2 text-xs text-gray-500">Zip&apos;in kökünde (ya da tek klasörde) <code>index.html</code> olmalı. Yükleyince bağlantı kendiliğinden yazılır; yeni zip yüklemek oyunu günceller (uygulama yenilemek gerekmez).</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          accept=".zip,application/zip"
          disabled={busy}
          className="text-sm text-gray-300"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            run("Oyun yüklendi, bağlantı otomatik yazıldı.", async () => {
              await apiBinary(`/api/admin/activities/${item.id}/game`, f);
              onDone();
            });
          }}
        />
        {g && (
          <button
            type="button"
            disabled={busy}
            className={btnDangerOutline}
            onClick={() => run("Oyun kaldırıldı.", async () => {
              if (!window.confirm("Yüklenen oyun silinsin mi?")) return false;
              await api(`/api/admin/activities/${item.id}/game`, { method: "DELETE" });
              onDone();
            })}
          >
            Oyunu kaldır
          </button>
        )}
      </div>
      <div className="mt-2"><ActionMsg msg={msg} /></div>
      <details className="mt-2 text-xs text-gray-400">
        <summary className="cursor-pointer text-[#d7b56d]">Oyunda Coin nasıl kullanılır (SDK)</summary>
        <pre className="mt-2 overflow-x-auto rounded bg-black/40 p-2 text-[11px] leading-relaxed text-gray-300">{`// SDK sayfaya otomatik eklenir: window.TRGame
const me = await TRGame.me();            // { balance, name, minBet, maxBet, maxMultiplier }
const r  = await TRGame.play(500, async (round) => {
  // ... oyunu oyna ...
  return 2.5;                            // çarpan (0 = kaybetti)
});                                      // { payout, balance, roundId }
// ya da adım adım: TRGame.bet(500) → TRGame.settle(roundId, çarpan)`}</pre>
      </details>
    </div>
  );
}
