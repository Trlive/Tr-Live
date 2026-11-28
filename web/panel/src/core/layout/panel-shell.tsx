"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FileSignature, KeyRound,
  Activity,
  LayoutDashboard,
  Users,
  Coins,
  Medal,
  Settings,
  LogOut,
  Menu,
  UserPlus,
  Loader2,
  Radio,
  Home,
  UserCog,
  Flag,
  Headphones,
  ShieldAlert,
  Building2,
  Banknote,
  Fingerprint,
  Package,
  Megaphone,
  Crown,
  Wallet,
  History,
  Store,
  Gauge,
  Upload,
  Palette,
  Clover,
  Camera,
  Server,
  CalendarDays,
  CreditCard,
  PartyPopper,
  type LucideIcon,
  ToggleLeft,
  Gamepad2,
  LayoutTemplate,
  Search,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api, getSession, logout, type PanelSession, type PanelType } from "@/core/api/api";

type NavLink = { label: string; href: string; icon: LucideIcon; match?: string[]; adminOnly?: boolean; badge?: string; keys?: string };
type NavGroup = { title: string; links: NavLink[] };

type DesktopPanel = Exclude<PanelType, "host">;
type PanelShellProps = {
  panel: DesktopPanel;
  children: React.ReactNode;
};

// Yönetim menüsü: işe göre gruplar (bir yöneticinin günlük akışı: bekleyen işler → kullanıcı/oda → para → içerik → ayar).
// adminOnly bağlantılar yardımcı admine gösterilmez; badge bekleyen iş sayısının anahtarıdır; keys arama kelimeleridir.
const adminGroups: NavGroup[] = [
  {
    title: "Genel",
    links: [
      { label: "Genel Bakış", href: "/admin/dashboard", icon: LayoutDashboard, adminOnly: true, keys: "özet istatistik gelir" },
      { label: "Ölçümler", href: "/admin/metrics", icon: Activity, adminOnly: true, keys: "grafik metrik kullanım" },
    ],
  },
  {
    title: "Bekleyen işler",
    links: [
      { label: "Destek", href: "/admin/support", icon: Headphones, badge: "support", keys: "talep yardım müşteri" },
      { label: "Şikâyetler", href: "/admin/reports", icon: Flag, adminOnly: true, badge: "reports", keys: "rapor bildirim moderasyon küfür link" },
      { label: "Kimlik Onayları", href: "/admin/kyc", icon: Fingerprint, adminOnly: true, badge: "kyc", keys: "kyc doğrulama" },
      { label: "Ajanslar", href: "/admin/agencies", icon: Building2, adminOnly: true, badge: "agencyTotal", keys: "ajans prim transfer yayıncı başvuru" },
    ],
  },
  {
    title: "Kullanıcı ve oda",
    links: [
      { label: "Kullanıcılar", href: "/admin/users", icon: Users, match: ["/admin/user"], keys: "ban hesap ara profil" },
      { label: "Odalar", href: "/admin/rooms", icon: Radio, match: ["/admin/room"], adminOnly: true, keys: "canlı yayın" },
      { label: "Aileler", href: "/admin/families", icon: Home, adminOnly: true, keys: "family" },
      { label: "Yetkililer", href: "/admin/staff", icon: UserCog, adminOnly: true, keys: "admin yardımcı rol" },
      { label: "Güvenlik", href: "/admin/security", icon: ShieldAlert, adminOnly: true, badge: "errors", keys: "hata kayıt saldırı" },
      { label: "Ekran Görüntüleri", href: "/admin/screenshots", icon: Camera, adminOnly: true, keys: "ss" },
    ],
  },
  {
    title: "Para",
    links: [
      { label: "Mali Kayıtlar", href: "/admin/coins", icon: Coins, adminOnly: true, keys: "coin elmas bakiye işlem" },
      { label: "Ödemeler", href: "/admin/payments", icon: CreditCard, adminOnly: true, keys: "paytr usdt havale sipariş satış kanalı" },
      { label: "Maaş Dönemleri", href: "/admin/payouts", icon: Banknote, match: ["/admin/payout"], adminOnly: true, keys: "maaş ay sonu kapanış" },
      { label: "Fasulye Cüzdanı", href: "/admin/usd", icon: Wallet, adminOnly: true, keys: "usd çekim fasulye" },
      { label: "Bayiler", href: "/admin/dealers", icon: Store, adminOnly: true, keys: "bayi stok" },
      { label: "Bayi Mağazası", href: "/admin/dealer-shop", icon: Package, adminOnly: true, keys: "bayi paket kademe kampanya teşvik" },
    ],
  },
  {
    title: "Mağaza ve hediye",
    links: [
      { label: "Katalog", href: "/admin/catalog", icon: Package, adminOnly: true, keys: "hediye ürün çerçeve araç" },
      { label: "İçerik Yükle", href: "/admin/upload", icon: Upload, adminOnly: true, keys: "mp4 svga animasyon" },
      { label: "Oda Temaları", href: "/admin/room-themes", icon: Palette, adminOnly: true, keys: "arka plan" },
      { label: "WIP Mağazası", href: "/admin/wip", icon: Crown, adminOnly: true, keys: "vip" },
      { label: "Madalyalar", href: "/admin/medals", icon: Medal, adminOnly: true, keys: "rozet" },
      { label: "Şanslı Havuzlar", href: "/admin/lucky", icon: Clover, adminOnly: true, keys: "şans hediye" },
      { label: "Medya Bütçesi", href: "/admin/media-budget", icon: Gauge, adminOnly: true, keys: "boyut sınır r2 cloudflare depo" },
    ],
  },
  {
    title: "Etkinlik ve duyuru",
    links: [
      { label: "Duyurular", href: "/admin/announcements", icon: Megaphone, adminOnly: true, keys: "bildirim mesaj" },
      { label: "Etkinlikler", href: "/admin/events", icon: CalendarDays, adminOnly: true, keys: "kral kraliçe yarışma" },
      { label: "Oda Etkinlikleri", href: "/admin/activities", icon: PartyPopper, adminOnly: true, keys: "oyun etkinlik" },
      { label: "Oyun Paketleri", href: "/admin/plugins", icon: Gamepad2, adminOnly: true, keys: "oyun eklenti" },
    ],
  },
  {
    title: "Uygulama ve sistem",
    links: [
      { label: "Ayarlar", href: "/admin/settings", icon: Settings, adminOnly: true, keys: "uygulama ayar oran limit" },
      { label: "Sözleşmeler", href: "/admin/contracts", icon: FileSignature, adminOnly: true, keys: "kvkk yayıncı bayi" },
      { label: "Ekran Düzenleri", href: "/admin/screens", icon: LayoutTemplate, match: ["/admin/sdui"], adminOnly: true, keys: "sdui yayınla ana ekran sekme" },
      { label: "Özellik Bayrakları", href: "/admin/flags", icon: ToggleLeft, adminOnly: true, keys: "flag aç kapat" },
      { label: "Sunucu", href: "/admin/server", icon: Server, adminOnly: true, keys: "durum disk bellek" },
    ],
  },
];

