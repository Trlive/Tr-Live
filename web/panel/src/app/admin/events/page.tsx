import type { Metadata } from "next";
import PanelShell from "@/components/panel-shell";
import AdminEvents from "@/components/admin/events";

export const metadata: Metadata = { title: "Etkinlikler" };

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminEvents />
    </PanelShell>
  );
}
