import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getStripe, getAppBaseUrl } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Musisz być zalogowany, aby zarządzać subskrypcją.");

    const subscription = await prisma.subscription.findUnique({
      where: { userId: user.id },
      select: { stripeCustomerId: true },
    });

    if (!subscription?.stripeCustomerId) {
      throw new ApiError(
        400,
        "Nie znaleziono powiązanego profilu klienta Stripe. Wybierz plan i dokonaj pierwszej opłaty, aby aktywować portal."
      );
    }

    const stripe = getStripe();
    const baseUrl = getAppBaseUrl(req);

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${baseUrl}/settings/account`,
    });

    if (!portalSession.url) {
      throw new ApiError(500, "Nie udało się utworzyć sesji portalu klienta Stripe.");
    }

    return json({ url: portalSession.url });
  } catch (error) {
    return handleApiError(error);
  }
}
