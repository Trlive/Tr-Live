"use client";
import { useEffect, useState } from "react";
import { api } from "@/core/api/api";
import { useApi } from "@/core/api/use-api";
import { Card, Loading, ErrorBox, inputCls, tableWrap, tableCls, thCls, tdCls } from "@/shared/components/ui";

type Tab = { target: string; label: string; icon: string | null; hidden: boolean };
type Item = { id: string; title: string; subtitle: string; image: string | null; action: Action };
type Action = { type: string; target?: string; screen?: string; id?: string; url?: string; external?: boolean };
type Section = { id: string; type: string; title: string; text?: string; items?: Item[]; action?: Action; hidden: boolean };
type Payload = { tabs: Tab[]; sections: Section[] };
type Layout = { screen: string; version: string; payload: Payload; enabled: boolean; updated_at: string; updated_by_name: string | null };
type Hist = { id: number; version: string; note: string; created_at: string; by_name: string | null };
type Options = { tabTargets: string[]; openScreens: string[]; icons: string[]; sectionTypes: string[] };

const TAB_TR: Record<string, string> = {
  voice: "Sesli", feed: "Akış", video: "Görüntülü", messages: "Mesajlar", profile: "Profil",
};

/**
 * Ana ekran düzeni (SDUI).
 *
 * Sunucu, uygulamanın **zaten yaptığı** şeyleri yeniden düzenler: sekmeleri sıralar, gizler,
 * yeniden adlandırır; duyuru ve kart şeritleri ekler. Yeni bir davranış tanımlayamaz — bu yüzden
 * her alan kapalı listeden seçilir, serbest metin değildir.
 *
 * Oda ekranı (ses/görüntü), cüzdan işlem akışı ve giriş SDUI'ye kapalıdır: mimari ilkemiz gereği
 * native kalırlar.
 */
