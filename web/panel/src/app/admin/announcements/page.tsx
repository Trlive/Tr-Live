import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import AdminAnnouncements from "@/modules/admin/events/announcements";

export const metadata: Metadata = {
  title: "Duyurular",
};

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminAnnouncements />
    </PanelShell>
  );
}
