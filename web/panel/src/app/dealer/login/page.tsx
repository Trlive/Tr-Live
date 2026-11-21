import type { Metadata } from "next";
import PanelLogin from "@/core/auth/panel-login";

export const metadata: Metadata = { title: "Bayi Girişi" };

export default function DealerLoginPage() {
  return <PanelLogin panel="dealer" title="Bayi Girişi" description="TR Live Coin bayi alanına güvenli erişim." />;
}
