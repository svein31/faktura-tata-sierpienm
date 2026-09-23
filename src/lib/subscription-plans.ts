/** Public plan description. Payment status is always sourced from the server. */
export const SUBSCRIPTION_PLANS = [
  {
    id: "monthly",
    label: "Plan Miesięczny",
    amountPln: 7,
    period: "miesiąc",
    description: "Idealny na start. Dostęp do wszystkich funkcji bez długoterminowych zobowiązań.",
    badge: null,
  },
  {
    id: "yearly",
    label: "Plan Roczny",
    amountPln: 59,
    period: "rok",
    description: "Tylko ~4,92 zł miesięcznie. Oszczędzasz niemal 30% w skali roku!",
    badge: "Najlepszy wybór · Oszczędzasz 30%",
  },
] as const;

export type SubscriptionPlan = typeof SUBSCRIPTION_PLANS[number]["id"];
export type SubscriptionStatus = "inactive" | "active" | "past_due" | "canceled" | "trialing" | "unpaid";

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  inactive: "Nieaktywna",
  active: "Aktywna",
  trialing: "Okres próbny",
  past_due: "Zaległa płatność",
  canceled: "Anulowana",
  unpaid: "Nieopłacona",
};

export function isSubscriptionStatusActive(status: string | null | undefined): boolean {
  return status === "active" || status === "trialing";
}

export function getPlanDetails(planId: string | null | undefined) {
  return SUBSCRIPTION_PLANS.find(p => p.id === planId) ?? null;
}
