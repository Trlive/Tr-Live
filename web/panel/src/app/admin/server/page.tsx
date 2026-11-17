import type { Metadata } from "next";
import PanelShell from "@/components/panel-shell";
import AdminServer from "@/components/admin/server";

export const metadata: Metadata = { title: "Sunucu" };

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminServer />
    </PanelShell>
  );
}
