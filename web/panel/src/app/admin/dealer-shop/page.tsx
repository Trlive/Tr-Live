import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import AdminDealerShop from "@/modules/admin/dealers/dealer-shop";

export const metadata: Metadata = { title: "Bayi Mağazası" };

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminDealerShop />
    </PanelShell>
  );
}
