import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import AdminReports from "@/modules/admin/dashboard/reports";

export const metadata: Metadata = {
  title: "Şikâyetler",
};

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminReports />
    </PanelShell>
  );
}
