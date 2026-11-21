"use client";

import MobileShell from "@/modules/agency/shell/mobile-shell";
import { HostHome, HostStatements, PayTable } from "@/modules/agency/broadcasters/host-center";
import { t } from "@/shared/utils/i18n";

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
