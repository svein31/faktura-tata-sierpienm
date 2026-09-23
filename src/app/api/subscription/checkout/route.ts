import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getStripe, getPriceIdForPlan, getAppBaseUrl } from "@/lib/stripe";
import type { SubscriptionPlan } from "@/lib/subscription-plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Musisz być zalogowany, aby wybrać plan.");

    const body = await readJson(req);
    const plan = body.plan as SubscriptionPlan;

    if (plan !== "monthly" && plan !== "yearly") {
      throw new ApiError(400, "Nieprawidłowy plan subskrypcji. Wybierz 'monthly' lub 'yearly'.");
    }

    const priceId = getPriceIdForPlan(plan);
    const stripe = getStripe();
    const baseUrl = getAppBaseUrl(req);

    // Sprawdź czy użytkownik posiada już powiązanego klienta w Stripe
    const existingSub = await prisma.subscription.findUnique({
      where: { userId: user.id },
      select: { stripeCustomerId: true },
    });

    const stripeCustomerId = existingSub?.stripeCustomerId;

    const sessionParams: Parameters<typeof stripe.checkout.sessions.create>[0] = {
      mode: "subscription",
      payment_method_types: ["card", "blik"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      client_reference_id: user.id,
      metadata: {
        userId: user.id,
        plan,
      },
      subscription_data: {
        metadata: {
          userId: user.id,
          plan,
        },
      },
      success_url: `${baseUrl}/settings/account?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/settings/account?billing=cancel`,
      locale: "pl",
      allow_promotion_codes: true,
    };

    if (stripeCustomerId) {
      sessionParams.customer = stripeCustomerId;
      sessionParams.customer_update = {
        address: "auto",
        name: "auto",
      };
    } else {
      sessionParams.customer_email = user.email;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    if (!session.url) {
      throw new ApiError(500, "Nie udało się wygenerować adresu sesji płatności Stripe.");
    }

    return json({ url: session.url });
  } catch (error) {
    return handleApiError(error);
  }
}
