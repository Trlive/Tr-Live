import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import { AdminStaff } from "@/modules/admin/users/people";

export const metadata: Metadata = {
  title: "Yetkililer",
};

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminStaff />
    </PanelShell>
  );
}
