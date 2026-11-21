import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import { PageHeader } from "@/shared/components/ui";
import AgencyHosts from "@/modules/agency/broadcasters/agency-hosts";

export const metadata: Metadata = { title: "Yayıncılar" };

export default function Page() {
  return (
    <PanelShell panel="agency">
      <PageHeader kicker="Ajans" title="Yayıncılar" />
      <div className="max-w-3xl space-y-6">
        <AgencyHosts />
      </div>
    </PanelShell>
  );
}
