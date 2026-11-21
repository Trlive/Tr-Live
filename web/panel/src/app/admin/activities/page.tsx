import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import AdminActivities from "@/modules/admin/games/activities";

export const metadata: Metadata = { title: "Oda Etkinlikleri" };

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminActivities />
    </PanelShell>
  );
}
