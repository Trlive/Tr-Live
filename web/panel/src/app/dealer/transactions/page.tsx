import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import DealerTransactions from "@/modules/dealer/transactions/transactions";

export const metadata: Metadata = { title: "Hareketler" };

export default function Page() {
  return (
    <PanelShell panel="dealer">
      <DealerTransactions />
    </PanelShell>
  );
}