const panelConfig: Record<DesktopPanel, { title: string; subtitle: string; groups: NavGroup[] }> = {
  admin: { title: "Yönetim Paneli", subtitle: "TR LIVE MANAGEMENT", groups: adminGroups },
  agency: {
    title: "Ajans Paneli",
    subtitle: "TR LIVE AGENCY",
    groups: [
      {
        title: "Ajans",
        links: [
          { label: "Genel Bakış", href: "/agency/dashboard", icon: LayoutDashboard, keys: "özet hedef" },
          { label: "Yayıncılar", href: "/agency/broadcasters", icon: Users, keys: "başvuru host" },
          { label: "Kazançlar", href: "/agency/earnings", icon: Coins, keys: "prim maaş elmas" },
        ],
      },
      {
        title: "Ekip",
        links: [
          { label: "Transfer ve Davet Primi", href: "/agency/invite", icon: UserPlus, keys: "davet transfer" },
          { label: "Asistanlar", href: "/agency/settings", icon: Settings, keys: "yetki asistan" },
        ],
      },
    ],
  },
  dealer: {
    title: "Bayi Paneli",
    subtitle: "TR LIVE DEALER",
    groups: [
      {
        title: "Satış",
        links: [
          { label: "Coin Satışı", href: "/dealer/dashboard", icon: Coins, keys: "yükle kullanıcı id" },
          { label: "Stok Satın Al", href: "/dealer/history", icon: Wallet, keys: "stok sipariş ödeme" },
        ],
      },
      {
        title: "Rapor",
        links: [
          { label: "Gelir-Gider", href: "/dealer/finance", icon: Banknote, keys: "kâr maliyet" },
          { label: "Hareketler", href: "/dealer/transactions", icon: History, keys: "işlem geçmiş" },
        ],
      },
      { title: "Entegrasyon", links: [{ label: "API Anahtarları", href: "/dealer/api", icon: KeyRound, keys: "api anahtar bot" }] },
    ],
  },
};

