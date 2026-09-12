"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, LogOut, Search, HelpCircle } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { ThemeToggle } from "./theme-toggle";
import { NotificationBell } from "@/components/notifications/notification-center";
import { useSessionUser } from "@/lib/session-context";
import { useAppStore } from "@/lib/store";

const TITLES: Array<{ re: RegExp; title: string }> = [
  { re: /^\/$/, title: "Pulpit" },
  { re: /^\/help/, title: "Instrukcja obsługi" },
  { re: /^\/invoices\/new/, title: "Nowa faktura" },
  { re: /^\/invoices\/(?!new)/, title: "Faktura" },
  { re: /^\/invoices/, title: "Faktury" },
  { re: /^\/offers/, title: "Oferty handlowe" },
  { re: /^\/orders/, title: "Zlecenia & Czas" },
  { re: /^\/expenses/, title: "Koszty i wydatki" },
  { re: /^\/finances/, title: "Finanse & Wyciągi" },
  { re: /^\/accountant/, title: "Księgowość & Zespół" },
  { re: /^\/contractors/, title: "Kontrahenci" },
  { re: /^\/products/, title: "Produkty / Usługi" },
  { re: /^\/settings\/companies/, title: "Moje Firmy / Spółki" },
  { re: /^\/settings/, title: "Ustawienia" },
  { re: /^\/analytics/, title: "Analityka" },
  { re: /^\/ksef/, title: "Centrum KSeF" },
];

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useSessionUser();
  const match = TITLES.find((t) => t.re.test(pathname));
  const title = match?.title ?? "Fakturo";

  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* nawet bez sieci czyścimy stan lokalny */
    }
    useAppStore.getState().resetData();
    router.push("/login");
    router.refresh();
  };

  const handleOpenSearch = () => {
    window.dispatchEvent(new CustomEvent("open-command-palette"));
  };

  return (
    <header className="no-print sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border/60 bg-background/85 px-4 backdrop-blur-xl sm:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenu}
          className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl p-2 text-muted-foreground transition-colors hover:bg-muted/60 active:scale-95 lg:hidden"
          aria-label="Otwórz menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="leading-tight">
          <h1 className="text-[14px] font-semibold tracking-tight text-foreground sm:text-[15px]">
            {title}
          </h1>
          <p className="hidden text-[11px] text-muted-foreground sm:block">
            {new Date().toLocaleDateString("pl-PL", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Przycisk wyszukiwania / Command Palette */}
        <button
          type="button"
          onClick={handleOpenSearch}
          title="Szukaj lub polecenie (Ctrl+K / ⌘K)"
          className="hidden sm:flex items-center gap-2 rounded-xl border border-border/60 bg-card/50 px-2.5 py-1.5 text-xs text-muted-foreground hover:border-border hover:text-foreground transition-all shadow-2xs"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Szukaj...</span>
          <kbd className="rounded border border-border/80 bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            ⌘K
          </kbd>
        </button>

        <NotificationBell />
        <Link
          href="/help"
          title="Instrukcja obsługi"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-card/50 text-muted-foreground transition-all hover:border-border hover:bg-muted/40 hover:text-foreground active:scale-95 shadow-2xs"
        >
          <HelpCircle className="h-4 w-4" />
        </Link>
        <ThemeToggle />

        {/* Profil użytkownika + wylogowanie */}
        <div className="ml-1 flex items-center gap-0.5 rounded-xl border border-border/60 bg-card/50 py-1 pl-1 pr-1 shadow-2xs backdrop-blur-md">
          <Link
            href="/settings/account"
            prefetch={true}
            title="Przejdź do Ustawień Konta"
            className="flex items-center gap-2 rounded-lg px-1.5 py-0.5 transition-all hover:bg-muted/60 active:scale-95"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 text-[10px] font-bold text-white shadow-2xs ring-1 ring-white/20">
              {initials || "?"}
            </div>
            <div className="hidden leading-tight md:block text-left">
              <p className="max-w-[120px] truncate text-[12px] font-semibold text-foreground">
                {user.name}
              </p>
              <p className="max-w-[120px] truncate text-[10.5px] text-muted-foreground">
                {user.email}
              </p>
            </div>
          </Link>
          <button
            onClick={logout}
            title="Wyloguj się"
            aria-label="Wyloguj się"
            className="flex min-h-[36px] min-w-[32px] items-center justify-center rounded-lg p-1.5 text-muted-foreground transition-all hover:bg-rose-500/10 hover:text-rose-500 active:scale-90"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
