import type { Metadata } from "next";
import { Suspense } from "react";
import PanelShell from "@/core/layout/panel-shell";
import { Loading } from "@/shared/components/ui";
import AdminUserDetail from "@/modules/admin/users/user-detail";

export const metadata: Metadata = {
  title: "Kullanıcı Detayı",
};

export default function Page() {
  return (
    <PanelShell panel="admin">
      <Suspense fallback={<Loading />}>
        <AdminUserDetail />
      </Suspense>
    </PanelShell>
  );
}
