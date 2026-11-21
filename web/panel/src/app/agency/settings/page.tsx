import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import { PageHeader } from "@/shared/components/ui";
import { AgencyAssistants } from "@/modules/agency/family/agency-team";

export const metadata: Metadata = { title: "Asistanlar" };

export default function Page() {
  return (
    <PanelShell panel="agency">
      <PageHeader kicker="Ajans" title="Asistanlar" />
      <div className="max-w-3xl space-y-6">
        <AgencyAssistants />
      </div>
    </PanelShell>
  );
}
