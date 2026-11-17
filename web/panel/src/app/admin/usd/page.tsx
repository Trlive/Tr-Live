import type { Metadata } from "next";
import PanelShell from "@/components/panel-shell";
import AdminUsd from "@/components/admin/usd";

export const metadata: Metadata = { title: "Fasulye Cüzdanı" };

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminUsd />
    </PanelShell>
  );
}
