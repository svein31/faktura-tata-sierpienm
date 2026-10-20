"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  CreditCard,
  Check,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Calendar,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_STATUS_LABELS,
  type SubscriptionPlan,
  type SubscriptionStatus,
} from "@/lib/subscription-plans";
import { cn } from "@/lib/utils";
import { paymentReturnMessage } from "./payment-return";

type SubscriptionInfo = {
  plan: SubscriptionPlan | null;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasPortal: boolean;
  accessSource: string | null;
  isPro: boolean;
};

type BillingApiResponse = {
  plans: typeof SUBSCRIPTION_PLANS;
  quota: { tier: "free" | "pro"; used: number; limit: number | null; remaining: number | null };
  subscription: SubscriptionInfo;
};

export function SubscriptionCard() {
  const searchParams = useSearchParams();
  const billingParam = searchParams.get("billing");

  const [data, setData] = React.useState<BillingApiResponse | null>(null);
  const [selectedPlan, setSelectedPlan] = React.useState<SubscriptionPlan>("yearly");
  const [loading, setLoading] = React.useState(true);
  const [checkoutLoading, setCheckoutLoading] = React.useState(false);
  const [portalLoading, setPortalLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [verificationExhausted, setVerificationExhausted] = React.useState(false);

  const loadSubscription = React.useCallback(async (signal?: AbortSignal, background = false): Promise<BillingApiResponse | null> => {
    try {
      if (!background) setLoading(true);
      setError(null);
      const timeout = AbortSignal.timeout(10000);
      const res = await fetch("/api/subscription", { signal: signal ? AbortSignal.any([signal, timeout]) : timeout, cache: "no-store" });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Nie udało się pobrać danych subskrypcji.");
      if (signal?.aborted) return null;
      setData(result as BillingApiResponse);
      return result as BillingApiResponse;
    } catch (err: unknown) {
      if (signal?.aborted) return null;
      setError(err instanceof Error ? err.message : "Wystąpił błąd podczas ładowania planu.");
      return null;
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    setVerificationExhausted(false);
    async function check() {
      attempts += 1;
      const result = await loadSubscription(controller.signal, attempts > 1);
      if (controller.signal.aborted) return;
      if (billingParam === "success" && !result?.subscription.isPro) {
        if (attempts < 8) timer = setTimeout(() => { void check(); }, 3000);
        else setVerificationExhausted(true);
      }
    }
    void check();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [billingParam, loadSubscription]);

  // Rozpoczęcie procesu Stripe Checkout
  const handleStartCheckout = async (plan: SubscriptionPlan) => {
    try {
      setCheckoutLoading(true);
      setError(null);
      const res = await fetch("/api/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || "Nie udało się rozpocząć transakcji.");
      }
      if (result.url) {
        window.location.href = result.url;
      } else {
        throw new Error("Brak adresu URL przekierowania.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Wystąpił błąd przy inicjowaniu płatności.");
      setCheckoutLoading(false);
    }
  };

  // Otwarcie Stripe Customer Portal
  const handleOpenCustomerPortal = async () => {
    try {
      setPortalLoading(true);
      setError(null);
      const res = await fetch("/api/subscription/portal", {
        method: "POST",
      });
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || "Nie udało się otworzyć portalu rozliczeniowego.");
      }
      if (result.url) {
        window.location.href = result.url;
      } else {
        throw new Error("Brak adresu URL portalu klienta.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Wystąpił błąd przy otwieraniu portalu.");
      setPortalLoading(false);
    }
  };

  const subscription = data?.subscription;
  const isPro = subscription?.isPro ?? false;
  const bannerMessage = paymentReturnMessage(billingParam, subscription, verificationExhausted);

  const currentStatusLabel = subscription
    ? SUBSCRIPTION_STATUS_LABELS[subscription.status] || subscription.status
    : "Nieaktywna";

  const getStatusBadgeTone = (status: SubscriptionStatus) => {
    switch (status) {
      case "active":
        return "success";
      case "trialing":
        return "primary";
      case "past_due":
        return "warning";
      case "canceled":
        return "destructive";
      default:
        return "outline";
    }
  };

  return (
    <Card className="max-w-4xl border-border/80 shadow-xs">
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Plan i Subskrypcja</CardTitle>
            </div>
            <CardDescription>
              Free obejmuje do 5 faktur miesięcznie. Pro znosi ten limit; dostępne moduły pozostają wspólne dla obu planów.
            </CardDescription>
          </div>
          {subscription && (
            <Badge tone={getStatusBadgeTone(subscription.status)} className="px-3 py-1 text-xs">
              {currentStatusLabel}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {data?.quota && <p role="status" className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {data.quota.tier === "free" ? `Konto Free · wystawiono ${data.quota.used} z ${data.quota.limit} faktur w tym miesiącu` : "Konto Pro · bez limitu faktur"}
        </p>}
        {/* Baner informacyjny powrotu ze Stripe */}
        {bannerMessage && (
          <div
            role="status"
            className={cn(
              "flex items-start gap-3 rounded-xl border p-4 text-sm",
              bannerMessage.type === "success"
                ? "border-success/25 bg-success/5 text-success"
                : bannerMessage.type === "pending"
                  ? "border-primary/25 bg-primary/5 text-primary"
                  : "border-warning/25 bg-warning/5 text-warning"
            )}
          >
            {bannerMessage.type === "success" ? (
              <ShieldCheck className="h-5 w-5 shrink-0 text-success dark:text-success" />
            ) : bannerMessage.type === "pending" ? (
              <RefreshCw className="h-5 w-5 shrink-0 animate-spin" />
            ) : (
              <AlertCircle className="h-5 w-5 shrink-0 text-warning dark:text-warning" />
            )}
            <div className="flex-1">
              <p className="font-medium">{bannerMessage.text}</p>
              {billingParam === "success" && verificationExhausted && !isPro && <Button variant="outline" size="sm" className="mt-3" onClick={() => { void loadSubscription(); }} loading={loading}>Odśwież stan</Button>}
            </div>
          </div>
        )}

        {/* Komunikat błędu */}
        {error && (
          <div className="flex items-center gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Stan ładowania */}
        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Ładowanie danych subskrypcji…</span>
          </div>
        )}

        {!loading && data && (
          <>
            {/* SEKCJA 1: AKTYWNY PLAN PRO */}
            {subscription && isPro && (
              <div className="rounded-lg border border-border bg-muted/25 p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-success" />
                      <h4 className="font-semibold text-foreground">
                        {subscription.accessSource === "complimentary" ? "Dostęp Pro przyznany" : subscription.plan === "yearly" ? "Plan Roczny (Pro)" : "Plan Miesięczny (Pro)"}
                      </h4>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {subscription.accessSource === "complimentary" ? "Faktury bez limitu Free, bez opłat i automatycznego odnawiania." : "Posiadasz aktywną subskrypcję. Wystawiaj faktury bez limitu Free."}
                    </p>
                  </div>

                  {subscription.hasPortal && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleOpenCustomerPortal}
                      loading={portalLoading}
                      className="gap-2"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Zarządzaj w Stripe
                    </Button>
                  )}
                </div>

                <div className="grid gap-3 pt-2 text-xs sm:grid-cols-2 text-muted-foreground border-t border-border/50">
                  {subscription.currentPeriodEnd && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-foreground/70" />
                      <span>
                        Koniec bieżącego okresu:{" "}
                        <strong className="text-foreground">
                          {new Intl.DateTimeFormat("pl-PL", { dateStyle: "long" }).format(
                            new Date(subscription.currentPeriodEnd)
                          )}
                        </strong>
                      </span>
                    </div>
                  )}

                  {subscription.cancelAtPeriodEnd && (
                    <div className="flex items-center gap-2 text-warning dark:text-warning">
                      <AlertCircle className="h-4 w-4" />
                      <span>Subskrypcja zostanie zakończona po upływie bieżącego okresu.</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SEKCJA 2: WYBÓR PLANU DLA NIEAKTYWNYCH LUB DO ZMIANY */}
            {(!isPro || subscription?.status === "canceled") && (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  {SUBSCRIPTION_PLANS.map((plan) => {
                    const isSelected = selectedPlan === plan.id;
                    const isYearly = plan.id === "yearly";

                    return (
                      <div
                        key={plan.id}
                        onClick={() => setSelectedPlan(plan.id)}
                        className={cn(
                          "relative flex flex-col justify-between rounded-xl border p-5 cursor-pointer transition-all duration-200",
                          isSelected
                            ? "border-primary bg-primary/[0.03] shadow-sm ring-2 ring-primary/30"
                            : "border-border/70 hover:border-border hover:bg-muted/30"
                        )}
                      >
                        {plan.badge && (
                          <div className="absolute -top-2.5 right-4">
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-medium text-primary-foreground shadow-xs">
                              <Sparkles className="h-3 w-3" />
                              {plan.badge}
                            </span>
                          </div>
                        )}

                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-foreground">{plan.label}</span>
                            <div
                              className={cn(
                                "flex h-5 w-5 items-center justify-center rounded-full border transition-colors",
                                isSelected
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border/80"
                              )}
                            >
                              {isSelected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                            </div>
                          </div>

                          <div className="flex items-baseline gap-1">
                            <span className="text-3xl font-bold tracking-tight tabular-nums text-foreground">
                              {plan.amountPln} zł
                            </span>
                            <span className="text-sm text-muted-foreground">/ {plan.period}</span>
                          </div>

                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {isYearly ? "Jedna opłata za rok. Około 4,92 zł miesięcznie; oszczędzasz 25 zł wobec 12 opłat po 7 zł." : "Opłata co miesiąc. Możesz anulować automatyczne odnowienie."}
                          </p>
                        </div>

                        <ul className="mt-4 space-y-2 border-t border-border/50 pt-3 text-xs text-muted-foreground">
                          <li className="flex items-center gap-2">
                            <Check className="h-3.5 w-3.5 text-success" />
                            <span>Faktury bez limitu 5 miesięcznie z planu Free</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <Check className="h-3.5 w-3.5 text-success" />
                            <span>KSeF, PDF i pozostałe moduły jak w Free</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <Check className="h-3.5 w-3.5 text-success" />
                            <span>Integracje wymagają konfiguracji i uprawnień</span>
                          </li>
                          {isYearly && (
                            <li className="flex items-center gap-2 font-medium text-foreground">
                              <Check className="h-3.5 w-3.5 text-success" />
                              <span>25 zł oszczędności wobec 12 opłat miesięcznych</span>
                            </li>
                          )}
                        </ul>
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ShieldCheck className="h-4 w-4 text-success" />
                    <span>Bezpieczna płatność Stripe · Karty płatnicze, Apple Pay, Google Pay</span>
                  </div>

                  <Button
                    size="lg"
                    className="w-full sm:w-auto px-6 font-semibold"
                    onClick={() => handleStartCheckout(selectedPlan)}
                    loading={checkoutLoading}
                    disabled={billingParam === "success" && !verificationExhausted}
                  >
                    Aktywuj {selectedPlan === "yearly" ? "Plan Roczny (59 zł)" : "Plan Miesięczny (7 zł)"}
                  </Button>
                </div>
              </div>
            )}

            {/* SEKCJA ZARZĄDZANIA ISTNIEJĄCYM KLIENTEM PORTALU */}
            {!isPro && subscription?.hasPortal && (
              <div className="rounded-xl border border-border/60 bg-muted/20 p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                <span className="text-muted-foreground">
                  Posiadasz już profil klienta Stripe. Możesz przejrzeć historię płatności lub zmienić dane rozliczeniowe.
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenCustomerPortal}
                  loading={portalLoading}
                  className="gap-1.5"
                >
                  <ExternalLink className="h-3 w-3" />
                  Portal Klienta Stripe
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
