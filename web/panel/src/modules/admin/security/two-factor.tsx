"use client";
import { useState } from "react";
import { api } from "@/core/api/api";
import { useApi } from "@/core/api/use-api";
import { Card, inputCls } from "@/shared/components/ui";

type Status = { enabled: boolean; pending: boolean; recoveryLeft: number };

/**
 * İki adımlı doğrulama (2FA).
 *
 * Yönetici hesabı tek bir şifreyle korunuyordu. O şifre ele geçirilirse (yeniden kullanılmış
 * şifre, oltalama, bulaşmış bilgisayar) saldırgan panelin tamamına sahip olur: Coin basar,
 * kullanıcı verisine erişir, ödeme ayarlarını değiştirir. Bütçe sınırları bunu yavaşlatır ama
 * durdurmaz — sınırları da aynı panelden değiştirebilir.
 *
 * 2FA, çalınan şifreyi tek başına işe yaramaz hale getirir.
 */
export default function TwoFactor() {
  const { data, reload } = useApi<Status>("/api/auth/2fa");
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  if (!data) return null;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMsg("");
    try {
      await fn();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "İşlem başarısız.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="İki adımlı doğrulama">
      {recovery && (
        <div className="mb-4 rounded-lg border border-amber-400/40 bg-amber-400/10 p-4">
          <div className="mb-2 font-semibold text-amber-200">
            Kurtarma kodlarınız — bunları şimdi kaydedin
          </div>
          <div className="mb-3 text-sm text-white/80">
            Bu kodlar <b>bir daha gösterilmeyecek</b>. Telefonunuzu kaybederseniz panele girmenin
            tek yolu bunlardır. Her kod yalnızca bir kez kullanılır.
          </div>
          <div className="grid grid-cols-2 gap-2 font-mono text-sm sm:grid-cols-4">
            {recovery.map((c) => (
              <div key={c} className="rounded bg-black/40 px-2 py-1 text-center">{c}</div>
            ))}
          </div>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(recovery.join("\n")).catch(() => {});
              setMsg("Kodlar panoya kopyalandı.");
            }}
            className="mt-3 rounded bg-white/10 px-3 py-1.5 text-sm"
          >
            Kopyala
          </button>
          <button
            onClick={() => setRecovery(null)}
            className="mt-3 ml-2 rounded bg-[#d7b56d] px-3 py-1.5 text-sm font-medium text-black"
          >
            Kaydettim, kapat
          </button>
        </div>
      )}

      {data.enabled ? (
        <div className="space-y-3 text-sm">
          <div className="text-emerald-300">✓ Açık — giriş sırasında kod isteniyor.</div>
          <div className="text-white/60">
            Kalan kurtarma kodu: <b>{data.recoveryLeft}</b>
            {data.recoveryLeft <= 2 && (
              <span className="ml-2 text-amber-300">
                Azaldı — telefonunuzu kaybederseniz girişte sorun yaşarsınız, yenileyin.
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Mevcut kod"
              className={`${inputCls} max-w-[160px]`}
            />
            <button
              disabled={busy || !code}
              onClick={() =>
                run(async () => {
                  const r = await api<{ recoveryCodes: string[] }>("/api/auth/2fa/recovery", { method: "POST", body: { code } });
                  setRecovery(r.recoveryCodes);
                  setCode("");
                  reload();
                })
              }
              className="rounded-md bg-white/10 px-3 py-1.5 disabled:opacity-40"
            >
              Kurtarma kodlarını yenile
            </button>
            <button
              disabled={busy || !code}
              onClick={() => {
                if (!confirm("İki adımlı doğrulama kapatılacak. Hesabınız yalnızca şifreyle korunacak. Emin misiniz?")) return;
                run(async () => {
                  await api("/api/auth/2fa/disable", { method: "POST", body: { code } });
                  setCode("");
                  setSetup(null);
                  reload();
                });
              }}
              className="rounded-md bg-red-500/20 px-3 py-1.5 text-red-200 disabled:opacity-40"
            >
              Kapat
            </button>
          </div>
          <div className="text-xs text-white/40">
            Kapatmak için de kod gerekir. Yalnızca şifreyle kapatılabilseydi, şifreyi çalan kişi
            önce 2FA&apos;yı kapatır sonra girerdi.
          </div>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="text-white/70">
            Kapalı. Hesabınız yalnızca şifreyle korunuyor. Şifre bir şekilde ele geçerse panelin
            tamamı ele geçer — Coin basımı, kullanıcı verisi, ödeme ayarları.
          </div>

          {!setup ? (
            <button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  setSetup(await api<{ secret: string; uri: string }>("/api/auth/2fa/setup", { method: "POST" }));
                })
              }
              className="rounded-md bg-[#d7b56d] px-4 py-2 font-medium text-black disabled:opacity-40"
            >
              Kurulumu başlat
            </button>
          ) : (
            <div className="space-y-3">
              <div>
                <div className="mb-1 text-white/70">
                  1. Kimlik doğrulayıcı uygulamanıza ekleyin (Google Authenticator, Authy, 1Password…):
                </div>
                <a href={setup.uri} className="break-all font-mono text-xs text-[#d7b56d] underline">
                  {setup.uri}
                </a>
                <div className="mt-2 text-white/70">
                  Telefondan bakıyorsanız yukarıdaki bağlantıya dokunmak uygulamayı açar.
                  Bilgisayardaysanız uygulamaya <b>elle giriş</b> seçeneğiyle şu anahtarı yazın:
                </div>
                <div className="mt-1 rounded bg-black/40 px-3 py-2 font-mono text-sm tracking-widest">
                  {setup.secret}
                </div>
              </div>
              <div>
                <div className="mb-1 text-white/70">2. Uygulamadaki 6 haneli kodu girin:</div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="123456"
                    className={`${inputCls} max-w-[160px] tracking-[0.3em]`}
                  />
                  <button
                    disabled={busy || code.length < 6}
                    onClick={() =>
                      run(async () => {
                        const r = await api<{ recoveryCodes: string[] }>("/api/auth/2fa/confirm", { method: "POST", body: { code } });
                        setRecovery(r.recoveryCodes);
                        setCode("");
                        setSetup(null);
                        reload();
                      })
                    }
                    className="rounded-md bg-[#d7b56d] px-4 py-2 font-medium text-black disabled:opacity-40"
                  >
                    Doğrula ve aç
                  </button>
                </div>
                <div className="mt-2 text-xs text-white/40">
                  Doğru kod girilene kadar 2FA <b>açılmaz</b>. Yanlış kurulumda kendi panelinizden
                  kilitlenmemeniz için böyle.
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {msg && <div className="mt-3 text-sm text-white/80">{msg}</div>}
    </Card>
  );
}
