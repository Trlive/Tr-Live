import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import { PageHeader } from "@/shared/components/ui";
import AgencyHome from "@/modules/agency/dashboard/agency-home";

export const metadata: Metadata = { title: "Genel Bakış" };

export default function Page() {
  return (
    <PanelShell panel="agency">
      <PageHeader kicker="Ajans" title="Genel Bakış" />
      <div className="max-w-3xl space-y-6">
        <AgencyHome />
      </div>
    </PanelShell>
  );
}
