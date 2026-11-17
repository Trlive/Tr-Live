import type { Metadata } from "next";
import PanelShell from "@/components/panel-shell";
import { PageHeader } from "@/components/ui";
import AgencyHome from "@/components/center/agency-home";

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
