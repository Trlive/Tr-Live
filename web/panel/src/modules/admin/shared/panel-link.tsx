"use client";

import { useState } from "react";
import { Copy, KeyRound } from "lucide-react";
import { useApi } from "@/core/api/use-api";

/**
 * Ajans / bayi web panelinin gizli giriş bağlantısı (sunucu kurulumunda üretilir). Bağlantıyla açmayan kişi panel sayfası
 * yerine "bulunamadı" görür. Bağlantı sızarsa sunucu panelinden (/panel) "Tüm bağlantıları yenile".
 */
export function PanelLinkBox({ kind }: { kind: "agency" | "dealer" }) {
  const { data } = useApi<{ agency: string | null; dealer: string | null }>("/api/admin/panel-links");
  const [done, setDone] = useState(false);
  const link = data?.[kind] ?? null;
  const who = kind === "agency" ? "ajans sahiplerine" : "bayilere";
  return (
    <div className="mb-4 rounded-xl border border-[#30291e] bg-[#17130c] p-3 text-sm">
      <div className="flex items-center gap-2 text-white">
        <KeyRound size={15} className="text-[#d7b56d]" />
        <b>{kind === "agency" ? "Ajans paneli" : "Bayi paneli"} giriş bağlantısı</b>
      </div>
      {link ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="break-all text-xs text-gray-300">{link}</code>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg border border-[#3a2f1a] px-2 py-1 text-xs text-[#d7b56d]"
            onClick={() => { navigator.clipboard?.writeText(link); setDone(true); setTimeout(() => setDone(false), 1500); }}
          >
            <Copy size={12} /> {done ? "Kopyalandı" : "Kopyala"}
          </button>
          <span className="text-xs text-gray-500">Yalnızca {who} verin. Bu bağlantı olmadan panel sayfası açılmaz.</span>
        </div>
      ) : (
        <p className="mt-1 text-xs text-gray-500">Bağlantı sunucu panelinde (/panel) görünür. Sunucu bu sürüme güncellenince burada da çıkar.</p>
      )}
    </div>
  );
}
