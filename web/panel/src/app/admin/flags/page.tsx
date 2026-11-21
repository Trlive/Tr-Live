import type { Metadata } from "next";
import PanelShell from "@/core/layout/panel-shell";
import FeatureFlags from "@/modules/admin/feature_flags/flags";

export const metadata: Metadata = {
  title: "Özellik Bayrakları",
};

export default function Page() {
  return (
    <PanelShell panel="admin">
      <FeatureFlags />
    </PanelShell>
  );
}
