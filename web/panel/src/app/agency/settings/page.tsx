import type { Metadata } from "next";
import PanelShell from "@/components/panel-shell";
import { PageHeader } from "@/components/ui";
import { AgencyAssistants } from "@/components/center/agency-team";

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
