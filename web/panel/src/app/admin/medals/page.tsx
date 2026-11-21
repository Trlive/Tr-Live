import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import AdminMedals from "@/modules/admin/events/medals";

export const metadata: Metadata = {
  title: "Madalya Sistemi",
};

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminMedals />
    </PanelShell>
  );
}
