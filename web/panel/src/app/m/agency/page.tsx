"use client";

import MobileShell from "@/components/center/mobile-shell";
import AgencyHome from "@/components/center/agency-home";
import AgencyHosts from "@/components/center/agency-hosts";
import AgencyEarnings from "@/components/center/agency-earnings";
import { AgencyAssistants, AgencyReferrals, AgencyTransfers } from "@/components/center/agency-team";
import { PayTable } from "@/components/center/host-center";
import { t } from "@/lib/i18n";

// Uygulama içi Ajans Merkezi (WebView). Oturum uygulamadan gelir; dil ?lang= ile.
export default function Page() {
  return (
    <MobileShell
      panel="agency"
      tabs={(s) => [
        { key: "home", label: t("Genel"), render: () => <AgencyHome /> },
        { key: "hosts", label: t("Yayıncılar"), render: () => <AgencyHosts /> },
        { key: "earnings", label: t("Kazançlar"), render: () => <AgencyEarnings /> },
        { key: "team", label: t("Asistanlar"), render: () => <AgencyAssistants />, hidden: s.agencyRole !== "owner" },
        { key: "referrals", label: t("Davet primi"), render: () => <AgencyReferrals /> },
        { key: "transfers", label: t("Transferler"), render: () => <AgencyTransfers /> },
        { key: "paytable", label: t("Maaş tablosu"), render: () => <PayTable /> },
      ]}
    />
  );
}
