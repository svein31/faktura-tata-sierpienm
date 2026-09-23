import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json } from "@/lib/api";
import { prisma } from "@/lib/db";
import { SUBSCRIPTION_PLANS, SUBSCRIPTION_STATUS_LABELS, type SubscriptionPlan, type SubscriptionStatus } from "@/lib/subscription-plans";
import { currentInvoiceQuota } from "@/lib/invoice-quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const record = await prisma.subscription.findUnique({ where: { userId: user.id }, select: { plan: true, status: true, currentPeriodEnd: true } });
    const status: SubscriptionStatus = record?.status && record.status in SUBSCRIPTION_STATUS_LABELS ? record.status as SubscriptionStatus : "inactive";
    const plan: SubscriptionPlan | null = SUBSCRIPTION_PLANS.find(item => item.id === record?.plan)?.id ?? null;
    const quota = await currentInvoiceQuota(user.id);
    return json({ plans: SUBSCRIPTION_PLANS, quota, subscription: {
      plan, status, currentPeriodEnd: record?.currentPeriodEnd?.toISOString() ?? null,
    } });
  } catch (error) { return handleApiError(error); }
}
