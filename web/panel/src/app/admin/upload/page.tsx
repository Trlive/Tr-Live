import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import AdminUpload from "@/modules/admin/asset_management/upload";

export const metadata: Metadata = { title: "İçerik Yükle" };

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminUpload />
    </PanelShell>
  );
}
