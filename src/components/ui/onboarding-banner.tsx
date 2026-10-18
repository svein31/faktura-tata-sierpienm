"use client";

import * as React from "react";
import Link from "next/link";
import { Building2, CheckCircle2, FileText, Play, ShieldCheck, Sparkles, X } from "lucide-react";
import { openOnboardingTour } from "@/components/onboarding/events";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Badge } from "./badge";
import { Button } from "./button";
import { Card } from "./card";

export function OnboardingBanner({
  hasCompany = false,
  hasKsef = false,
  hasInvoices = false,
}: {
  hasCompany?: boolean;
  hasKsef?: boolean;
  hasInvoices?: boolean;
}) {
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      try { setDismissed(localStorage.getItem("fakturo_onboarding_banner_dismissed") === "true"); } catch { /* Optional preference. */ }
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    if (typeof window !== "undefined") {
      try { localStorage.setItem("fakturo_onboarding_banner_dismissed", "true"); } catch { /* The current-page dismissal still works. */ }
    }
  };

  // Jeśli wszystko jest skonfigurowane lub użytkownik odrzucił banner, nie wyświetlamy
  if (dismissed || (hasCompany && hasKsef && hasInvoices)) {
    return null;
  }

  const checklist = [
    { label: "Profil i dane firmy", done: hasCompany, href: "/settings/companies", icon: Building2 },
    { label: "Autoryzacja KSeF 2.0", done: hasKsef, href: "/ksef", icon: ShieldCheck },
    { label: "Pierwsza faktura VAT", done: hasInvoices, href: "/invoices/new", icon: FileText },
  ];

  return (
    <Card className="relative overflow-hidden border-border/70 bg-gradient-to-r from-card via-[#0e131d] to-card p-4 backdrop-blur shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-sm text-foreground">
                Witaj w FakturaProsto! Ukończ szybką konfigurację konta
              </h4>
              <Badge tone="accent" className="text-[10px]">
                Start
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Skorzystaj z interaktywnego samouczka, aby przygotować system do zgodności z KSeF 2.0 i wystawić pierwszą fakturę.
            </p>
          </div>
        </div>

        {/* Akcje bannera */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            size="sm"
            onClick={openOnboardingTour}
            className="gap-1.5 text-xs font-semibold shadow-sm"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            <span>Uruchom samouczek</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            title="Zamknij powiadomienie"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Mini checklist kroki */}
      <div className="mt-3.5 grid grid-cols-1 sm:grid-cols-3 gap-2 border-t border-border/40 pt-3">
        {checklist.map((item, idx) => (
          <Link prefetch={false}
            key={idx}
            href={item.href} onClick={() => { if (item.href === "/invoices/new") useAppStore.getState().setDraft(null, true); }}
            className={cn(
              "flex items-center justify-between rounded-lg border p-2 text-xs transition-colors",
              item.done
                ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-400"
                : "border-border/50 bg-card/60 text-muted-foreground hover:border-border hover:text-foreground"
            )}
          >
            <div className="flex items-center gap-2">
              <item.icon className="h-3.5 w-3.5" />
              <span>{item.label}</span>
            </div>
            {item.done ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <span className="text-[10px] text-muted-foreground">Do zrobienia</span>
            )}
          </Link>
        ))}
      </div>
    </Card>
  );
}
