import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import AdminDealers from "@/modules/admin/dealers/dealers";

export const metadata: Metadata = { title: "Bayiler" };

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminDealers />
    </PanelShell>
  );
}
