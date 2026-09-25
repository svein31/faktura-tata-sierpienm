"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, LogOut, Search, HelpCircle, Building2, ChevronDown, Check, Shield } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { ThemeToggle } from "./theme-toggle";
import { NotificationBell } from "@/components/notifications/notification-center";
import { useSessionUser } from "@/lib/session-context";
import { useAppStore } from "@/lib/store";
import { useToast } from "@/components/toast";

const TITLES: Array<{ re: RegExp; title: string }> = [
  { re: /^\/(dashboard)?$/, title: "Pulpit" },
  { re: /^\/advances/, title: "Proformy i zaliczki" },
  { re: /^\/recurring/, title: "Faktury cykliczne" },
  { re: /^\/reminders/, title: "Przypomnienia e-mail" },
  { re: /^\/help/, title: "Instrukcja obsługi" },
  { re: /^\/invoices\/new/, title: "Nowa faktura" },
  { re: /^\/invoices\/(?!new)/, title: "Faktura" },
  { re: /^\/invoices/, title: "Faktury" },
  { re: /^\/offers/, title: "Oferty handlowe" },
  { re: /^\/orders/, title: "Zlecenia & Czas" },
  { re: /^\/expenses/, title: "Koszty i wydatki" },
  { re: /^\/finances/, title: "Finanse & Wyciągi" },
  { re: /^\/calendar/, title: "Terminarz płatności & Podatki" },
  { re: /^\/accountant/, title: "Paczka dla księgowej" },
  { re: /^\/settings\/team/, title: "Zespół i uprawnienia" },
  { re: /^\/contractors/, title: "Kontrahenci" },
  { re: /^\/products/, title: "Produkty / Usługi" },
  { re: /^\/settings\/companies/, title: "Moje Firmy / Spółki" },
  { re: /^\/settings\/currencies/, title: "Waluty & Kursy NBP" },
  { re: /^\/settings/, title: "Ustawienia" },
  { re: /^\/analytics/, title: "Analityka" },
  { re: /^\/ksef/, title: "Centrum KSeF" },
];

