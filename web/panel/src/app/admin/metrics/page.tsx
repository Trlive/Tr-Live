import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import AdminMetrics from "@/modules/admin/system_monitor/metrics";

export const metadata: Metadata = { title: "Ölçümler" };

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminMetrics />
    </PanelShell>
  );
}
