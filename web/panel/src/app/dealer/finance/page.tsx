import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import DealerFinance from "@/modules/dealer/finance/finance";

export const metadata: Metadata = { title: "Gelir-Gider" };

export default function Page() {
  return (
    <PanelShell panel="dealer">
      <DealerFinance />
    </PanelShell>
  );
}
