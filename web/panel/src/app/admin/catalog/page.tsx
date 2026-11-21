import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import AdminCatalog from "@/modules/admin/gifts/catalog";

export const metadata: Metadata = {
  title: "Katalog",
};

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminCatalog />
    </PanelShell>
  );
}
