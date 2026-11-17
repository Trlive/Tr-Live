import type { Metadata } from "next";
import PanelShell from "@/components/panel-shell";
import DealerSell from "@/components/dealer/sell";

export const metadata: Metadata = { title: "Coin Satışı" };

export default function Page() {
  return (
    <PanelShell panel="dealer">
      <DealerSell />
    </PanelShell>
  );
}
