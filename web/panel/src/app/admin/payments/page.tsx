import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import AdminPayments from "@/modules/admin/payments/payments";

export const metadata: Metadata = { title: "Ödemeler" };

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminPayments />
    </PanelShell>
  );
}
