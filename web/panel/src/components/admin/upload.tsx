"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { api, apiBinary, absoluteUrl, fmtNumber } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { Card, Notice, PageHeader, inputCls } from "@/components/ui";
import { ActionMsg, Field, Tabs, btnGhost, selectCls, useAction } from "./kit";

type Media = { url: string; kind: string; format: string; size: number; note: string | null; iconUrl: string | null };
const ANIM_ACCEPT = ".mp4,.svga,.json,.webp,.gif,.png,.jpg,.jpeg";
const mb = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);

/** Dosyayı sunucuya yükler; mp4 şeffaflığı, otomatik küçük resim ve medya bütçesi sunucuda uygulanır. */
function MediaInput({ label, purpose, accept = ANIM_ACCEPT, value, onChange }: { label: string; purpose: string; accept?: string; value: Media | null; onChange: (m: Media | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [alpha, setAlpha] = useState<"auto" | "left" | "right">("auto");
  async function pick(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    setErr("");
    try {
      onChange(await apiBinary<Media>(`/api/admin/media?purpose=${purpose}&alpha=${alpha}`, f));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Yüklenemedi.");
      onChange(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Field label={label} hint="mp4 (şeffaf / VAP), svga, Lottie json, webp, gif, png. En fazla 40 MB. Büyük dosya otomatik sınıra indirilir.">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input type="file" accept={accept} disabled={busy} onChange={(e) => pick(e.target.files?.[0])} className="text-sm text-gray-300 file:mr-3 file:rounded-lg file:border-0 file:bg-[#292114] file:px-3 file:py-2 file:text-[#d7b56d]" />
        <select className={selectCls} value={alpha} onChange={(e) => setAlpha(e.target.value as "auto" | "left" | "right")} title="mp4 şeffaflık maskesi">
          <option value="auto">mp4 maskesi: otomatik</option>
          <option value="left">Maske solda</option>
          <option value="right">Maske sağda</option>
        </select>
      </div>
      {busy && <p className="mt-2 text-sm text-gray-400">Yükleniyor ve hazırlanıyor… (videolar biraz sürebilir)</p>}
      {err && <p className="mt-2 text-sm text-red-300">{err}</p>}
      {value && (
        <div className="mt-2 flex items-center gap-3 rounded-lg bg-[#171717] p-2 text-xs text-gray-300">
          {value.iconUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={absoluteUrl(value.iconUrl) ?? ""} alt="" className="h-12 w-12 rounded object-contain" />
          )}
          <span>
            {value.format.toUpperCase()} · {mb(value.size)}
            {value.note ? ` · ${value.note}` : ""}
          </span>
        </div>
      )}
    </Field>
  );
}

export default function AdminUpload() {
  const [tab, setTab] = useState<"gift" | "frame" | "effect" | "store" | "pack" | "icons">("gift");
  return (
    <div>
      <PageHeader icon={<Upload size={18} />} kicker="Katalog" title="İçerik Yükle" description="Hediye, çerçeve, giriş efekti, mağaza ürünü ve hazır paket yükleme. Düzenleme ve gizleme Katalog sayfasında." />
      <Tabs
        tabs={[
          { key: "gift", label: "Hediye" },
          { key: "frame", label: "Çerçeve" },
          { key: "effect", label: "Giriş efekti" },
          { key: "store", label: "Mağaza ürünü" },
          { key: "pack", label: "Hazır paket (zip)" },
          { key: "icons", label: "Eksik küçük resimler" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "gift" && <GiftForm />}
      {tab === "frame" && <SimpleForm kind="frame" />}
      {tab === "effect" && <SimpleForm kind="effect" />}
      {tab === "store" && <StoreForm />}
      {tab === "pack" && <PackForm />}
      {tab === "icons" && <FillIcons />}
    </div>
  );
}

const CATS: [string, string][] = [["popular", "Popüler"], ["event", "Etkinlik"], ["lucky", "Şanslı"], ["cp", "CP / Çift"], ["vip", "VIP"], ["private", "Özel"]];

function GiftForm() {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [cat, setCat] = useState("popular");
  const [mode, setMode] = useState<"full" | "seat">("full");
  const [anim, setAnim] = useState<Media | null>(null);
  const [icon, setIcon] = useState<Media | null>(null);
  const { busy, msg, run } = useAction();
  const coins = price.replace(/\D/g, "");
  return (
    <Card title="Yeni hediye">
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Ad">
            <input className={inputCls} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Fiyat (Coin)">
            <input className={inputCls} inputMode="numeric" value={coins ? fmtNumber(coins) : ""} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <Field label="Sekme">
            <select className={`${selectCls} w-full`} value={cat} onChange={(e) => setCat(e.target.value)}>
              {CATS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Oynatma yeri">
            <select className={`${selectCls} w-full`} value={mode} onChange={(e) => setMode(e.target.value as "full" | "seat")}>
              <option value="full">Tam ekran</option>
              <option value="seat">Alıcının mikinde</option>
            </select>
          </Field>
        </div>
        <MediaInput key={`a-${mode}`} label="Animasyon dosyası" purpose={mode === "seat" ? "seat" : "gift"} value={anim} onChange={setAnim} />
        <MediaInput label="Küçük resim (isteğe bağlı; boşsa animasyondan otomatik)" purpose="icon" accept=".png,.webp,.jpg,.jpeg,.gif" value={icon} onChange={setIcon} />
        <ActionMsg msg={msg} />
        <button
          type="button"
          className="gold-button disabled:opacity-60"
          disabled={busy || name.trim().length < 2 || !coins || !anim}
          onClick={() =>
            run("Hediye eklendi; uygulamada hemen görünür.", async () => {
              await api("/api/admin/gifts", {
                method: "POST",
                body: { name: name.trim(), coinPrice: coins, animationUrl: anim?.url, animationFormat: anim?.format, iconUrl: icon?.url ?? anim?.iconUrl ?? undefined, category: cat, playMode: mode },
              });
              setName("");
              setPrice("");
              setAnim(null);
              setIcon(null);
            })
          }
        >
          Hediyeyi ekle
        </button>
      </div>
    </Card>
  );
}

function SimpleForm({ kind }: { kind: "frame" | "effect" }) {
  const [name, setName] = useState("");
  const [file, setFile] = useState<Media | null>(null);
  const [secs, setSecs] = useState("4");
  const { busy, msg, run } = useAction();
  return (
    <Card title={kind === "frame" ? "Yeni çerçeve" : "Yeni giriş efekti"} subtitle={kind === "frame" ? "Mağazada satmak için Mağaza ürünü sekmesini kullanın." : undefined}>
      <div className="space-y-4">
        <Field label="Ad">
          <input className={inputCls} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
        </Field>
        <MediaInput label="Dosya" purpose={kind === "frame" ? "frame" : "gift"} value={file} onChange={setFile} />
        {kind === "effect" && (
          <Field label="Süre (saniye)">
            <input className={inputCls} inputMode="numeric" value={secs} onChange={(e) => setSecs(e.target.value.replace(/\D/g, ""))} />
          </Field>
        )}
        <ActionMsg msg={msg} />
        <button
          type="button"
          className="gold-button disabled:opacity-60"
          disabled={busy || name.trim().length < 2 || !file}
          onClick={() =>
            run("Eklendi.", async () => {
              if (kind === "frame") await api("/api/admin/frames", { method: "POST", body: { name: name.trim(), imageUrl: file?.url } });
              else await api("/api/admin/entrance-effects", { method: "POST", body: { name: name.trim(), animationUrl: file?.url, durationMs: Math.min(20, Math.max(1, Number(secs) || 4)) * 1000 } });
              setName("");
              setFile(null);
            })
          }
        >
          Ekle
        </button>
      </div>
    </Card>
  );
}

const STORE: [string, string][] = [
  ["frame", "Çerçeve"], ["entrance_effect", "Giriş efekti"], ["vehicle", "Araç"], ["chat_bubble", "Sohbet balonu"],
  ["mini_card", "Mini kart"], ["mic_wave", "Mik dalgası"], ["room_card", "Oda kartı"], ["badge", "Rozet (satılmaz, verilir)"],
];

function StoreForm() {
  const [cat, setCat] = useState("frame");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [days, setDays] = useState("14");
  const [file, setFile] = useState<Media | null>(null);
  const { busy, msg, run } = useAction();
  const coins = price.replace(/\D/g, "");
  return (
    <Card title="Yeni mağaza ürünü">
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Kategori">
            <select className={`${selectCls} w-full`} value={cat} onChange={(e) => setCat(e.target.value)}>
              {STORE.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ad">
            <input className={inputCls} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Fiyat (Coin)" hint="0: satışta değil, yalnızca verilir">
            <input className={inputCls} inputMode="numeric" value={coins ? fmtNumber(coins) : ""} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <Field label="Süre (gün)">
            <input className={inputCls} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} />
          </Field>
        </div>
        <MediaInput key={cat} label="Dosya" purpose={cat === "frame" || cat === "mic_wave" || cat === "badge" ? "frame" : "gift"} value={file} onChange={setFile} />
        <ActionMsg msg={msg} />
        <button
          type="button"
          className="gold-button disabled:opacity-60"
          disabled={busy || name.trim().length < 2 || !file || !days}
          onClick={() =>
            run("Ürün eklendi.", async () => {
              await api("/api/admin/store/items", {
                method: "POST",
                body: { category: cat, name: name.trim(), imageUrl: file?.url, priceCoins: coins || "0", durationDays: Number(days), forSale: !!coins && coins !== "0" },
              });
              setName("");
              setPrice("");
              setFile(null);
            })
          }
        >
          Ürünü ekle
        </button>
      </div>
    </Card>
  );
}

type PackResult = { ok: boolean; added: number; updated: number; same: number; deleted: number; failed: number; results: { name?: string; status: string; error?: string }[] };

function PackForm() {
  const [res, setRes] = useState<PackResult | null>(null);
  const { busy, msg, run } = useAction();
  const st = useApi<{ serverVersion?: string; packs?: unknown }>("/api/admin/asset-pack/status");
  return (
    <Card title="Hazır hediye / çerçeve paketi" subtitle="TR-Live-paket-N.zip dosyasını seçin; içindeki hediye ve çerçeveler hemen eklenir / güncellenir.">
      <div className="space-y-4">
        <input
          type="file"
          accept=".zip"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            run("Paket uygulandı.", async () => {
              setRes(await apiBinary<PackResult>("/api/admin/asset-pack", f));
              st.reload();
            });
          }}
          className="text-sm text-gray-300 file:mr-3 file:rounded-lg file:border-0 file:bg-[#292114] file:px-3 file:py-2 file:text-[#d7b56d]"
        />
        {busy && <p className="text-sm text-gray-400">Paket yükleniyor ve uygulanıyor…</p>}
        <ActionMsg msg={msg} />
        {res && (
          <div className="space-y-2">
            <Notice tone={res.failed ? "error" : "ok"}>
              Eklenen {res.added} · güncellenen {res.updated} · aynı {res.same} · silinen {res.deleted} · hatalı {res.failed}
            </Notice>
            <ul className="max-h-72 space-y-1 overflow-y-auto text-xs text-gray-400">
              {res.results
                .filter((r) => r.status !== "same")
                .map((r, i) => (
                  <li key={i}>
                    {r.name ?? "?"}: {r.status}
                    {r.error ? ` (${r.error})` : ""}
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

function FillIcons() {
  const [progress, setProgress] = useState("");
  const { busy, msg, run } = useAction();
  return (
    <Card title="Eksik küçük resimler" subtitle="Küçük resmi olmayan hediyelere animasyondan otomatik küçük resim yapılır.">
      <button
        type="button"
        className={btnGhost}
        disabled={busy}
        onClick={() =>
          run("Bitti.", async () => {
            let skip = 0;
            let done = 0;
            for (let i = 0; i < 500; i++) {
              const r = await api<{ total: number; done: number; failed: number; left: number }>("/api/admin/gifts/fill-icons", { method: "POST", body: { skip } });
              done += r.done;
              skip += r.failed;
              setProgress(`Yapılan ${done} · kalan ${r.left}`);
              if (!r.total || r.left - skip <= 0) break;
            }
          })
        }
      >
        Başlat
      </button>
      {progress && <p className="mt-3 text-sm text-gray-400">{progress}</p>}
      <ActionMsg msg={msg} />
    </Card>
  );
}
