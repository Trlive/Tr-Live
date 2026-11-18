import type { Metadata } from "next";
import PanelShell from "@/components/panel-shell";
import AdminPlugins from "@/components/admin/plugins";

export const metadata: Metadata = { title: "Oyun Paketleri" };

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminPlugins />
    </PanelShell>
  );
}
