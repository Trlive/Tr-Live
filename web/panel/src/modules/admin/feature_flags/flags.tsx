"use client";
import { useState } from "react";
import { api } from "@/core/api/api";
import { useApi } from "@/core/api/use-api";
import { Card, Loading, ErrorBox, inputCls } from "@/shared/components/ui";

type Flag = {
  key: string;
  description: string;
  enabled: boolean;
  rollout_percent: number;
  allow_user_ids: string[];
  deny_user_ids: string[];
  min_app_version: string;
  platforms: string[];
  updated_at: string;
};

const PRESETS = [0, 1, 5, 10, 25, 50, 100];

/**
 * Özellik bayrakları ekranı.
 *
 * Canlıda ilerleme kararımızın güvenlik valfi: riskli bir özellik önce %1 kullanıcıya açılır,
 * sorun çıkmazsa oran artırılır, bir şey bozulursa tek tıkla sıfıra iner. Etki bir sonraki
 * uygulama açılışında görülür — yeni APK ve mağaza onayı beklenmez.
 */
export default function FeatureFlags() {
  const { data, error, loading, reload } = useApi<{ flags: Flag[] }>("/api/admin/flags");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const flags = data?.flags ?? [];

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox message={error} onRetry={reload} />;

  async function save(key: string, patch: Record<string, unknown>) {
    setBusy(key);
    setErr("");
    try {
      await api(`/api/admin/flags/${key}`, { method: "PUT", body: patch });
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Kaydedilemedi.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="text-sm text-white/70">
          Riskli bir özelliği önce küçük bir orana açın, sorun çıkmazsa artırın. Bir şey bozulursa
          oranı <b>0</b> yapın — etki bir sonraki uygulama açılışında biter, yeni sürüm beklenmez.
          Oran, kullanıcı kimliğinin karmasıyla hesaplanır: aynı kullanıcı her zaman aynı sonucu alır,
          özellik gelip gitmez.
        </div>
      </Card>

      {err && <div className="rounded-lg bg-red-500/15 p-3 text-sm text-red-300">{err}</div>}

      <Storage />

      {flags.map((f) => (
        <Card key={f.key}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-mono text-sm text-[#d7b56d]">{f.key}</div>
              <div className="text-sm text-white/70">{f.description || "—"}</div>
              <div className="mt-1 text-xs text-white/40">
                {f.min_app_version ? `en az sürüm ${f.min_app_version} · ` : ""}
                {f.platforms.length ? `${f.platforms.join(", ")} · ` : ""}
                {f.allow_user_ids.length ? `${f.allow_user_ids.length} her zaman açık · ` : ""}
                {f.deny_user_ids.length ? `${f.deny_user_ids.length} her zaman kapalı · ` : ""}
                son değişiklik {new Date(f.updated_at).toLocaleString("tr-TR")}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={f.enabled}
                disabled={busy === f.key}
                onChange={(e) => save(f.key, { enabled: e.target.checked })}
                className="h-4 w-4 accent-[#d7b56d]"
              />
              Açık
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-sm text-white/60">Oran:</span>
            {PRESETS.map((p) => (
              <button
                key={p}
                disabled={busy === f.key}
                onClick={() => save(f.key, { rolloutPercent: p })}
                className={`rounded-md px-2.5 py-1 text-sm ${
                  f.rollout_percent === p ? "bg-[#d7b56d] text-black" : "bg-white/10 text-white/80 hover:bg-white/20"
                }`}
              >
                %{p}
              </button>
            ))}
            {!f.enabled && f.rollout_percent > 0 && (
              <span className="text-xs text-amber-300">
                Bayrak kapalı olduğu için oran uygulanmıyor.
              </span>
            )}
          </div>

          <FlagCheck flagKey={f.key} />
        </Card>
      ))}
    </div>
  );
}

/**
 * "Bu kullanıcıda açık mı?" — kademeli açmada en sık sorulan soru.
 *
 * Kovasını da gösterir: "%10'a çıkardım ama hâlâ görmüyor" durumunun cevabı kovadadır
 * (kova 10'dan büyükse henüz sırası gelmemiştir).
 */
function FlagCheck({ flagKey }: { flagKey: string }) {
  const [userId, setUserId] = useState("");
  const [res, setRes] = useState<null | { on: boolean; bucket: number; rolloutPercent: number; inAllowList: boolean; inDenyList: boolean; user: { displayName: string } }>(null);
  const [msg, setMsg] = useState("");

  async function check() {
    setMsg("");
    setRes(null);
    try {
      setRes(await api(`/api/admin/flags/${flagKey}/check?userId=${encodeURIComponent(userId.trim())}`));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Sorgulanamadı.");
    }
  }

  return (
    <div className="mt-3 border-t border-white/10 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="Kullanıcı kimliği (UUID)"
          className={`${inputCls} max-w-xs`}
        />
        <button
          onClick={check}
          disabled={!userId.trim()}
          className="rounded-md bg-[#d7b56d] px-3 py-1.5 text-sm font-medium text-black disabled:opacity-40"
        >
          Bu kullanıcıda açık mı?
        </button>
      </div>
      {msg && <div className="mt-2 text-sm text-red-300">{msg}</div>}
      {res && (
        <div className="mt-2 text-sm">
          <b>{res.user.displayName}</b>:{" "}
          <span className={res.on ? "text-emerald-300" : "text-white/60"}>{res.on ? "AÇIK" : "kapalı"}</span>
          <span className="text-white/40">
            {" "}· kova {res.bucket} / oran %{res.rolloutPercent}
            {res.inAllowList ? " · her zaman açık listesinde" : ""}
            {res.inDenyList ? " · her zaman kapalı listesinde" : ""}
          </span>
        </div>
      )}
    </div>
  );
}

type Status = {
  enabled: boolean;
  publicBase: string | null;
  total: string;
  moved: string;
  dropped: string;
  bytes_total: string;
  bytes_pending: string;
  lastRun: { at: string | null; moved: number; failed: number; error: string | null };
};

const mb = (n: string) => `${(Number(n) / 1048576).toFixed(1)} MB`;

/**
 * Medya deposu: görsellerin veritabanından R2'ye taşınma durumu.
 *
 * Bugün her hediye animasyonu ve çerçeve `media_files` tablosunda bayt olarak duruyor; her
 * görüntüleme bir veritabanı okuması. Taşındıkça adresler CDN'e yönleniyor ve veritabanı asıl
 * işine (finansal işlemler) dönüyor.
 */
function Storage() {
  const { data, reload } = useApi<Status>("/api/admin/storage/status");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  if (!data) return null;

  const total = Number(data.total) || 0;
  const moved = Number(data.moved) || 0;
  const pct = total ? Math.round((moved / total) * 100) : 0;

  async function run(path: string, body: Record<string, unknown>, ok: string) {
    setBusy(true);
    setMsg("");
    try {
      await api(path, { method: "POST", body });
      setMsg(ok);
      reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "İşlem başarısız.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Medya deposu (R2)">
      {!data.enabled ? (
        <div className="text-sm text-white/70">
          R2 yapılandırılmamış — görseller veritabanından sunuluyor. Ayarlar ekranındaki beş R2
          alanının <b>hepsi</b> doldurulunca taşıma kendiliğinden başlar (saatte bir, 25 dosya).
          Yarım yapılandırma ile başlanmaz: dosyaların yarısını R2'de yarısını veritabanında
          bırakmak, temizlemesi taşımaktan zor bir karışıklık yaratır.
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <div>
            CDN: <span className="font-mono text-[#d7b56d]">{data.publicBase}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded bg-white/10">
            <div className="h-full bg-[#d7b56d]" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-white/70">
            {moved.toLocaleString("tr-TR")} / {total.toLocaleString("tr-TR")} dosya taşındı (%{pct}) ·
            veritabanında bekleyen {mb(data.bytes_pending)} / toplam {mb(data.bytes_total)} ·
            veritabanı kopyası silinen {Number(data.dropped).toLocaleString("tr-TR")}
          </div>
          {data.lastRun?.at && (
            <div className="text-xs text-white/40">
              son tur {new Date(data.lastRun.at).toLocaleString("tr-TR")}: {data.lastRun.moved} taşındı
              {data.lastRun.failed ? `, ${data.lastRun.failed} başarısız` : ""}
              {data.lastRun.error ? ` — ${data.lastRun.error}` : ""}
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              disabled={busy}
              onClick={() => run("/api/admin/storage/offload", { limit: 100 }, "Taşıma turu çalıştı.")}
              className="rounded-md bg-[#d7b56d] px-3 py-1.5 text-sm font-medium text-black disabled:opacity-40"
            >
              Şimdi 100 dosya taşı
            </button>
            <button
              disabled={busy}
              onClick={() => {
                if (!confirm("7 günden önce taşınmış dosyaların veritabanı kopyası silinecek. CDN'den okunabildiklerini doğruladınız mı?")) return;
                run("/api/admin/storage/drop-db-copies", { olderThanDays: 7, limit: 500 }, "Veritabanı kopyaları silindi.");
              }}
              className="rounded-md bg-white/10 px-3 py-1.5 text-sm text-white/80 hover:bg-white/20 disabled:opacity-40"
            >
              Veritabanı kopyalarını sil (7+ gün)
            </button>
          </div>
          <div className="text-xs text-white/40">
            Taşıma ile veritabanı kopyasının silinmesi bilerek ayrı: R2'de sorun çıkarsa taşıma geri
            alınabilsin diye bir süre iki kopya birden durur.
          </div>
        </div>
      )}
      {msg && <div className="mt-2 text-sm text-white/80">{msg}</div>}
    </Card>
  );
}
