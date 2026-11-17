import type { Metadata } from "next";
import PanelShell from "@/components/panel-shell";
import AdminDealers from "@/components/admin/dealers";

export const metadata: Metadata = { title: "Bayiler" };

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminDealers />
    </PanelShell>
  );
}