export default function SduiEditor() {
  const { data, error, loading, reload } = useApi<{ layout: Layout; history: Hist[] }>("/api/admin/sdui/home");
  const { data: opts } = useApi<Options>("/api/admin/sdui/options");
  const [draft, setDraft] = useState<Payload | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data?.layout && !draft) setDraft(structuredClone(data.layout.payload));
  }, [data, draft]);

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox message={error} onRetry={reload} />;
  if (!data || !draft || !opts) return <Loading />;

  const layout = data.layout;

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setMsg("");
    try {
      await fn();
      setMsg(ok);
      setDraft(null);
      reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "İşlem başarısız.");
    } finally {
      setBusy(false);
    }
  }

  const usedTabs = new Set(draft.tabs.map((t) => t.target));
  const addable = opts.tabTargets.filter((t) => !usedTabs.has(t));

  return (
    <div className="space-y-4">
      <Card title="Ana ekran düzeni">
        <div className="space-y-3 text-sm">
          <div className="text-white/70">
            Kapalıyken uygulama kendi <b>yerleşik</b> düzenini çizer — bugünkü görünüm. Bir sorun
            çıkarsa önce <b>kapatın</b>; etki bir sonraki uygulama açılışında biter, yeni sürüm
            beklenmez. Uygulama ayrıca <code>sdui_home</code> bayrağına bağlıdır: bayrak kapalıysa
            bu ekrandaki hiçbir ayar devreye girmez.
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={layout.enabled}
                disabled={busy}
                onChange={(e) =>
                  run(() => api(`/api/admin/sdui/home/enabled`, { method: "POST", body: { enabled: e.target.checked } }), "Kaydedildi.")
                }
                className="h-4 w-4 accent-[#d7b56d]"
              />
              Düzen açık
            </label>
            <span className="text-xs text-white/40">
              sürüm <span className="font-mono">{layout.version}</span> ·{" "}
              {new Date(layout.updated_at).toLocaleString("tr-TR")}
              {layout.updated_by_name ? ` · ${layout.updated_by_name}` : ""}
            </span>
          </div>
        </div>
      </Card>

      <Card
        title="Sekmeler"
        subtitle="Sırala, gizle, yeniden adlandır. Yeni sekme eklemek uygulama güncellemesi gerektirir."
      >
        <div className="space-y-2">
          {draft.tabs.length === 0 && (
            <div className="text-sm text-white/50">
              Liste boşken uygulama yerleşik sırayı kullanır (Sesli · Akış · Görüntülü · Mesajlar · Profil).
            </div>
          )}
          {draft.tabs.map((t, i) => (
            <div key={t.target} className="flex flex-wrap items-center gap-2 rounded-lg bg-white/5 p-2">
              <span className="w-24 font-medium">{TAB_TR[t.target] ?? t.target}</span>
              <input
                value={t.label}
                placeholder="Varsayılan ad"
                onChange={(e) => {
                  const n = structuredClone(draft);
                  n.tabs[i].label = e.target.value;
                  setDraft(n);
                }}
                className={`${inputCls} max-w-[160px]`}
              />
              <select
                value={t.icon ?? ""}
                onChange={(e) => {
                  const n = structuredClone(draft);
                  n.tabs[i].icon = e.target.value || null;
                  setDraft(n);
                }}
                className={`${inputCls} max-w-[140px]`}
              >
                <option value="">Varsayılan simge</option>
                {opts.icons.map((ic) => <option key={ic} value={ic}>{ic}</option>)}
              </select>
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={t.hidden}
                  onChange={(e) => {
                    const n = structuredClone(draft);
                    n.tabs[i].hidden = e.target.checked;
                    setDraft(n);
                  }}
                  className="h-4 w-4 accent-[#d7b56d]"
                />
                Gizli
              </label>
              <div className="ml-auto flex gap-1">
                <button
                  disabled={i === 0}
                  onClick={() => {
                    const n = structuredClone(draft);
                    [n.tabs[i - 1], n.tabs[i]] = [n.tabs[i], n.tabs[i - 1]];
                    setDraft(n);
                  }}
                  className="rounded bg-white/10 px-2 py-1 text-sm disabled:opacity-30"
                >↑</button>
                <button
                  disabled={i === draft.tabs.length - 1}
                  onClick={() => {
                    const n = structuredClone(draft);
                    [n.tabs[i + 1], n.tabs[i]] = [n.tabs[i], n.tabs[i + 1]];
                    setDraft(n);
                  }}
                  className="rounded bg-white/10 px-2 py-1 text-sm disabled:opacity-30"
                >↓</button>
                <button
                  onClick={() => {
                    const n = structuredClone(draft);
                    n.tabs.splice(i, 1);
                    setDraft(n);
                  }}
                  className="rounded bg-white/10 px-2 py-1 text-sm"
                >Çıkar</button>
              </div>
            </div>
          ))}

          {addable.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                const n = structuredClone(draft);
                n.tabs.push({ target: e.target.value, label: "", icon: null, hidden: false });
                setDraft(n);
              }}
              className={`${inputCls} max-w-[220px]`}
            >
              <option value="">+ Sekme ekle</option>
              {addable.map((t) => <option key={t} value={t}>{TAB_TR[t] ?? t}</option>)}
            </select>
          )}

          {draft.tabs.length > 0 && !draft.tabs.some((t) => !t.hidden) && (
            <div className="rounded-lg bg-red-500/15 p-2 text-sm text-red-300">
              En az bir sekme görünür olmalı — yoksa uygulamada gezinilemez. Bu düzen kaydedilmez.
            </div>
          )}
        </div>
      </Card>

      <Sections draft={draft} setDraft={setDraft} opts={opts} />

      <div className="flex flex-wrap items-center gap-2">
        <button
          disabled={busy}
          onClick={() => run(() => api(`/api/admin/sdui/home`, { method: "PUT", body: { payload: draft } }), "Düzen kaydedildi.")}
          className="rounded-md bg-[#d7b56d] px-4 py-2 font-medium text-black disabled:opacity-40"
        >
          Kaydet
        </button>
        <button
          disabled={busy}
          onClick={() => { setDraft(structuredClone(layout.payload)); setMsg("Değişiklikler geri alındı."); }}
          className="rounded-md bg-white/10 px-4 py-2 text-white/80"
        >
          Değişiklikleri at
        </button>
        {msg && <span className="text-sm text-white/80">{msg}</span>}
      </div>

      <Card title="Geçmiş" subtitle="Her kayıttan önceki sürüm saklanır; tek tıkla geri dönülür.">
        {data.history.length === 0 ? (
          <div className="text-sm text-white/50">Henüz kayıt yok.</div>
        ) : (
          <div className={tableWrap}>
            <table className={tableCls}>
              <thead>
                <tr>
                  <th className={thCls}>Sürüm</th>
                  <th className={thCls}>Not</th>
                  <th className={thCls}>Tarih</th>
                  <th className={thCls}>Kim</th>
                  <th className={thCls}></th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((h) => (
                  <tr key={h.id}>
                    <td className={`${tdCls} font-mono text-xs`}>{h.version}</td>
                    <td className={tdCls}>{h.note || "—"}</td>
                    <td className={tdCls}>{new Date(h.created_at).toLocaleString("tr-TR")}</td>
                    <td className={tdCls}>{h.by_name ?? "—"}</td>
                    <td className={tdCls}>
                      <button
                        disabled={busy}
                        onClick={() => run(() => api(`/api/admin/sdui/home/rollback`, { method: "POST", body: { historyId: h.id } }), "Bu sürüme dönüldü.")}
                        className="rounded bg-white/10 px-2 py-1 text-sm"
                      >
                        Bu sürüme dön
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Sections({ draft, setDraft, opts }: { draft: Payload; setDraft: (p: Payload) => void; opts: Options }) {
  const upd = (fn: (n: Payload) => void) => {
    const n = structuredClone(draft);
    fn(n);
    setDraft(n);
  };

  return (
    <Card title="Bölümler" subtitle="Sekmelerin üstünde görünen duyuru, afiş ve kart şeritleri.">
      <div className="space-y-3">
        {draft.sections.map((s, i) => (
          <div key={s.id} className="rounded-lg bg-white/5 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-white/10 px-2 py-0.5 text-xs">{s.type}</span>
              <input
                value={s.title}
                placeholder="Başlık"
                onChange={(e) => upd((n) => { n.sections[i].title = e.target.value; })}
                className={`${inputCls} max-w-[220px]`}
              />
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={s.hidden}
                  onChange={(e) => upd((n) => { n.sections[i].hidden = e.target.checked; })}
                  className="h-4 w-4 accent-[#d7b56d]"
                />
                Gizli
              </label>
              <button
                onClick={() => upd((n) => { n.sections.splice(i, 1); })}
                className="ml-auto rounded bg-white/10 px-2 py-1 text-sm"
              >Sil</button>
            </div>

            {s.type === "notice" ? (
              <div className="mt-2 space-y-2">
                <input
                  value={s.text ?? ""}
                  placeholder="Duyuru metni"
                  onChange={(e) => upd((n) => { n.sections[i].text = e.target.value; })}
                  className={`${inputCls} w-full`}
                />
                <ActionEditor
                  value={s.action ?? { type: "noop" }}
                  opts={opts}
                  onChange={(a) => upd((n) => { n.sections[i].action = a; })}
                />
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                {(s.items ?? []).map((it, j) => (
                  <div key={it.id} className="space-y-1 rounded bg-black/20 p-2">
                    <div className="flex flex-wrap gap-2">
                      <input
                        value={it.title}
                        placeholder="Başlık"
                        onChange={(e) => upd((n) => { n.sections[i].items![j].title = e.target.value; })}
                        className={`${inputCls} max-w-[200px]`}
                      />
                      <input
                        value={it.subtitle}
                        placeholder="Alt başlık"
                        onChange={(e) => upd((n) => { n.sections[i].items![j].subtitle = e.target.value; })}
                        className={`${inputCls} max-w-[220px]`}
                      />
                      <input
                        value={it.image ?? ""}
                        placeholder="/media/... veya https://"
                        onChange={(e) => upd((n) => { n.sections[i].items![j].image = e.target.value || null; })}
                        className={`${inputCls} max-w-[260px]`}
                      />
                      <button
                        onClick={() => upd((n) => { n.sections[i].items!.splice(j, 1); })}
                        className="rounded bg-white/10 px-2 py-1 text-sm"
                      >Sil</button>
                    </div>
                    <ActionEditor
                      value={it.action}
                      opts={opts}
                      onChange={(a) => upd((n) => { n.sections[i].items![j].action = a; })}
                    />
                  </div>
                ))}
                <button
                  onClick={() =>
                    upd((n) => {
                      n.sections[i].items = n.sections[i].items ?? [];
                      n.sections[i].items!.push({ id: `i${Date.now()}`, title: "", subtitle: "", image: null, action: { type: "noop" } });
                    })
                  }
                  className="rounded bg-white/10 px-2 py-1 text-sm"
                >+ Öğe ekle</button>
              </div>
            )}
          </div>
        ))}

        <select
          value=""
          onChange={(e) => {
            if (!e.target.value) return;
            upd((n) => {
              n.sections.push({ id: `s${Date.now()}`, type: e.target.value, title: "", text: "", items: [], action: { type: "noop" }, hidden: false });
            });
          }}
          className={`${inputCls} max-w-[220px]`}
        >
          <option value="">+ Bölüm ekle</option>
          {opts.sectionTypes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
    </Card>
  );
}

/**
 * Eylem seçici.
 *
 * Her alan kapalı listeden seçilir. Serbest metin yalnızca adreste var ve o da hem burada hem
 * uygulamada WebView izin listesinden geçer: SDUI, alan adı denetimini atlatmanın yolu olamaz.
 */
function ActionEditor({ value, opts, onChange }: { value: Action; opts: Options; onChange: (a: Action) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={value.type}
        onChange={(e) => onChange({ type: e.target.value })}
        className={`${inputCls} max-w-[160px]`}
      >
        <option value="noop">Eylem yok</option>
        <option value="tab">Sekmeye git</option>
        <option value="openScreen">Ekran aç</option>
        <option value="openActivity">Etkinlik aç</option>
        <option value="openUrl">Adres aç</option>
      </select>

      {value.type === "tab" && (
        <select value={value.target ?? ""} onChange={(e) => onChange({ type: "tab", target: e.target.value })} className={`${inputCls} max-w-[160px]`}>
          <option value="">Seçin</option>
          {opts.tabTargets.map((t) => <option key={t} value={t}>{TAB_TR[t] ?? t}</option>)}
        </select>
      )}
      {value.type === "openScreen" && (
        <select value={value.screen ?? ""} onChange={(e) => onChange({ type: "openScreen", screen: e.target.value })} className={`${inputCls} max-w-[180px]`}>
          <option value="">Seçin</option>
          {opts.openScreens.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      )}
      {value.type === "openActivity" && (
        <input
          value={value.id ?? ""}
          placeholder="Etkinlik kimliği (UUID)"
          onChange={(e) => onChange({ type: "openActivity", id: e.target.value })}
          className={`${inputCls} max-w-[320px]`}
        />
      )}
      {value.type === "openUrl" && (
        <>
          <input
            value={value.url ?? ""}
            placeholder="https://..."
            onChange={(e) => onChange({ ...value, type: "openUrl", url: e.target.value })}
            className={`${inputCls} max-w-[320px]`}
          />
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={value.external === true}
              onChange={(e) => onChange({ ...value, type: "openUrl", external: e.target.checked })}
              className="h-4 w-4 accent-[#d7b56d]"
            />
            Telefonun tarayıcısında aç
          </label>
        </>
      )}
    </div>
  );
}
