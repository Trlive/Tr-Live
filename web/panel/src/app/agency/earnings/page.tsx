import type { Metadata } from "next";
import PanelShell from "@/components/panel-shell";
import { PageHeader } from "@/components/ui";
import AgencyEarnings from "@/components/center/agency-earnings";

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
