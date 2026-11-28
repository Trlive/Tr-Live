import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import DealerTopup from "@/modules/dealer/transfers/topup";

export const metadata: Metadata = { title: "Stok Satın Al" };

export default function Page() {
  return (
    <PanelShell panel="dealer">
      <DealerTopup />
    </PanelShell>
  );
}
