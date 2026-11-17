import type { Metadata } from "next";
import PanelShell from "@/components/panel-shell";
import AdminLuckyPools from "@/components/admin/lucky-pools";

export const metadata: Metadata = { title: "Şanslı Havuzlar" };

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminLuckyPools />
    </PanelShell>
  );
}
