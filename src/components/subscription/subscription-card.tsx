"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SUBSCRIPTION_STATUS_LABELS, type SubscriptionPlan, type SubscriptionStatus } from "@/lib/subscription-plans";

type Plan = { id: SubscriptionPlan; label: string; amountPln: number; period: string };
type BillingData = {
  plans: Plan[];
  quota: { tier: "free" | "pro"; used: number; limit: number | null; remaining: number | null };
  subscription: { plan: SubscriptionPlan | null; status: SubscriptionStatus; currentPeriodEnd: string | null };
};

export function SubscriptionCard() {
  const [data, setData] = React.useState<BillingData | null>(null);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    const controller = new AbortController();
    fetch("/api/subscription", { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Nie można pobrać danych planu.");
        return result as BillingData;
      })
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Nie można pobrać danych planu."); });
    return () => controller.abort();
  }, []);

  const subscription = data?.subscription;
  return (
    <Card className="max-w-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          Plan aplikacji
          {subscription && <Badge tone={subscription.status === "active" ? "success" : subscription.status === "past_due" ? "warning" : "outline"}>
            {data?.quota.tier === "pro" ? "Pro" : "Free"} · {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
          </Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!data && !error && <p role="status" className="text-muted-foreground">Wczytywanie planu…</p>}
        {error && <p role="alert" className="text-destructive">{error}</p>}
        {data && <>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.plans.map(plan => <div key={plan.id} className="flex items-center justify-between rounded-lg border border-border/70 px-3 py-2">
              <span>{plan.label}{subscription?.plan === plan.id && <span className="ml-1 text-xs text-muted-foreground">· obecny</span>}</span>
              <strong className="tabular-nums">{plan.amountPln} zł / {plan.period}</strong>
            </div>)}
          </div>
          {subscription?.currentPeriodEnd && <p className="text-xs text-muted-foreground">
            Koniec bieżącego okresu: {new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium" }).format(new Date(subscription.currentPeriodEnd))}
          </p>}
          <p className="text-xs text-muted-foreground">{data.quota.tier === "free"
            ? `W tym miesiącu wystawiono ${data.quota.used} z ${data.quota.limit} faktur. Zostało ${data.quota.remaining}.`
            : "Faktury bez limitu miesięcznego."}</p>
          <p className="text-xs text-muted-foreground">
            Oba plany obejmują ten sam zakres funkcji. Informacje o planach są obecnie poglądowe; wybór i płatności nie są uruchomione.
          </p>
        </>}
      </CardContent>
    </Card>
  );
}
