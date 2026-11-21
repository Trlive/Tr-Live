"use client";

import { useState } from "react";
import { Camera } from "lucide-react";
import { fmtDate } from "@/core/api/api";
import { useApi } from "@/core/api/use-api";
import { Card, Empty, ErrorBox, Loading, PageHeader, StatCard, tableCls, tableWrap, tdCls, thCls } from "@/shared/components/ui";
import { UserLink, roomHref, selectCls } from "@/shared/components/kit";
import Link from "next/link";

type P = { id: string; username?: string; displayName?: string } | null;
type Ev = { id: string; screen: string; platform?: string; appVersion?: string; createdAt: string; user: P; target: P; room: { id: string; name: string; roomNumber?: number } | null };
const SCREENS: [string, string][] = [["", "Tüm ekranlar"], ["room", "Oda"], ["profile", "Profil"], ["chat", "Sohbet"], ["messages", "Mesajlar"], ["feed", "Akış"], ["home", "Ana sayfa"], ["store", "Mağaza"], ["other", "Diğer"]];
const screenText = Object.fromEntries(SCREENS) as Record<string, string>;

export default function AdminScreenshots() {
  const [screen, setScreen] = useState("");
  const { data, error, loading, reload } = useApi<{ last24h: number; items: Ev[] }>(`/api/admin/screenshots?limit=200${screen ? `&screen=${screen}` : ""}`);
  return (
    <div>
      <PageHeader icon={<Camera size={18} />} kicker="Güvenlik" title="Ekran Görüntüleri" description="Uygulamada alınan ekran görüntüleri: kim, ne zaman, hangi ekranda, kimin profilinde / hangi odada. 90 gün saklanır." />
      {data && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <StatCard label="Son 24 saat" value={String(data.last24h)} />
        </div>
      )}
      <Card
        action={
          <select className={selectCls} value={screen} onChange={(e) => setScreen(e.target.value)}>
            {SCREENS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        }
      >
        {loading && !data && <Loading />}
        {error && <ErrorBox message={error} onRetry={reload} />}
        {data &&
          (data.items.length === 0 ? (
            <Empty title="Kayıt yok." />
          ) : (
            <div className={tableWrap}>
              <table className={tableCls}>
                <thead>
                  <tr>
                    <th className={thCls}>Tarih</th>
                    <th className={thCls}>Alan</th>
                    <th className={thCls}>Ekran</th>
                    <th className={thCls}>Hedef</th>
                    <th className={thCls}>Cihaz</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((e) => (
                    <tr key={e.id}>
                      <td className={tdCls}>{fmtDate(e.createdAt)}</td>
                      <td className={tdCls}>
                        <UserLink user={e.user ?? null} />
                      </td>
                      <td className={tdCls}>{screenText[e.screen] ?? e.screen}</td>
                      <td className={tdCls}>
                        {e.target ? (
                          <UserLink user={e.target} />
                        ) : e.room ? (
                          <Link href={roomHref(e.room.id)} className="text-[#d7b56d] hover:underline">
                            {e.room.name}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={`${tdCls} text-xs text-gray-500`}>
                        {e.platform ?? "—"} {e.appVersion ?? ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
      </Card>
    </div>
  );
}
