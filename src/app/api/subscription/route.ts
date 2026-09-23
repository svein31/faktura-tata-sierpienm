import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json } from "@/lib/api";
import { prisma } from "@/lib/db";
import {
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_STATUS_LABELS,
  isSubscriptionStatusActive,
  type SubscriptionPlan,
  type SubscriptionStatus,
} from "@/lib/subscription-plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Nieautoryzowany.");

    const record = await prisma.subscription.findUnique({
      where: { userId: user.id },
      select: {
        plan: true,
        status: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        stripeCustomerId: true,
      },
    });

    const rawStatus = record?.status;
    const status: SubscriptionStatus =
      rawStatus && rawStatus in SUBSCRIPTION_STATUS_LABELS
        ? (rawStatus as SubscriptionStatus)
        : "inactive";

    const plan: SubscriptionPlan | null =
      SUBSCRIPTION_PLANS.find((item) => item.id === record?.plan)?.id ?? null;

    const isPro =
      isSubscriptionStatusActive(status) &&
      (!record?.currentPeriodEnd || record.currentPeriodEnd.getTime() > Date.now());

    return json({
      plans: SUBSCRIPTION_PLANS,
      subscription: {
        plan,
        status,
        currentPeriodEnd: record?.currentPeriodEnd?.toISOString() ?? null,
        cancelAtPeriodEnd: record?.cancelAtPeriodEnd ?? false,
        hasPortal: Boolean(record?.stripeCustomerId),
        isPro,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
