import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import AdminPlugins from "@/modules/admin/game_packages/plugins";

export const metadata: Metadata = { title: "Oyun Paketleri" };

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminPlugins />
    </PanelShell>
  );
}
