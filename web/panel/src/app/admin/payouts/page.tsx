import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import AdminPayouts from "@/modules/admin/withdrawals/payouts";

export const metadata: Metadata = {
  title: "Maaş Dönemleri",
};

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminPayouts />
    </PanelShell>
  );
}
