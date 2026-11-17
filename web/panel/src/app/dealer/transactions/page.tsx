import type { Metadata } from "next";
import PanelShell from "@/components/panel-shell";
import DealerTransactions from "@/components/dealer/transactions";

export const metadata: Metadata = { title: "Hareketler" };

export default function Page() {
  return (
    <PanelShell panel="dealer">
      <DealerTransactions />
    </PanelShell>
  );
}
