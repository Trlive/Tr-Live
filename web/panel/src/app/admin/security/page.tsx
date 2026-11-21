import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import AdminSecurity from "@/modules/admin/security/security";

export const metadata: Metadata = {
  title: "Güvenlik",
};

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminSecurity />
    </PanelShell>
  );
}
