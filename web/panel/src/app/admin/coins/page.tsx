import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import AdminFinance from "@/modules/admin/wallet/finance";

export const metadata: Metadata = {
  title: "Mali Kayıtlar",
};

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminFinance />
    </PanelShell>
  );
}
