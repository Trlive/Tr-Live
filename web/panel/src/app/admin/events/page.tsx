import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import AdminEvents from "@/modules/admin/events/events";

export const metadata: Metadata = { title: "Etkinlikler" };

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminEvents />
    </PanelShell>
  );
}
