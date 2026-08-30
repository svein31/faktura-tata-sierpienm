"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  Building2,
  FileText,
  FlaskConical,
  LayoutDashboard,
  Package,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "./theme-toggle";
import { useSessionUser } from "@/lib/session-context";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/invoices", label: "Faktury", icon: FileText },
  { href: "/contractors", label: "Kontrahenci", icon: Users },
  { href: "/products", label: "Produkty / Usługi", icon: Package },
  { href: "/settings/companies", label: "Moje Firmy / NIP", icon: Building2 },
  { href: "/analytics", label: "Analityka", icon: BarChart3 },
  { href: "/ksef", label: "Ustawienia KSeF", icon: ShieldCheck },
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
  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between px-5">
        <Logo />
        <button
          onClick={onNavigate}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted lg:hidden"
          aria-label="Zamknij menu"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {NAV.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              {active && (
                <motion.span
                  layoutId={navLayoutId}
                  className="absolute inset-0 rounded-lg bg-primary/10 ring-1 ring-inset ring-primary/15"
                  transition={{ type: "spring", duration: 0.45, bounce: 0.18 }}
                />
              )}
              <item.icon
                className={cn("relative z-10 h-[18px] w-[18px]", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")}
                strokeWidth={active ? 2.2 : 1.8}
              />
              <span className="relative z-10">{item.label}</span>
            </Link>
          );
        })}

        <div className="pt-4">
          <div className="mx-3 mb-2 flex items-center gap-1.5">
            <FlaskConical className="h-3.5 w-3.5 text-accent" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Tryb demo
            </span>
          </div>
          <div className="mx-3 rounded-lg border border-dashed border-border bg-muted/40 p-3">
            <p className="text-[12px] leading-snug text-muted-foreground">
              Integracje GUS i KSeF działają w trybie demo. Zobacz README, aby
              podpiąć prawdziwe API.
            </p>
            <Badge tone="accent" className="mt-2">
              <FlaskConical className="h-3 w-3" /> demo
            </Badge>
          </div>
        </div>
      </nav>

      <div className="border-t border-border/70 p-3">
        <div className="flex items-center justify-between rounded-lg px-2 py-1.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-emerald-500 text-[11px] font-bold text-white">
              {initials || "?"}
            </div>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[13px] font-semibold">{user.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
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
    <aside className="no-print fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-border bg-card/60 backdrop-blur lg:block">
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
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            transition={{ type: "spring", duration: 0.4, bounce: 0.1 }}
            className="absolute inset-y-0 left-0 w-72 border-r border-border bg-card shadow-2xl"
          >
            <SidebarContent onNavigate={onClose} navLayoutId="sidebar-active-mobile" />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
