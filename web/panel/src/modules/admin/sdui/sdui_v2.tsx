"use client";
import { useEffect, useState } from "react";
import { api } from "@/core/api/api";
import { useApi } from "@/core/api/use-api";
import { Card, Loading, ErrorBox, inputCls } from "@/shared/components/ui";

type ScreenRow = {
  screenId: string; live: boolean; revision: string | null; rollout: number; minApp: string;
  publishedAt: string | null; draftUpdatedAt: string | null; dirty: boolean; note: string;
};
type Detail = {
  screenId: string; draft: unknown; published: unknown; revision: string | null;
  rollout: number; minApp: string; dirty: boolean; flags: string[];
  draftBy: string | null; publishedBy: string | null; publishedAt: string | null;
};
type Version = {
  id: string; revision: string; rollout: number; minApp: string; note: string;
  createdAt: string; createdBy: string | null;
};
type Catalog = {
  components: Record<string, { children: boolean; props: Record<string, unknown> }>;
  icons: string[]; tones: string[]; openScreens: string[]; sources: string[]; apiActions: string[];
};

const TR: Record<string, string> = {
  // "üst alan": ekranın kendisi uygulamada kalır; buradaki düzen ekranın içinde bir bölüm olarak (duyuru, banner,
  // kart, düğme) çizilir. Yayın yoksa görünmez.
  help: "Yardım / SSS", events: "Etkinlik — üst alan", event_detail: "Etkinlik detayı (henüz bağlı değil)",
  inbox: "Duyuru / gelen kutusu", campaign: "Kampanya / görev (henüz bağlı değil)", relations: "İlişkiler",
  family: "Aile — üst alan", agency: "Ajans merkezi (henüz bağlı değil)", dealer: "Bayi merkezi — üst alan",
  settings: "Ayarlar — üst alan", apply_form: "Başvuru formu (henüz bağlı değil)", profile_sections: "Profil — menü üstü alan",
};

/**
 * SDUI v2: ekran düzenlerinin taslağı, yayını ve geri alınması.
 *
 * ## Niçin taslak ve yayın ayrı
 *
 * v1'de kaydet = yayınla idi; yani deneme yapmak canlıyı bozmak demekti. Burada taslak
 * serbestçe kaydedilip önizlenir, kullanıcılar yalnızca yayınlanmışı görür.
 *
 * ## Niçin yüzde
 *
 * "Yayınla" düğmesi "herkese ver" demek olmamalı. Yayın %1'e açılır, sorun görülmezse
 * artırılır. Sorun görülürse yüzdeyi 0'a çekmek saniyeler sürer ve APK beklemez.
 *
 * ## Niçin düz JSON
 *
 * Sürükle-bırak bir düzenleyici, şema büyüdükçe şemanın gerisinde kalır ve sessizce
 * yanlış düzen üretir. Metin düzenleyici sunucunun kabul ettiğinin birebir aynısıdır;
 * kaydetme anında sunucu doğrular ve hatayı Türkçe söyler. Bileşen listesi yan tarafta.
 */
