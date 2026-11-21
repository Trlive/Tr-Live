import type { Metadata } from "next";
import { Suspense } from "react";
import PanelShell from "@/core/layout/panel-shell";
import { Loading } from "@/shared/components/ui";
import { AdminPayoutDetail } from "@/modules/admin/withdrawals/payouts";

export const metadata: Metadata = {
  title: "Dönem Detayı",
};

export default function Page() {
  return (
    <PanelShell panel="admin">
      <Suspense fallback={<Loading />}>
        <AdminPayoutDetail />
      </Suspense>
    </PanelShell>
  );
}
