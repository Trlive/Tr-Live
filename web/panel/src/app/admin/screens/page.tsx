import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import SduiV2 from "@/modules/admin/sdui/sdui_v2";

export const metadata: Metadata = { title: "Ekran Düzenleri" };

export default function Page() {
  return (
    <PanelShell panel="admin">
      <SduiV2 />
    </PanelShell>
  );
}
