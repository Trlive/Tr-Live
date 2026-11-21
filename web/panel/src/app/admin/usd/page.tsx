import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import AdminUsd from "@/modules/admin/wallet/usd";

export const metadata: Metadata = { title: "Fasulye Cüzdanı" };

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminUsd />
    </PanelShell>
  );
}
