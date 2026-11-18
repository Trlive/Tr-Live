import type { Metadata } from "next";
import PanelShell from "@/components/panel-shell";
import AdminDealerShop from "@/components/admin/dealer-shop";

export const metadata: Metadata = { title: "Bayi Mağazası" };

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminDealerShop />
    </PanelShell>
  );
}
