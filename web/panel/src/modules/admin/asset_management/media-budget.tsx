"use client";

import { useRef, useState } from "react";
import { Gauge, Undo2, Zap } from "lucide-react";
import { api } from "@/core/api/api";
import { useApi } from "@/core/api/use-api";
import { Badge, Card, Empty, ErrorBox, Loading, Notice, PageHeader, StatCard, inputCls } from "@/shared/components/ui";
import { ActionMsg, Tabs, btnGhost, btnSmall, useAction } from "@/shared/components/kit";
import { ConfigForm } from "@/modules/admin/settings/config-form";

type Item = {
  id: string; kind: string | null; cls: string; bytes: number; state: string; names: string[]; uses: string[];
  over: string[]; note: string | null; manual: boolean; failed: boolean; w: number | null; h: number | null; fps: number | null;
  decodedMb: number | null; from: string | null; beforeBytes: number | null; kept: boolean;
};
type Status = {
  ffmpeg: boolean;
  summary: { files: number; ok: number; over: number; unchecked: number; exempt: number; totalBytes: number; savedBytes: number; backupFiles: number; backupBytes: number };
  items: Item[];
  gifts: { id: string; name: string; exempt: boolean }[];
};

const mb = (b?: number | null) => (b == null ? "—" : b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
const clsText: Record<string, string> = { gift: "tam ekran", small: "çerçeve / mik", icon: "küçük resim" };

function stateOf(it: Item): [string, "green" | "red" | "gold" | "gray" | "blue"] {
  switch (it.state) {
    case "ok":
      return [it.from ? "Küçültüldü" : it.kept ? "Geri alındı" : "Sınır içinde", "green"];
    case "over":
      return [it.manual ? "Elle çözülmeli" : "Sınırı aşıyor", "red"];
    case "exempt":
      return ["Sınır dışı", "gold"];
    case "unsupported":
      return ["Desteklenmiyor", "gray"];
    default:
      return ["Denetlenmedi", "blue"];
  }
}

export default function AdminMediaBudget() {
  const [tab, setTab] = useState<"files" | "exempt" | "limits">("files");
  const st = useApi<Status>("/api/admin/media-budget");
  const s = st.data?.summary;
  return (
    <div>
      <PageHeader
        icon={<Gauge size={18} />}
        kicker="Katalog"
        title="Medya Bütçesi"
        description="Hediye, çerçeve ve efekt dosyalarının üst sınırları. Sınırı aşan dosya yüklenirken ve buradan toplu olarak otomatik küçültülür; orijinali yedek kalır."
      />
      {st.data && !st.data.ffmpeg && <Notice tone="error">Sunucuda ffmpeg yok: dosyalar ölçülebilir ama küçültülemez.</Notice>}
      {s && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Dosya" value={String(s.files)} note={`Toplam ${mb(s.totalBytes)}`} />
          <StatCard label="Sınırı aşan" value={String(s.over)} note={`${s.unchecked} denetlenmedi`} tone={s.over + s.unchecked > 0 ? "red" : "green"} />
          <StatCard label="Kazanılan" value={mb(s.savedBytes)} tone="green" />
          <StatCard label="Yedekler" value={mb(s.backupBytes)} note={`${s.backupFiles} dosya`} tone="blue" />
        </div>
      )}
      <Tabs
        tabs={[
          { key: "files", label: "Dosyalar" },
          { key: "exempt", label: "Sınır dışı hediyeler" },
          { key: "limits", label: "Üst sınırlar" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {st.loading && !st.data && <Loading />}
      {st.error && <ErrorBox message={st.error} onRetry={st.reload} />}
      {st.data && tab === "files" && <Files data={st.data} reload={st.reload} />}
      {st.data && tab === "exempt" && <Exempt data={st.data} reload={st.reload} />}
      {tab === "limits" && (
        <ConfigForm
          title="Üst sınırlar"
          subtitle="Kaydedince tüm dosyalar yeni sınırlara göre yeniden denetlenir."
          onSaved={st.reload}
          fields={[
            { key: "mediaBudgetAuto", label: "Yüklenen dosyayı otomatik sınıra indir", type: "bool" },
            { key: "mediaMp4MaxWidth", label: "Video (mp4): görüntü genişliği", type: "int", suffix: "px" },
            { key: "mediaMp4MaxHeight", label: "Video (mp4): yükseklik", type: "int", suffix: "px" },
            { key: "mediaMp4MaxFps", label: "Video (mp4): en çok kare/sn", type: "int" },
            { key: "mediaMp4MaxKb", label: "Video (mp4): en büyük dosya", type: "int", suffix: "KB" },
            { key: "mediaSvgaMaxKb", label: "SVGA: en büyük dosya", type: "int", suffix: "KB" },
            { key: "mediaSvgaMaxSide", label: "SVGA: görsellerin en uzun kenarı", type: "int", suffix: "px" },
            { key: "mediaSvgaMaxDecodedMb", label: "SVGA: açılınca kaplayacağı bellek", type: "int", suffix: "MB" },
            { key: "mediaImageMaxSide", label: "Webp / gif / png: en uzun kenar", type: "int", suffix: "px" },
            { key: "mediaImageMaxKb", label: "Webp / gif / png: en büyük dosya", type: "int", suffix: "KB" },
            { key: "mediaSmallMaxSide", label: "Çerçeve ve mikte oynayan hediye: en uzun kenar", type: "int", suffix: "px" },
            { key: "mediaIconMaxSide", label: "Hediye küçük resmi: en uzun kenar", type: "int", suffix: "px" },
          ]}
        />
      )}
    </div>
  );
}

function Files({ data, reload }: { data: Status; reload: () => void }) {
  const { busy, msg, setMsg, run } = useAction();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const stop = useRef(false);
  const [filter, setFilter] = useState<"all" | "over" | "fixed">("all");
  const s = data.summary;

  async function runAll() {
    if (running) return;
    setRunning(true);
    stop.current = false;
    setMsg(null);
    let fixed = 0;
    let saved = 0;
    let manual = 0;
    try {
      for (let i = 0; i < 3000 && !stop.current; i++) {
        const r = await api<{ done: boolean; left: number; result: { changed: boolean; beforeBytes?: number; afterBytes?: number; over?: string[] } | null }>(
          "/api/admin/media-budget/run",
          { method: "POST" }
        );
        if (r.done) break;
        if (r.result?.changed) {
          fixed++;
          saved += (r.result.beforeBytes ?? 0) - (r.result.afterBytes ?? 0);
        } else if (r.result?.over?.length) manual++;
        setProgress(`Kalan ${r.left} · küçültülen ${fixed} · kazanılan ${mb(saved)}`);
      }
      setMsg({ tone: "ok", text: `${fixed} dosya küçültüldü, ${mb(saved)} kazanıldı${manual ? ` · ${manual} dosya elle çözülmeli` : ""}.` });
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof Error ? e.message : "İşlem durdu." });
    } finally {
      setRunning(false);
      setProgress("");
      reload();
    }
  }

  const items = data.items.filter((it) => (filter === "all" ? true : filter === "over" ? it.state === "over" || it.state === "unchecked" : !!it.from));
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="gold-button inline-flex items-center gap-2" onClick={() => (running ? (stop.current = true) : runAll())} disabled={!data.ffmpeg && !running}>
            <Zap size={16} />
            {running ? "Durdur" : s.over + s.unchecked > 0 ? "Hepsini kontrol et ve sınıra indir" : "Yeniden kontrol et"}
          </button>
          {s.backupFiles > 0 && (
            <button
              type="button"
              className={btnGhost}
              disabled={busy || running}
              onClick={() =>
                run("Kullanılmayan yedekler silindi.", async () => {
                  if (!window.confirm(`${s.backupFiles} yedek dosya (${mb(s.backupBytes)}) silinecek; silinen yedekler geri alınamaz. Hâlâ bir yerde kullanılan yedekler korunur.`)) return false;
                  await api("/api/admin/media-budget/cleanup", { method: "POST" });
                  reload();
                })
              }
            >
              Yedekleri temizle
            </button>
          )}
          <select className={inputCls + " w-auto"} value={filter} onChange={(e) => setFilter(e.target.value as "all" | "over" | "fixed")}>
            <option value="all">Tüm dosyalar</option>
            <option value="over">Sınırı aşan / denetlenmeyen</option>
            <option value="fixed">Küçültülenler</option>
          </select>
        </div>
        {progress && <p className="mt-3 text-sm text-gray-400">{progress}</p>}
        <div className="mt-3">
          <ActionMsg msg={msg} />
        </div>
      </Card>
      <Card title={`Dosyalar (${items.length})`} subtitle="Büyükten küçüğe">
        {items.length === 0 ? (
          <Empty title="Dosya yok." />
        ) : (
          <div className="space-y-2">
            {items.map((it) => (
              <FileRow key={it.id} it={it} disabled={running} reload={reload} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function FileRow({ it, disabled, reload }: { it: Item; disabled: boolean; reload: () => void }) {
  const { busy, msg, run } = useAction();
  const [label, tone] = stateOf(it);
  const meta = [
    (it.kind ?? "?").toUpperCase(),
    clsText[it.cls] ?? it.cls,
    mb(it.bytes) + (it.from && it.beforeBytes ? ` (önceden ${mb(it.beforeBytes)})` : ""),
    it.w ? `${it.w}×${it.h ?? "?"}` : "",
    it.fps ? `${Math.round(it.fps)} kare/sn` : "",
    it.decodedMb != null ? `bellek ${it.decodedMb} MB` : "",
  ].filter(Boolean);
  return (
    <div className="rounded-xl border border-[#30291e] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1 truncate font-medium text-white">{it.names.join(", ") || "—"}</div>
        <Badge tone={tone}>{label}</Badge>
      </div>
      <div className="mt-1 text-xs text-gray-500">{meta.join(" · ")}</div>
      {it.over.map((o) => (
        <div key={o} className="text-xs text-red-300">
          • {o}
        </div>
      ))}
      {!it.over.length && it.note && it.state !== "ok" && <div className="text-xs text-gray-500">{it.note}</div>}
      {(it.state === "over" || it.state === "unchecked" || (it.from && it.state === "ok")) && (
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          {it.from && it.state === "ok" && (
            <button
              type="button"
              className={btnSmall}
              disabled={busy || disabled}
              onClick={() =>
                run("Orijinal dosyaya dönüldü.", async () => {
                  if (!window.confirm("Bu dosya orijinal haline döndürülsün mü? Hediye yeniden büyük dosyayı kullanır.")) return false;
                  await api(`/api/admin/media-budget/revert/${it.id}`, { method: "POST" });
                  reload();
                })
              }
            >
              <Undo2 size={13} /> Geri al
            </button>
          )}
          {(it.state === "over" || it.state === "unchecked") && (
            <button
              type="button"
              className={btnSmall}
              disabled={busy || disabled}
              onClick={() =>
                run("İşlendi.", async () => {
                  const r = await api<{ note?: string; changed?: boolean }>(`/api/admin/media-budget/optimize/${it.id}`, { method: "POST" });
                  reload();
                  if (!r.changed && r.note) throw new Error(r.note);
                })
              }
            >
              <Zap size={13} /> Şimdi küçült
            </button>
          )}
        </div>
      )}
      <ActionMsg msg={msg} />
    </div>
  );
}

function Exempt({ data, reload }: { data: Status; reload: () => void }) {
  const { busy, msg, run } = useAction();
  const [q, setQ] = useState("");
  const list = data.gifts.filter((g) => !q.trim() || g.name.toLocaleLowerCase("tr-TR").includes(q.trim().toLocaleLowerCase("tr-TR")));
  return (
    <Card title="Sınır dışı hediyeler" subtitle="İşaretli hediyelerin dosyası küçültülmez (ör. kral, kraliçe, çift hediyeleri).">
      <input className={`${inputCls} mb-4`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hediye ara" />
      <ActionMsg msg={msg} />
      <div className="grid gap-2 md:grid-cols-2">
        {list.map((g) => (
          <label key={g.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-[#262117] bg-[#141210] px-4 py-3">
            <span className="text-sm text-gray-200">{g.name}</span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#d7b56d]"
              checked={g.exempt}
              disabled={busy}
              onChange={(e) =>
                run(e.target.checked ? `${g.name} sınır dışı.` : `${g.name} sınıra dahil.`, async () => {
                  await api("/api/admin/media-budget/exempt", { method: "POST", body: { giftId: g.id, exempt: e.target.checked } });
                  reload();
                })
              }
            />
          </label>
        ))}
      </div>
    </Card>
  );
}
