"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { appSession, inApp, type PanelSession } from "@/lib/api";
import { isRtl, lang, t } from "@/lib/i18n";

export type MTab = { key: string; label: string; render: () => ReactNode; hidden?: boolean };

/**
 * Uygulama içi (WebView) sayfa çerçevesi: oturumu uygulamadan alır, dili ve yönü (Arapça sağdan sola) ayarlar,
 * üstte kaydırılabilir sekmeler gösterir. Sekme seçimi adreste (#sekme) tutulur; yenilemede aynı sekme açılır.
 */
export default function MobileShell({ panel, tabs }: { panel: "agency" | "host"; tabs: (s: PanelSession) => MTab[] }) {
  const [session, setSession] = useState<PanelSession | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("");
  const [nonce, setNonce] = useState(0);

  const start = useCallback(() => {
    setError("");
    setSession(null);
    if (!inApp()) {
      setError(t("Bu sayfa TR Live uygulamasının içinde açılır."));
      return;
    }
    appSession(panel)
      .then(setSession)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : t("Oturum alınamadı.")));
  }, [panel]);

  useEffect(() => {
    document.documentElement.lang = lang();
    document.documentElement.dir = isRtl() ? "rtl" : "ltr";
    const h = window.location.hash.replace("#", "");
    if (h) setTab(h);
    start();
    const onLogout = () => start();
    window.addEventListener("trlive-logout", onLogout);
    return () => window.removeEventListener("trlive-logout", onLogout);
  }, [start]);

  if (!session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0b0906] px-6 text-center text-sm text-gray-400">
        {error ? (
          <>
            <p className="text-red-300">{error}</p>
            {inApp() && (
              <button type="button" onClick={start} className="gold-button inline-flex items-center gap-2 px-5">
                <RefreshCw size={15} /> {t("Tekrar dene")}
              </button>
            )}
          </>
        ) : (
          <span className="flex items-center gap-3">
            <Loader2 size={18} className="animate-spin text-[#f2b92a]" />
            {t("Yükleniyor...")}
          </span>
        )}
      </div>
    );
  }

  const list = tabs(session).filter((x) => !x.hidden);
  const active = list.find((x) => x.key === tab) ?? list[0];
  return (
    <div className="min-h-screen bg-[#0b0906] pb-10 text-white">
      {list.length > 1 && (
        <nav className="sticky top-0 z-20 flex gap-2 overflow-x-auto border-b border-[#292319] bg-[#0b0906]/95 px-3 py-2.5 backdrop-blur" role="tablist">
          {list.map((x) => (
            <button
              key={x.key}
              type="button"
              role="tab"
              aria-selected={active.key === x.key}
              onClick={() => {
                setTab(x.key);
                history.replaceState(null, "", `#${x.key}`);
                window.scrollTo(0, 0);
              }}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                active.key === x.key ? "bg-[#f2b92a] text-[#0b0906]" : "border border-[#30291e] text-gray-300"
              }`}
            >
              {x.label}
            </button>
          ))}
          <button type="button" aria-label={t("Yenile")} onClick={() => setNonce((n) => n + 1)} className="ms-auto shrink-0 rounded-full border border-[#30291e] px-3 text-gray-400">
            <RefreshCw size={14} />
          </button>
        </nav>
      )}
      <main key={`${active.key}-${nonce}`} className="space-y-4 px-3 pt-4">
        {active.render()}
      </main>
    </div>
  );
}
