import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import AdminAgencies from "@/modules/admin/agencies/agencies";

export const metadata: Metadata = {
  title: "Ajanslar",
};

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminAgencies />
    </PanelShell>
  );
}
