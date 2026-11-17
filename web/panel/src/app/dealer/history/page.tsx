import type { Metadata } from "next";
import PanelShell from "@/components/panel-shell";
import DealerTopup from "@/components/dealer/topup";

export const metadata: Metadata = { title: "Bakiye Talebi" };

export default function Page() {
  return (
    <PanelShell panel="dealer">
      <DealerTopup />
    </PanelShell>
  );
}
