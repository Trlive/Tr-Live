import type { Metadata } from "next";
import PanelShell from "@/components/panel-shell";
import AdminWildKing from "@/components/admin/wildking";

export const metadata: Metadata = { title: "Wild King" };

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminWildKing />
    </PanelShell>
  );
}
