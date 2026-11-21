import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import AdminRooms from "@/modules/admin/rooms/rooms";

export const metadata: Metadata = {
  title: "Odalar",
};

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminRooms />
    </PanelShell>
  );
}
