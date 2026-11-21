import type { Metadata } from "next";
import { Suspense } from "react";
import PanelShell from "@/core/layout/panel-shell";
import { Loading } from "@/shared/components/ui";
import { AdminRoomDetail } from "@/modules/admin/rooms/rooms";

export const metadata: Metadata = {
  title: "Oda Detayı",
};

export default function Page() {
  return (
    <PanelShell panel="admin">
      <Suspense fallback={<Loading />}>
        <AdminRoomDetail />
      </Suspense>
    </PanelShell>
  );
}