export default function SduiV2() {
  const list = useApi<{ screens: ScreenRow[] }>("/api/admin/sdui2/screens");
  const catalog = useApi<Catalog>("/api/admin/sdui2/catalog");
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [text, setText] = useState("");
  const [versions, setVersions] = useState<Version[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rollout, setRollout] = useState(1);
  const [minApp, setMinApp] = useState("0.0.0");
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!sel) return;
    let alive = true;
    (async () => {
      const d = (await api(`/api/admin/sdui2/screens/${sel}`)) as Detail;
      const h = (await api(`/api/admin/sdui2/screens/${sel}/history`)) as { versions: Version[] };
      if (!alive) return;
      setDetail(d);
      setText(JSON.stringify(d.draft, null, 2));
      setVersions(h.versions);
      setRollout(d.rollout || 1);
      setMinApp(d.minApp || "0.0.0");
      setPreview(null);
    })().catch((e) => setMsg(String(e)));
    return () => { alive = false; };
  }, [sel]);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg(label);
      list.reload();
      if (sel) {
        const d = (await api(`/api/admin/sdui2/screens/${sel}`)) as Detail;
        setDetail(d);
        const h = (await api(`/api/admin/sdui2/screens/${sel}/history`)) as { versions: Version[] };
        setVersions(h.versions);
      }
    } catch (e) {
      setMsg(String(e).replace("Error: ", ""));
    } finally {
      setBusy(false);
    }
  }

  if (list.loading && !list.data) return <Loading />;
  if (list.error && !list.data) return <ErrorBox message={list.error} onRetry={list.reload} />;

  const screens = list.data?.screens ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <p className="mb-3 text-sm text-white/60">
          Ekran düzenleri sunucudan gelir. Yayın yoksa, kullanıcının uygulama sürümü yetmiyorsa
          ya da kullanıcı kademeli açılış diliminde değilse uygulama <b>kendi yerleşik ekranını</b> çizer —
          bu bir hata değil, tasarımın kendisidir.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-white/50">
              <tr>
                <th className="py-1 pr-3">Ekran</th>
                <th className="py-1 pr-3">Durum</th>
                <th className="py-1 pr-3 text-right">Yüzde</th>
                <th className="py-1 pr-3">En düşük sürüm</th>
                <th className="py-1">Sürüm</th>
              </tr>
            </thead>
            <tbody>
              {screens.map((s) => (
                <tr
                  key={s.screenId}
                  onClick={() => setSel(s.screenId)}
                  className={`cursor-pointer border-t border-white/5 ${sel === s.screenId ? "bg-white/5" : ""}`}
                >
                  <td className="py-1.5 pr-3">
                    {TR[s.screenId] ?? s.screenId}
                    <span className="ml-2 text-xs text-white/40">{s.screenId}</span>
                  </td>
                  <td className="py-1.5 pr-3">
                    {!s.live ? (
                      <span className="text-white/40">yayında değil</span>
                    ) : s.rollout === 0 ? (
                      <span className="text-amber-300">kapalı</span>
                    ) : (
                      <span className="text-green-300">yayında</span>
                    )}
                    {s.dirty && <span className="ml-2 text-xs text-amber-300">· yayınlanmamış değişiklik</span>}
                  </td>
                  <td className="py-1.5 pr-3 text-right">{s.live ? `%${s.rollout}` : "—"}</td>
                  <td className="py-1.5 pr-3 text-white/60">{s.minApp}</td>
                  <td className="py-1.5 font-mono text-xs text-white/40">{s.revision?.slice(0, 8) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {msg && (
        <Card>
          <p className="text-sm">{msg}</p>
        </Card>
      )}

      {sel && detail && (
        <>
          <Card>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">{TR[sel] ?? sel} — taslak</h2>
              <span className="text-xs text-white/40">
                {detail.draftBy ? `son düzenleyen: ${detail.draftBy}` : ""}
                {detail.flags.length ? ` · bayraklar: ${detail.flags.join(", ")}` : ""}
              </span>
            </div>
            <textarea
              className={`${inputCls} h-80 font-mono text-xs`}
              value={text}
              spellCheck={false}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                disabled={busy}
                className="rounded bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20"
                onClick={() =>
                  run("Taslak kaydedildi.", async () => {
                    const layout = JSON.parse(text); // bozuk JSON burada yakalanır
                    await api(`/api/admin/sdui2/screens/${sel}/draft`, { method: "PUT", body: { layout } });
                  })
                }
              >
                Taslağı kaydet
              </button>
              <button
                disabled={busy}
                className="rounded bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20"
                onClick={() =>
                  run("Önizleme hazır.", async () => {
                    const p = await api(`/api/admin/sdui2/screens/${sel}/preview?appVersion=${encodeURIComponent(minApp)}`);
                    setPreview(JSON.stringify(p, null, 2));
                  })
                }
              >
                Önizle ({minApp} gözüyle)
              </button>
              <span className="ml-auto flex items-center gap-2 text-sm">
                <label className="text-white/60">Yüzde</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={rollout}
                  onChange={(e) => setRollout(Number(e.target.value))}
                  className={`${inputCls} w-20`}
                />
                <label className="text-white/60">En düşük sürüm</label>
                <input value={minApp} onChange={(e) => setMinApp(e.target.value)} className={`${inputCls} w-28`} />
                <button
                  disabled={busy}
                  className="rounded bg-[#d7b56d]/20 px-3 py-1.5 text-sm text-[#d7b56d] hover:bg-[#d7b56d]/30"
                  onClick={() => {
                    if (rollout > 10 && !confirm(`Bu ekran kullanıcıların %${rollout}'ine açılacak. Emin misiniz?`)) return;
                    run("Yayınlandı.", async () => {
                      await api(`/api/admin/sdui2/screens/${sel}/publish`, { method: "POST", body: { rollout, minApp } });
                    });
                  }}
                >
                  Yayınla
                </button>
                {detail.revision && (
                  <button
                    disabled={busy}
                    className="rounded bg-red-500/15 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/25"
                    onClick={() => run("Kapatıldı (%0).", async () => {
                      await api(`/api/admin/sdui2/screens/${sel}/rollout`, { method: "POST", body: { rollout: 0 } });
                    })}
                  >
                    Acil kapat
                  </button>
                )}
              </span>
            </div>
          </Card>

          {preview && (
            <Card>
              <h3 className="mb-2 text-sm font-semibold">Önizleme — sunucunun o sürüme göndereceği ağaç</h3>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs text-white/70">{preview}</pre>
            </Card>
          )}

          <Card>
            <h3 className="mb-2 text-sm font-semibold">Yayın geçmişi</h3>
            {versions.length === 0 ? (
              <p className="text-sm text-white/50">Bu ekran hiç yayınlanmadı.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {versions.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center gap-x-3 border-t border-white/5 py-1.5">
                    <span className="font-mono text-xs text-white/40">{v.revision.slice(0, 8)}</span>
                    <span className="text-white/60">%{v.rollout}</span>
                    <span className="text-white/40">≥ {v.minApp}</span>
                    <span className="text-white/40">{new Date(v.createdAt).toLocaleString("tr-TR")}</span>
                    {v.createdBy && <span className="text-white/40">{v.createdBy}</span>}
                    {v.note && <span className="text-white/50">{v.note}</span>}
                    <button
                      disabled={busy}
                      className="ml-auto text-xs text-[#d7b56d] hover:underline"
                      onClick={() => {
                        if (!confirm("Bu sürüme dönülecek. Taslak da bu sürümle değiştirilir.")) return;
                        run("Geri alındı.", async () => {
                          await api(`/api/admin/sdui2/screens/${sel}/rollback`, { method: "POST", body: { versionId: Number(v.id) } });
                          const d = (await api(`/api/admin/sdui2/screens/${sel}`)) as Detail;
                          setText(JSON.stringify(d.draft, null, 2));
                        });
                      }}
                    >
                      Bu sürüme dön
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      {catalog.data && (
        <Card>
          <h3 className="mb-2 text-sm font-semibold">Bileşen kataloğu</h3>
          <p className="mb-2 text-xs text-white/50">
            Sunucunun kabul ettiği tam liste. Burada olmayan bir tür ya da alan kaydedilmez;
            <b> api</b> eylemi serbest adres almaz, yalnızca aşağıdaki izinli adları alır.
          </p>
          <div className="grid gap-3 text-xs md:grid-cols-2">
            <div>
              <p className="mb-1 text-white/60">Bileşenler</p>
              <ul className="space-y-0.5">
                {Object.entries(catalog.data.components).map(([type, spec]) => (
                  <li key={type}>
                    <code className="text-[#d7b56d]">{type}</code>
                    <span className="text-white/40"> — {Object.keys(spec.props).join(", ") || "alan yok"}</span>
                    {spec.children && <span className="text-white/30"> · alt bileşen alır</span>}
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <p className="text-white/60">İzinli işlemler (api)</p>
              <p className="text-white/40">{catalog.data.apiActions.join(" · ")}</p>
              <p className="text-white/60">Açılabilen ekranlar</p>
              <p className="text-white/40">{catalog.data.openScreens.join(" · ")}</p>
              <p className="text-white/60">Veri kaynakları</p>
              <p className="text-white/40">{catalog.data.sources.join(" · ")}</p>
              <p className="text-white/60">Simgeler</p>
              <p className="text-white/40">{catalog.data.icons.join(" · ")}</p>
              <p className="text-white/60">Renk rolleri</p>
              <p className="text-white/40">{catalog.data.tones.join(" · ")}</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
