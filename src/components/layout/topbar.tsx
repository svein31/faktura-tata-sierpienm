"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, LogOut } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { FlaskConical } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { NotificationBell } from "@/components/notifications/notification-center";
import { useSessionUser } from "@/lib/session-context";
import { useAppStore } from "@/lib/store";

const TITLES: Array<{ re: RegExp; title: string }> = [
  { re: /^\/$/, title: "Dashboard" },
  { re: /^\/invoices\/new/, title: "Nowa faktura" },
  { re: /^\/invoices\/(?!new)/, title: "Faktura" },
  { re: /^\/invoices/, title: "Faktury" },
  { re: /^\/contractors/, title: "Kontrahenci" },
  { re: /^\/products/, title: "Produkty / Usługi" },
  { re: /^\/settings\/companies/, title: "Moje Firmy / Spółki" },
  { re: /^\/settings/, title: "Ustawienia" },
  { re: /^\/analytics/, title: "Analityka" },
  { re: /^\/ksef/, title: "Ustawienia KSeF" },
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

  return (
    <header className="no-print sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl dark:bg-slate-950/80 sm:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenu}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl p-2 text-muted-foreground transition-colors hover:bg-muted active:scale-95 lg:hidden"
          aria-label="Otwórz menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="leading-tight">
          <h1 className="text-[15px] font-semibold tracking-tight sm:text-base">{title}</h1>
          <p className="hidden text-[12px] text-muted-foreground sm:block">
            {new Date().toLocaleDateString("pl-PL", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2">
        <NotificationBell />
        <ThemeToggle />

        {/* Profil użytkownika + przejście do Ustawień Konta + wylogowanie */}
        <div className="ml-1 flex items-center gap-1 rounded-full border border-border/70 py-1 pl-1 pr-1.5 bg-card/60 shadow-2xs backdrop-blur-md">
          <Link
            href="/settings/account"
            prefetch={true}
            title="Przejdź do Ustawień Konta"
            className="flex items-center gap-2 rounded-full py-0.5 pl-0.5 pr-2 transition-all hover:bg-muted/70 active:scale-95"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-emerald-500 text-[10.5px] font-bold text-white shadow-xs">
              {initials || "?"}
            </div>
            <div className="hidden leading-tight md:block text-left">
              <p className="max-w-[130px] truncate text-[12px] font-semibold">{user.name}</p>
              <p className="max-w-[130px] truncate text-[10.5px] text-muted-foreground">{user.email}</p>
            </div>
          </Link>
          <button
            onClick={logout}
            title="Wyloguj się"
            aria-label="Wyloguj się"
            className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-full p-1.5 text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive active:scale-90"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
