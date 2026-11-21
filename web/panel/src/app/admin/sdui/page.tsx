import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import SduiEditor from "@/modules/admin/sdui/sdui";

export const metadata: Metadata = {
  title: "Ana Ekran Düzeni",
};

export default function Page() {
  return (
    <PanelShell panel="admin">
      <SduiEditor />
    </PanelShell>
  );
}
