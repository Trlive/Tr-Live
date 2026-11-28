import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import DealerApiKeys from "@/modules/dealer/api/api-keys";

export const metadata: Metadata = { title: "API Anahtarları" };

export default function Page() {
  return (
    <PanelShell panel="dealer">
      <DealerApiKeys />
    </PanelShell>
  );
}
