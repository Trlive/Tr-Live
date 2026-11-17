import type { Metadata } from "next";
import PanelShell from "@/components/panel-shell";
import AdminScreenshots from "@/components/admin/screenshots";

export const metadata: Metadata = { title: "Ekran Görüntüleri" };

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminScreenshots />
    </PanelShell>
  );
}
