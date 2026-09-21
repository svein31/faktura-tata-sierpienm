"use client";

import { useWorkspacePreference } from "@/lib/use-workspace-preference";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Star,
  BarChart3,
  Building2,
  FileText,
  LayoutDashboard,
  Package,
  Plus,
  ShieldCheck,
  UserCog,
  Users,
  X,
  FileCheck2,
  Briefcase,
  Receipt,
  DollarSign,
  Users2,
  BookOpen,
  Calendar,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "./theme-toggle";
import { useSessionUser } from "@/lib/session-context";

const NAV_MAIN = [
  { href: "/dashboard", label: "Pulpit", icon: LayoutDashboard, exact: true },
  { href: "/invoices", label: "Faktury", icon: FileText },
  { href: "/advances", label: "Proformy i zaliczki", icon: FileText },
  { href: "/recurring", label: "Faktury cykliczne", icon: FileText },
  { href: "/reminders", label: "Przypomnienia e-mail", icon: FileText },
  { href: "/offers", label: "Oferty", icon: FileCheck2 },
  { href: "/orders", label: "Zlecenia & Czas", icon: Briefcase },
  { href: "/projects", label: "Rentowność projektów", icon: BarChart3 },
  { href: "/documents", label: "Skrzynka dokumentów", icon: Receipt },
  { href: "/expenses", label: "Koszty i wydatki", icon: Receipt },
  { href: "/cost-reviews", label: "Obieg kosztów", icon: FileCheck2 },
  { href: "/finances", label: "Finanse & Wyciągi", icon: DollarSign },
  { href: "/calendar", label: "Terminarz płatności", icon: Calendar },
  { href: "/contractors", label: "Kontrahenci", icon: Users },
  { href: "/products", label: "Produkty / Usługi", icon: Package },
  { href: "/warehouse", label: "Magazyn", icon: Package },
  { href: "/analytics", label: "Analityka", icon: BarChart3 },
];

const NAV_SETTINGS = [
  { href: "/jpk", label: "Eksport JPK", icon: FileCheck2 },
  { href: "/settings/integrations", label: "API i webhooki", icon: BookOpen },
  { href: "/settings/health", label: "Stan przetwarzania", icon: BarChart3 },
  { href: "/audit", label: "Dziennik zmian", icon: BookOpen },
  { href: "/settings/team", label: "Zespół i uprawnienia", icon: Users2 },
  { href: "/accountant", label: "Paczka dla księgowej", icon: FileCheck2 },
  { href: "/ksef", label: "Centrum KSeF", icon: ShieldCheck },
  { href: "/settings/companies", label: "Moje Firmy / NIP", icon: Building2 },
  { href: "/settings/pdf-templates", label: "Szablony PDF", icon: FileText },
  { href: "/settings/currencies", label: "Waluty & Kursy NBP", icon: Globe },
  { href: "/settings/account", label: "Ustawienia Konta", icon: UserCog },
  { href: "/help", label: "Instrukcja obsługi", icon: BookOpen },
];

const ALL_NAV = [...NAV_MAIN, ...NAV_SETTINGS];
const NAV_GROUPS = [
  { label: "Start", paths: ["/dashboard"] },
  { label: "Sprzedaż", paths: ["/invoices", "/advances", "/recurring", "/offers"] },
  { label: "Zakupy", paths: ["/documents", "/expenses", "/cost-reviews"] },
  { label: "Klienci i praca", paths: ["/orders", "/projects", "/contractors", "/products", "/warehouse"] },
  { label: "Księgowość i finanse", paths: ["/accountant", "/jpk", "/analytics", "/finances", "/calendar", "/reminders"] },
  { label: "Integracje i ustawienia", paths: ["/ksef", "/settings/integrations", "/settings/health", "/audit", "/settings/team", "/settings/companies", "/settings/pdf-templates", "/settings/currencies", "/settings/account", "/help"] },
];

