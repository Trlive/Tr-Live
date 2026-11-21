import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import AdminMediaBudget from "@/modules/admin/asset_management/media-budget";

export const metadata: Metadata = { title: "Medya Bütçesi" };

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminMediaBudget />
    </PanelShell>
  );
}
