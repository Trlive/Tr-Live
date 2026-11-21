import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import AdminServer from "@/modules/admin/system_monitor/server";

export const metadata: Metadata = { title: "Sunucu" };

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminServer />
    </PanelShell>
  );
}
