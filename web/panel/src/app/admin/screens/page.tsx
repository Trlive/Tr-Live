import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import ScreenLayouts from "@/modules/admin/sdui/screen-layouts";
export const metadata: Metadata = { title: "Ekran Düzenleri" };
export default function Page() {
  return (
    <PanelShell panel="admin">
      <ScreenLayouts />
    </PanelShell>
  );
}
