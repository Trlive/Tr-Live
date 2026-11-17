import type { Metadata } from "next";
import PanelShell from "@/components/panel-shell";
import AdminMediaBudget from "@/components/admin/media-budget";

export const metadata: Metadata = { title: "Medya Bütçesi" };

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminMediaBudget />
    </PanelShell>
  );
}
