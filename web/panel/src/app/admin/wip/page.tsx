import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import AdminWip from "@/modules/admin/system_monitor/wip";

export const metadata: Metadata = {
  title: "WIP Mağazası",
};

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminWip />
    </PanelShell>
  );
}
