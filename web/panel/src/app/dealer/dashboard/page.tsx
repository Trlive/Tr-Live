import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import DealerSell from "@/modules/dealer/coin_orders/sell";

export const metadata: Metadata = { title: "Coin Satışı" };

export default function Page() {
  return (
    <PanelShell panel="dealer">
      <DealerSell />
    </PanelShell>
  );
}
