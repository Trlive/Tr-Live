import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import AdminSupport from "@/modules/admin/moderation/support";

export const metadata: Metadata = {
  title: "Destek",
};

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminSupport />
    </PanelShell>
  );
}
