import type { Metadata } from "next";
import PanelShell from "@/components/panel-shell";
import AdminActivities from "@/components/admin/activities";

export const metadata: Metadata = { title: "Oda Etkinlikleri" };

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminActivities />
    </PanelShell>
  );
}
