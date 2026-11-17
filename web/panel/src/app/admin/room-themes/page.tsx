import type { Metadata } from "next";
import PanelShell from "@/components/panel-shell";
import AdminRoomThemes from "@/components/admin/room-themes";

export const metadata: Metadata = { title: "Oda Temaları" };

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminRoomThemes />
    </PanelShell>
  );
}
