import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import { PageHeader } from "@/shared/components/ui";
import AgencyEarnings from "@/modules/agency/earnings/agency-earnings";

export const metadata: Metadata = { title: "Kazançlar" };

export default function Page() {
  return (
    <PanelShell panel="agency">
      <PageHeader kicker="Ajans" title="Kazançlar" />
      <div className="max-w-3xl space-y-6">
        <AgencyEarnings />
      </div>
    </PanelShell>
  );
}
