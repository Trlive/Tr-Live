"use client";

import MobileShell from "@/components/center/mobile-shell";
import { HostHome, HostStatements, PayTable } from "@/components/center/host-center";
import { t } from "@/lib/i18n";

// Uygulama içi Yayıncı Merkezi (WebView). Oturum uygulamadan gelir; dil ?lang= ile.
export default function Page() {
  return (
    <MobileShell
      panel="host"
      tabs={() => [
        { key: "home", label: t("Bu dönem"), render: () => <HostHome /> },
        { key: "history", label: t("Geçmiş dönemler"), render: () => <HostStatements /> },
        { key: "paytable", label: t("Maaş tablosu"), render: () => <PayTable /> },
      ]}
    />
  );
}
