import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import AdminScreenshots from "@/modules/admin/moderation/screenshots";

export const metadata: Metadata = { title: "Ekran Görüntüleri" };

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminScreenshots />
    </PanelShell>
  );
}
