import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import { PageHeader } from "@/shared/components/ui";
import { AgencyReferrals, AgencyTransfers } from "@/modules/agency/family/agency-team";

export const metadata: Metadata = { title: "Transfer ve Davet Primi" };

export default function Page() {
  return (
    <PanelShell panel="agency">
      <PageHeader kicker="Ajans" title="Transfer ve Davet Primi" />
      <div className="max-w-3xl space-y-6">
        <AgencyTransfers />
        <AgencyReferrals />
      </div>
    </PanelShell>
  );
}
