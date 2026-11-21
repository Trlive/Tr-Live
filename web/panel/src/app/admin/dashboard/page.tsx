import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import AdminDashboard from "@/modules/admin/dashboard/dashboard";

export const metadata: Metadata = {
  title: "Yönetim Paneli",
};

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminDashboard />
    </PanelShell>
  );
}
