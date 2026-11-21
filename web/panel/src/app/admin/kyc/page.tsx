import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import { AdminKyc } from "@/modules/admin/users/people";

export const metadata: Metadata = {
  title: "Kimlik Onayları",
};

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminKyc />
    </PanelShell>
  );
}
