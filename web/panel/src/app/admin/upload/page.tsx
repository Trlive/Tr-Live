import type { Metadata } from "next";
import PanelShell from "@/components/panel-shell";
import AdminUpload from "@/components/admin/upload";

export const metadata: Metadata = { title: "İçerik Yükle" };

export default function Page() {
  return (
    <PanelShell panel="admin">
      <AdminUpload />
    </PanelShell>
  );
}