const ROLE_DISPLAY: Record<string, { label: string; badgeClass: string }> = {
  owner: { label: "Właściciel", badgeClass: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30" },
  accountant: { label: "Księgowa", badgeClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" },
  employee: { label: "Pracownik", badgeClass: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30" },
  viewer: { label: "Podgląd", badgeClass: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" },
};

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useSessionUser();
  const toast = useToast();
  const [accountTier, setAccountTier] = React.useState<"free" | "pro" | null>(null);
  React.useEffect(() => {
    const controller = new AbortController();
    fetch("/api/subscription", { signal: controller.signal, cache: "no-store" })
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (!controller.signal.aborted && data?.quota?.tier) setAccountTier(data.quota.tier); })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const match = TITLES.find((t) => t.re.test(pathname));
  const title = match?.title ?? "FakturaProsto";

  const companies = useAppStore((s) => s.companies);
  const company = useAppStore((s) => s.company);
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const setSelectedCompanyId = useAppStore((s) => s.setSelectedCompanyId);
  const [showCompanyMenu, setShowCompanyMenu] = React.useState(false);
  const companyMenuRef = React.useRef<HTMLDivElement>(null);

  const activeCompany = companies.find((c) => c.id === selectedCompanyId) || company || companies[0] || null;
  const currentRole = activeCompany?.currentUserRole || "owner";
  const roleInfo = ROLE_DISPLAY[currentRole] || ROLE_DISPLAY.employee;

  // Zamknij menu po kliknięciu poza nim
  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (companyMenuRef.current && !companyMenuRef.current.contains(e.target as Node)) {
        setShowCompanyMenu(false);
      }
    }
    if (showCompanyMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      const handleEscape = (event: KeyboardEvent) => {
        if (event.key === "Escape") setShowCompanyMenu(false);
      };
      document.addEventListener("keydown", handleEscape);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleEscape);
      };
    }
  }, [showCompanyMenu]);

  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");

  const logout = async () => {
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Serwer nie potwierdził wylogowania.");
    } catch {
      toast("error", "Nie udało się wylogować", "Sprawdź połączenie i spróbuj ponownie.");
      return;
    }
    useAppStore.getState().resetData();
    router.push("/login");
    router.refresh();
  };

  const handleOpenSearch = () => {
    window.dispatchEvent(new CustomEvent("open-command-palette"));
  };

  return (
    <header className="no-print sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border/60 bg-background px-4 sm:bg-background/85 sm:px-6 sm:backdrop-blur-xl">
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

        {/* Company Switcher z widoczną rolą użytkownika */}
        {activeCompany && (
          <div className="relative ml-2 sm:ml-4" ref={companyMenuRef}>
            <button
              type="button"
              onClick={() => companies.length > 1 ? setShowCompanyMenu(!showCompanyMenu) : router.push("/settings/companies")}
              aria-label={companies.length > 1 ? "Wybierz firmę" : "Ustawienia firmy"}
              aria-expanded={companies.length > 1 ? showCompanyMenu : undefined}
              className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-2.5 py-1 text-left transition-all hover:bg-muted/40 hover:border-border active:scale-95 shadow-2xs"
            >
              <div className="p-1 rounded-lg bg-primary/10 text-primary">
                <Building2 className="w-3.5 h-3.5" />
              </div>
              <div className="hidden sm:block">
                <p className="max-w-[140px] truncate text-xs font-semibold text-foreground leading-tight">
                  {activeCompany.companyName || activeCompany.name || "Moja Firma"}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] text-muted-foreground">NIP: {activeCompany.nip}</span>
                  <span className={`text-[9.5px] font-semibold px-1 py-0.2 rounded border ${roleInfo.badgeClass}`}>
                    {roleInfo.label}
                  </span>
                </div>
              </div>
              {companies.length > 1 && (
                <ChevronDown className="w-3 h-3 text-muted-foreground ml-0.5" />
              )}
            </button>

            {/* Dropdown przełączania firm */}
            {showCompanyMenu && companies.length > 1 && (
              <div className="absolute top-full left-0 mt-1.5 w-64 rounded-xl border border-border/80 bg-card p-1.5 shadow-xl z-50 animate-in fade-in-50 zoom-in-95">
                <p className="px-2 py-1 text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Twoje firmy i zespoły
                </p>
                <div className="space-y-0.5 mt-1 max-h-56 overflow-y-auto">
                  {companies.map((c) => {
                    const isSelected = c.id === activeCompany.id;
                    const r = ROLE_DISPLAY[c.currentUserRole || "owner"] || ROLE_DISPLAY.employee;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSelectedCompanyId(c.id);
                    if (/^\/invoices\/(?!new(?:\/|$))[^/]+$/.test(pathname)) router.push("/invoices");
                          setShowCompanyMenu(false);
                        }}
                        className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition-colors ${
                          isSelected ? "bg-primary/10 text-primary font-semibold" : "hover:bg-muted text-foreground"
                        }`}
                      >
                        <div className="truncate">
                          <p className="truncate font-medium">{c.companyName || c.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            NIP: {c.nip} · <span className="font-semibold">{r.label}</span>
                          </p>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                      </button>
                    );
                  })}
                </div>
                <div className="border-t border-border/60 mt-1.5 pt-1">
                  <Link
                    href="/settings/team"
                    onClick={() => setShowCompanyMenu(false)}
                    className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-primary hover:bg-muted/50 rounded-lg transition-colors"
                  >
                    <Shield className="w-3.5 h-3.5" />
                    <span>Zarządzaj zespołem i rolami</span>
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Przycisk wyszukiwania / Command Palette */}
        <button
          type="button"
          onClick={handleOpenSearch}
          title="Szukaj lub polecenie (Ctrl+K / ⌘K)"
          aria-label="Szukaj faktur, kontrahentów i poleceń"
          className="flex min-h-9 min-w-9 items-center justify-center gap-2 rounded-xl border border-border/60 bg-card/50 px-2.5 py-1.5 text-xs text-muted-foreground hover:border-border hover:text-foreground transition-all shadow-2xs sm:min-w-0"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Szukaj...</span>
          <kbd className="hidden rounded border border-border/80 bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
            ⌘K
          </kbd>
        </button>

        <NotificationBell />
        <Link
          href="/help"
          title="Instrukcja obsługi"
          className="hidden h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-card/50 text-muted-foreground transition-all hover:border-border hover:bg-muted/40 hover:text-foreground active:scale-95 shadow-2xs sm:flex"
        >
          <HelpCircle className="h-4 w-4" />
        </Link>
        <div className="hidden sm:block"><ThemeToggle /></div>

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
            {accountTier && <span className="rounded-md border border-border/70 bg-muted/70 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground md:hidden">{accountTier === "pro" ? "Pro" : "Free"}</span>}
            <div className="hidden leading-tight md:block text-left">
              <p className="flex max-w-[155px] items-center gap-1 text-[12px] font-semibold text-foreground">
                <span className="truncate">{user.name}</span>
                {accountTier && <span className="shrink-0 rounded-md border border-border/70 bg-muted/70 px-1 text-[10px] text-muted-foreground">{accountTier === "pro" ? "Pro" : "Free"}</span>}
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
