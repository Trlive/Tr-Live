import type { Metadata } from "next";
import PanelShell from "@/components/panel-shell";
import AdminKedi from "@/components/admin/kedi";

export const metadata: Metadata = { title: "Kedi Çarkı" };

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminKedi />
    </PanelShell>
  );
}
