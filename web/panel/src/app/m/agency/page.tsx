"use client";

import MobileShell from "@/modules/agency/shell/mobile-shell";
import AgencyHome from "@/modules/agency/dashboard/agency-home";
import AgencyHosts from "@/modules/agency/broadcasters/agency-hosts";
import AgencyEarnings from "@/modules/agency/earnings/agency-earnings";
import { AgencyAssistants, AgencyReferrals, AgencyTransfers } from "@/modules/agency/family/agency-team";
import { PayTable } from "@/modules/agency/broadcasters/host-center";
import { t } from "@/shared/utils/i18n";

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
