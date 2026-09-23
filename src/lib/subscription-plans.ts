/** Public plan description. Payment status is always sourced from the server. */
export const SUBSCRIPTION_PLANS = [
  { id: "monthly", label: "Miesięczny", amountPln: 7, period: "miesiąc" },
  { id: "yearly", label: "Roczny", amountPln: 59, period: "rok" },
] as const;

export type SubscriptionPlan = typeof SUBSCRIPTION_PLANS[number]["id"];
export type SubscriptionStatus = "inactive" | "active" | "past_due" | "canceled";

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  inactive: "Nieaktywna",
  active: "Aktywna",
  past_due: "Zaległa płatność",
  canceled: "Anulowana",
};
