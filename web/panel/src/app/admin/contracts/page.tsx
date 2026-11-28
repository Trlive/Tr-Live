import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import AdminContracts from "@/modules/admin/contracts/contracts";

export const metadata: Metadata = { title: "Sözleşmeler" };

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminContracts />
    </PanelShell>
  );
}