type Pending = { support?: number; reports?: number; kyc?: number; transfers?: number; applications?: number; broadcasters?: number; errors?: number };

const roleText: Record<string, string> = { admin: "Yönetici", support: "Yardımcı admin" };

type Flat = NavLink & { group: string };

const norm = (v: string) => v.toLocaleLowerCase("tr").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i");

// Tarayıcıda saklanan küçük tercihler (kapalı gruplar, son açılan sayfalar). Erişilemezse sessizce varsayılan.
function readLS<T>(key: string, def: T): T {
  try {
    const v = window.localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : def;
  } catch {
    return def;
  }
}
function writeLS(key: string, v: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* gizli sekme / kapalı depolama */
  }
}

/** Panel çerçevesi: oturum, gruplu (açılır-kapanır) menü, hızlı arama (Ctrl+K), sayfa başlığı ve bekleyen işler. */
export default function PanelShell({ panel, children }: PanelShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [session, setSession] = useState<PanelSession | null>(null);
  const [checked, setChecked] = useState(false);
  const [pending, setPending] = useState<Pending>({});
  const [closed, setClosed] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [palette, setPalette] = useState(false);

  const active: DesktopPanel = panel;
  const here = pathname.replace(/\/+$/, "");

  useEffect(() => {
    const s = getSession(active);
    if (!s) {
      router.replace(`/${active}/login`);
      return;
    }
    setSession(s);
    setChecked(true);
    setClosed(readLS<string[]>(`trp_closed_${active}`, []));
    const onLogout = () => router.replace(`/${active}/login`);
    window.addEventListener("trlive-logout", onLogout);
    return () => window.removeEventListener("trlive-logout", onLogout);
  }, [active, router]);

  // Son açılan sayfalar (hızlı aramada en üstte).
  useEffect(() => {
    const list = [here, ...readLS<string[]>(`trp_recent_${active}`, []).filter((h) => h !== here)].slice(0, 6);
    writeLS(`trp_recent_${active}`, list);
    setRecent(list);
  }, [active, here]);

  // Ctrl+K / ⌘K: hızlı arama.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Menü rozetleri (bekleyen işler): sayfa değişince ve her 60 saniyede bir yenilenir.
  useEffect(() => {
    if (active !== "admin" || !checked) return;
    let alive = true;
    const load = () =>
      api<Pending>("/api/admin/overview/pending")
        .then((p) => {
          if (alive) setPending(p);
        })
        .catch(() => {});
    load();
    const t = window.setInterval(load, 60000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [active, checked, pathname]);

  if (!checked || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#090909] text-sm text-gray-400">
        <Loader2 size={18} className="mr-3 animate-spin text-[#d7b56d]" />
        Oturum kontrol ediliyor...
      </div>
    );
  }

  const config = panelConfig[active];
  const who = session.user.displayName || session.user.username || "Kullanıcı";
  const roleLabel =
    active === "admin"
      ? roleText[session.user.systemRole ?? ""] ?? "Yetkili"
      : active === "dealer"
        ? "Coin bayisi"
        : session.agencyRole === "owner"
          ? "Ajans sahibi"
          : "Ajans asistanı";

  const isFull = active !== "admin" || session.user.systemRole === "admin";
  const badgeCount = (k: string): number => {
    if (k === "agencyTotal") return (pending.transfers ?? 0) + (pending.applications ?? 0) + (pending.broadcasters ?? 0);
    return Number((pending as Record<string, number | undefined>)[k] ?? 0);
  };
  const isHere = (l: NavLink) => here === l.href || (l.match ?? []).some((m) => here === m);
  const groups = config.groups.map((g) => ({ ...g, links: g.links.filter((l) => !l.adminOnly || isFull) })).filter((g) => g.links.length);
  const flat: Flat[] = groups.flatMap((g) => g.links.map((l) => ({ ...l, group: g.title })));
  const current = flat.find(isHere);
  const waiting = flat.filter((l) => l.badge && badgeCount(l.badge) > 0);

  function toggleGroup(t: string) {
    const next = closed.includes(t) ? closed.filter((x) => x !== t) : [...closed, t];
    setClosed(next);
    writeLS(`trp_closed_${active}`, next);
  }

  async function signOut() {
    await logout();
    router.replace(`/${active}/login`);
  }

  return (
    <div className="min-h-screen bg-[#090909] text-white">
      <div className="flex min-h-screen">
        <aside
          className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-[#292319] bg-[#101010] p-4 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
            menuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="mb-4 shrink-0 px-1">
            <div className="text-xl font-black tracking-widest text-[#d7b56d]">TR LIVE</div>
            <div className="mt-1 text-[10px] tracking-[0.25em] text-gray-500">{config.subtitle}</div>
          </div>

          {flat.length > 6 && (
            <button
              type="button"
              onClick={() => setPalette(true)}
              className="mb-4 flex shrink-0 items-center gap-2 rounded-lg border border-[#2c261b] bg-[#151515] px-3 py-2 text-left text-sm text-gray-500 hover:border-[#4b3c22] hover:text-gray-300"
            >
              <Search size={15} />
              <span className="flex-1">Sayfa ara…</span>
              <kbd className="rounded border border-[#333] px-1.5 text-[10px] text-gray-500">Ctrl K</kbd>
            </button>
          )}

          <nav className="-mr-2 flex-1 space-y-3 overflow-y-auto pr-2">
            {groups.map((g) => {
              const hasHere = g.links.some(isHere);
              const open = hasHere || !closed.includes(g.title) || groups.length === 1;
              const groupBadge = g.links.reduce((n, l) => n + (l.badge ? badgeCount(l.badge) : 0), 0);
              return (
                <div key={g.title}>
                  {groups.length > 1 && (
                    <button
                      type="button"
                      onClick={() => toggleGroup(g.title)}
                      className="mb-1 flex w-full items-center gap-1 px-1 text-[11px] font-semibold uppercase tracking-widest text-gray-500 hover:text-gray-300"
                    >
                      {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      <span className="flex-1 text-left">{g.title}</span>
                      {!open && groupBadge > 0 && <span className="rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">{groupBadge}</span>}
                    </button>
                  )}
                  {open && (
                    <div className="space-y-0.5">
                      {g.links.map((item) => {
                        const Icon = item.icon;
                        const on = isHere(item);
                        const n = item.badge ? badgeCount(item.badge) : 0;
                        return (
                          <Link
                            key={item.href + item.label}
                            href={item.href}
                            onClick={() => setMenuOpen(false)}
                            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                              on ? "bg-[#292114] font-medium text-[#e5c77e] shadow-[inset_2px_0_0_#d7b56d]" : "text-gray-400 hover:bg-[#1a1a1a] hover:text-white"
                            }`}
                          >
                            <Icon size={16} />
                            <span className="flex-1 truncate">{item.label}</span>
                            {n > 0 && <span className="rounded-full bg-red-600 px-1.5 text-[11px] font-bold text-white">{n > 99 ? "99+" : n}</span>}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="mt-3 shrink-0 border-t border-[#292319] pt-3">
            <div className="flex items-center gap-3 rounded-lg px-2 py-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#292114] text-sm font-bold text-[#e5c77e]">{who.slice(0, 1).toUpperCase()}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{who}</p>
                <p className="truncate text-[11px] text-[#d7b56d]">
                  {roleLabel}
                  {active === "agency" && session.agencyName ? ` · ${session.agencyName}` : ""}
                  {active === "dealer" && session.dealerName ? ` · ${session.dealerName}` : ""}
                </p>
              </div>
              <button type="button" onClick={signOut} title="Oturumu kapat" aria-label="Oturumu kapat" className="rounded-lg p-2 text-red-400 hover:bg-red-950/30">
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </aside>

        {menuOpen && (
          <button
            type="button"
            aria-label="Menüyü kapat"
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 z-40 bg-black/70 lg:hidden"
          />
        )}

        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[#292319] bg-[#101010]/95 px-4 backdrop-blur md:px-8">
            <button
              type="button"
              aria-label="Menüyü aç"
              onClick={() => setMenuOpen(true)}
              className="rounded-lg border border-[#383024] p-1.5 text-[#d7b56d] lg:hidden"
            >
              <Menu size={18} />
            </button>
            <div className="min-w-0 flex-1 truncate text-sm">
              <span className="text-gray-500">{config.title}</span>
              {current && (
                <>
                  <span className="mx-2 text-gray-600">/</span>
                  <span className="text-gray-500">{current.group}</span>
                  <span className="mx-2 text-gray-600">/</span>
                  <span className="font-semibold text-white">{current.label}</span>
                </>
              )}
            </div>
            {/* Bekleyen işler: tek tıkla ilgili sayfa. */}
            <div className="hidden items-center gap-2 md:flex">
              {waiting.map((l) => (
                <Link key={l.href} href={l.href} className="flex items-center gap-1.5 rounded-full border border-red-900/60 bg-red-950/30 px-3 py-1 text-xs text-red-300 hover:bg-red-950/60">
                  {l.label}
                  <b className="text-white">{badgeCount(l.badge!)}</b>
                </Link>
              ))}
            </div>
            {flat.length > 6 && (
              <button type="button" onClick={() => setPalette(true)} aria-label="Sayfa ara" className="rounded-lg p-2 text-gray-400 hover:bg-[#1d1d1d] hover:text-white lg:hidden">
                <Search size={17} />
              </button>
            )}
          </header>

          <section className="p-4 md:p-8">{children}</section>
        </main>
      </div>

      {palette && <CommandPalette items={flat} recent={recent} onClose={() => setPalette(false)} onGo={(href) => { setPalette(false); setMenuOpen(false); router.push(href); }} />}
    </div>
  );
}

/** Hızlı arama: sayfa adı, grup ya da anahtar kelimeyle (ör. "ban", "maaş", "paytr") sayfaya atlar. ↑↓ seçer, Enter açar. */
function CommandPalette({ items, recent, onClose, onGo }: { items: Flat[]; recent: string[]; onClose: () => void; onGo: (href: string) => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const query = norm(q.trim());
  const list = query
    ? items.filter((l) => norm(`${l.label} ${l.group} ${l.keys ?? ""}`).includes(query))
    : [...recent.map((h) => items.find((l) => l.href === h)).filter((l): l is Flat => !!l), ...items.filter((l) => !recent.includes(l.href))];
  const shown = list.filter((l, i) => list.findIndex((x) => x.href === l.href) === i).slice(0, 12);
  const idx = Math.min(sel, Math.max(0, shown.length - 1));

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/70 p-4 pt-[12vh]" onMouseDown={onClose}>
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-[#3a2f1a] bg-[#121212] shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-[#292319] px-4">
          <Search size={16} className="text-gray-500" />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((i) => Math.min(i + 1, shown.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" && shown[idx]) onGo(shown[idx].href);
            }}
            placeholder="Sayfa ya da iş ara (ör. ban, maaş, paytr)…"
            className="h-12 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-gray-600"
          />
          <kbd className="rounded border border-[#333] px-1.5 text-[10px] text-gray-500">Esc</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {!query && recent.length > 0 && <div className="px-2 pb-1 pt-1 text-[10px] uppercase tracking-widest text-gray-600">Son açılanlar ve tümü</div>}
          {shown.length === 0 && <div className="px-3 py-6 text-center text-sm text-gray-500">Sonuç yok.</div>}
          {shown.map((l, i) => {
            const Icon = l.icon;
            return (
              <button
                key={l.href + l.label}
                type="button"
                onMouseEnter={() => setSel(i)}
                onClick={() => onGo(l.href)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${i === idx ? "bg-[#292114] text-[#e5c77e]" : "text-gray-300"}`}
              >
                <Icon size={16} />
                <span className="flex-1">{l.label}</span>
                <span className="text-xs text-gray-600">{l.group}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
