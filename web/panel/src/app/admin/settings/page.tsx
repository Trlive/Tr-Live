import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import AdminSettings from "@/modules/admin/settings/settings";

export const metadata: Metadata = {
  title: "Yönetim Ayarları",
};

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminSettings />
    </PanelShell>
  );
}
