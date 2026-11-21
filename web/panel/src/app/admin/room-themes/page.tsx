import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import AdminRoomThemes from "@/modules/admin/rooms/room-themes";

export const metadata: Metadata = { title: "Oda Temaları" };

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminRoomThemes />
    </PanelShell>
  );
}
