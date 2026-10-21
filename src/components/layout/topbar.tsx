"use client";

import * as React from "react";
import { ReportButton } from "@/components/support/report-button";
import Link from "next/link";
import { Menu, LogOut, Search, HelpCircle, Building2, ChevronDown, Check, Shield } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { ThemeToggle } from "./theme-toggle";
import { NotificationBell } from "@/components/notifications/notification-center";
import { useSessionUser } from "@/lib/session-context";
import { useAppStore } from "@/lib/store";
import { useToast } from "@/components/toast";
import { DropdownMenu } from "@/components/ui/dropdown-menu";

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
  owner: { label: "Właściciel", badgeClass: "bg-primary/15 text-primary dark:text-primary border-primary/30" },
  accountant: { label: "Księgowa", badgeClass: "bg-success/15 text-success dark:text-success border-success/30" },
  employee: { label: "Pracownik", badgeClass: "bg-info/15 text-info dark:text-info border-info/30" },
  admin: { label: "Administrator", badgeClass: "bg-primary/15 text-primary dark:text-primary border-primary/30" },
  sales: { label: "Sprzedaż", badgeClass: "bg-info/15 text-info dark:text-info border-info/30" },
  viewer: { label: "Podgląd", badgeClass: "bg-warning/15 text-warning dark:text-warning border-warning/30" },
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
  const hydrated = useAppStore((s) => s.hydrated);
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const setSelectedCompanyId = useAppStore((s) => s.setSelectedCompanyId);

  const activeCompany = companies.find((c) => c.id === selectedCompanyId) || company || companies[0] || null;
  const currentRole = activeCompany?.currentUserRole || "owner";
  const roleInfo = ROLE_DISPLAY[currentRole] || ROLE_DISPLAY.employee;

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

  const companyButton = activeCompany ? <button
    type="button"
    onClick={companies.length > 1 ? undefined : () => router.push("/settings/companies")}
    className="flex min-h-11 w-full min-w-0 items-center gap-2.5 rounded-xl border border-input bg-card px-3 py-1.5 text-left shadow-2xs transition-[border-color,background-color,box-shadow] duration-150 hover:border-primary/35 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 xl:w-auto xl:max-w-[260px]"
  >
    <span className="sr-only">{companies.length > 1 ? "Wybierz firmę:" : "Ustawienia firmy:"} </span>
    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
      <Building2 aria-hidden="true" className="size-4" />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[13px] font-semibold leading-5 text-foreground">{activeCompany.companyName || activeCompany.name || "Moja Firma"}</span>
      <span className="flex items-center gap-1.5 leading-4">
        <span className="truncate text-xs text-muted-foreground">NIP: {activeCompany.nip}</span>
        <span className={`shrink-0 rounded border px-1 text-xs font-semibold ${roleInfo.badgeClass}`}>{roleInfo.label}</span>
      </span>
    </span>
    {companies.length > 1 && <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />}
  </button> : null;

  return (
    <header className="no-print sticky top-0 z-30 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 border-b border-border/60 bg-background px-3 py-2 xl:flex xl:h-16 xl:gap-3 xl:bg-background/95 xl:px-6 xl:py-0">
      <div className="order-1 flex min-w-0 items-center gap-2 sm:gap-3">
        <button
          onClick={onMenu}
          className="flex shrink-0 min-h-[44px] min-w-[44px] items-center justify-center rounded-xl p-2 text-muted-foreground transition-colors hover:bg-muted/60 active:opacity-90 lg:hidden"
          aria-label="Otwórz menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-medium tracking-tight text-foreground sm:text-base">
            {title}
          </p>
          <p className="hidden text-xs text-muted-foreground sm:block">
            {new Date().toLocaleDateString("pl-PL", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
        </div>


      </div>

      <div className={`order-3 col-span-2 min-w-0 xl:order-2 xl:ml-2 ${!activeCompany ? "xl:hidden" : ""}`}>
        {!activeCompany ? hydrated ? (
          <Link prefetch={false} href="/settings/companies" className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-xl border border-input bg-card px-3 py-1.5 text-[13px] font-semibold transition-colors hover:border-primary/35 hover:bg-muted/30">
            <Building2 aria-hidden="true" className="size-4 text-primary" />Dodaj firmę
          </Link>
        ) : <div aria-hidden="true" inert className="invisible min-h-11" /> : companyButton && (companies.length > 1 ? (
          <DropdownMenu trigger={companyButton} align="start" label="Twoje firmy i zespoły" minWidth={280} className="max-w-[calc(100vw-24px)]">
            <p className="px-3 pb-2 pt-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Twoje firmy i zespoły</p>
            {companies.map(c => {
              const isSelected = c.id === activeCompany.id;
              const role = ROLE_DISPLAY[c.currentUserRole || "owner"] || ROLE_DISPLAY.employee;
              return <button key={c.id} type="button" aria-current={isSelected ? "true" : undefined}
                onClick={() => {
                  setSelectedCompanyId(c.id);
                  if (/^\/invoices\/(?!new(?:\/|$))[^/]+$/.test(pathname)) router.push("/invoices");
                }}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-[13px] ${isSelected ? "bg-primary/10 text-primary" : "text-foreground"}`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold leading-5">{c.companyName || c.name}</span>
                  <span className="block truncate text-xs leading-5 text-muted-foreground">NIP: {c.nip} · {role.label}</span>
                </span>
                {isSelected && <Check aria-hidden="true" className="size-4 shrink-0 text-primary" />}
              </button>;
            })}
            <div role="separator" className="my-1.5 border-t border-border/60" />
            <Link href="/settings/team" prefetch={false} className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium text-primary">
              <Shield aria-hidden="true" className="size-4" /><span>Zarządzaj zespołem i rolami</span>
            </Link>
          </DropdownMenu>
        ) : companyButton)}
      </div>

      <div className="order-2 flex shrink-0 items-center gap-1 xl:order-3 xl:ml-auto sm:gap-2">
        {/* Przycisk wyszukiwania / Command Palette */}
        <button
          type="button"
          onClick={handleOpenSearch}
          title="Szukaj lub polecenie (Ctrl+K / ⌘K)"
          className="flex min-h-9 min-w-9 items-center justify-center gap-2 rounded-xl border border-border/60 bg-card px-2.5 py-1.5 text-xs text-muted-foreground hover:border-border hover:text-foreground transition-all shadow-2xs sm:min-w-0"
        >
          <Search aria-hidden="true" className="h-3.5 w-3.5" />
          <span className="sr-only xl:hidden">Szukaj </span>
          <span className="hidden xl:inline">Szukaj...</span>
          <kbd className="hidden rounded border border-border/80 bg-muted/60 px-1.5 py-0.5 text-xs font-medium text-foreground dark:text-muted-foreground xl:inline">
            ⌘K
          </kbd>
          <span className="sr-only"> faktur, kontrahentów i poleceń</span>
        </button>

        <NotificationBell />
        <ReportButton compact />
        <Link
          href="/help"
          prefetch={false}
          title="Instrukcja obsługi"
          className="hidden h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-card text-muted-foreground transition-all hover:border-border hover:bg-muted/40 hover:text-foreground active:opacity-90 shadow-2xs sm:flex"
        >
          <HelpCircle className="h-4 w-4" />
        </Link>
        <div className="hidden sm:block"><ThemeToggle /></div>

        {/* Profil użytkownika + wylogowanie */}
        <div className="ml-1 flex items-center gap-0.5 rounded-xl border border-border/60 bg-card py-1 pl-1 pr-1 shadow-2xs ">
          <Link
            href="/settings/account"
            prefetch={false}
            title="Przejdź do Ustawień Konta"
            className="hidden items-center gap-2 rounded-lg px-1.5 py-0.5 sm:flex transition-all hover:bg-muted/60 active:opacity-90"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-xs font-medium text-foreground">
              {initials || "?"}
            </div>
            {accountTier && <span className="rounded-md border border-border/70 bg-muted/70 px-1.5 py-0.5 text-xs font-semibold text-foreground dark:text-muted-foreground 2xl:hidden">{accountTier === "pro" ? "Pro" : "Free"}</span>}
            <div className="hidden leading-tight 2xl:block text-left">
              <p className="flex max-w-[155px] items-center gap-1 text-[13px] font-semibold text-foreground">
                <span className="truncate">{user.name}</span>
                {accountTier && <span className="shrink-0 rounded-md border border-border/70 bg-muted/70 px-1 text-xs text-foreground dark:text-muted-foreground">{accountTier === "pro" ? "Pro" : "Free"}</span>}
              </p>
              <p className="max-w-[140px] truncate text-xs text-muted-foreground">
                {user.email}
              </p>
            </div>
          </Link>
          <button
            onClick={logout}
            title="Wyloguj się"
            aria-label="Wyloguj się"
            className="flex min-h-[36px] min-w-[32px] items-center justify-center rounded-lg p-1.5 text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive active:opacity-90"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
