import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import AdminLuckyPools from "@/modules/admin/gifts/lucky-pools";

export const metadata: Metadata = { title: "Şanslı Havuzlar" };

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminLuckyPools />
    </PanelShell>
  );
}
