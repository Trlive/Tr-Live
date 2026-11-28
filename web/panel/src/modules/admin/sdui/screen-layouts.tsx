"use client";

import { useState } from "react";
import { Tabs } from "@/shared/components/kit";
import SduiV2 from "@/modules/admin/sdui/sdui_v2";
import SduiEditor from "@/modules/admin/sdui/sdui";

/** Tek sayfa: uygulama ekranlarının düzenleri (SDUI v2) ve ana ekranın sekme/bölüm düzeni (SDUI v1). Eskiden iki ayrı menüydü. */
export default function ScreenLayouts() {
  const [tab, setTab] = useState<"screens" | "home">("screens");
  return (
    <div>
      <Tabs
        tabs={[
          { key: "screens", label: "Uygulama ekranları" },
          { key: "home", label: "Ana ekran sekmeleri" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "screens" ? <SduiV2 /> : <SduiEditor />}
    </div>
  );
}