export function SidebarContent({
  onNavigate,
  navLayoutId = "sidebar-active",
}: {
  onNavigate?: () => void;
  navLayoutId?: string;
}) {
  const pathname = usePathname();
  const user = useSessionUser();
  const prefs = useWorkspacePreference<string[]>("favorites");
  const favorites = Array.isArray(prefs.value) ? prefs.value.filter(path => ALL_NAV.some(item => item.href === path)) : [];
  const toggleFavorite = (href: string) => void prefs.save(favorites.includes(href) ? favorites.filter(p => p !== href) : [...favorites, href]);
  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="flex h-full flex-col select-none">
      <div className="flex h-16 items-center justify-between px-5 border-b border-border/50">
        <Logo />
        <button
          onClick={onNavigate}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted lg:hidden"
          aria-label="Zamknij menu"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-3 pt-3">
        <Link
          href="/invoices/new"
          onClick={onNavigate}
          className="flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          <span>Wystaw fakturę</span>
        </Link>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-3">
        {favorites.length > 0 && <div className="space-y-1"><p className="px-3 text-[10.5px] uppercase font-semibold text-muted-foreground">Ulubione</p>{favorites.map(href => { const item = ALL_NAV.find(i => i.href === href)!; return <Link key={href} href={href} onClick={onNavigate} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-muted"><item.icon size={16} />{item.label}</Link>; })}</div>}
        {NAV_GROUPS.map(group => <div className="space-y-0.5" key={group.label}>
          <p className="px-3 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-1">{group.label}</p>
          {group.paths.map(href => {
            const item = ALL_NAV.find(i => i.href === href)!;
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
            return <div className="flex items-center group" key={href}>
              <Link href={href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={cn("relative flex flex-1 min-w-0 min-h-[40px] items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors", active ? "text-primary font-semibold" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground")}>
                {active && <motion.span layoutId={navLayoutId} className="absolute inset-0 rounded-xl bg-primary/10 ring-1 ring-inset ring-primary/20" transition={{ type: "spring", duration: 0.35, bounce: 0.12 }} />}
                <item.icon className="relative z-10 h-[18px] w-[18px] shrink-0" strokeWidth={active ? 2.3 : 1.8} /><span className="relative z-10">{item.label}</span>
              </Link>
              <button disabled={!prefs.ready || prefs.saving} onClick={() => toggleFavorite(href)} aria-label={`${favorites.includes(href) ? "Usuń z" : "Dodaj do"} ulubionych: ${item.label}`} aria-pressed={favorites.includes(href)} className="rounded-lg p-2 hover:bg-muted"><Star size={13} className={favorites.includes(href) ? "fill-amber-400 text-amber-500" : "text-muted-foreground/50"} /></button>
            </div>;
          })}
        </div>)}
        {prefs.error && <p role="alert" className="px-3 text-xs text-rose-500">{prefs.error}</p>}

        <div className="pt-2">
          <div className="rounded-xl border border-border bg-muted/20 p-3 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-muted-foreground/30" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-muted-foreground/50" />
              </span>
              <span className="text-[11.5px] font-semibold text-foreground">
                Integracje GUS i KSeF
              </span>
            </div>
            <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
              Status połączenia sprawdzisz w Centrum KSeF.
            </p>
          </div>
        </div>
      </nav>

      {/* Linki prawne */}
      <div className="px-4 py-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground/70">
        <a href="/regulamin" target="_blank" className="hover:text-foreground transition-colors">Regulamin</a>
        <a href="/polityka-prywatnosci" target="_blank" className="hover:text-foreground transition-colors">Prywatność</a>
        <a href="/polityka-cookies" target="_blank" className="hover:text-foreground transition-colors">Cookies</a>
        <button
          onClick={() => {
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("open-cookie-preferences"));
            }
          }}
          className="hover:text-foreground transition-colors cursor-pointer"
        >
          Preferencje
        </button>
      </div>

      <div className="border-t border-border/60 p-3">
        <div className="flex items-center justify-between rounded-xl px-2 py-1.5 bg-card/40 border border-border/40">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 text-[11px] font-bold text-white shadow-2xs">
              {initials || "?"}
            </div>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[12.5px] font-semibold text-foreground">{user.name}</p>
              <p className="truncate text-[10.5px] text-muted-foreground">{user.email}</p>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="no-print fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-border/60 bg-card/85 backdrop-blur-2xl dark:bg-card/70 lg:block">
      <SidebarContent />
    </aside>
  );
}

export function MobileSidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <div className="no-print fixed inset-0 z-50 lg:hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            transition={{ type: "spring", duration: 0.35, bounce: 0.1 }}
            className="absolute inset-y-0 left-0 w-72 border-r border-border bg-card shadow-2xl"
          >
            <SidebarContent onNavigate={onClose} navLayoutId="sidebar-active-mobile" />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
