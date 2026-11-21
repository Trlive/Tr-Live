import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import AdminUsers from "@/modules/admin/users/users";

export const metadata: Metadata = {
  title: "Kullanıcı Yönetimi",
};

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminUsers />
    </PanelShell>
  );
}
