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

    let session;
    try {
      session = await stripe.checkout.sessions.create(sessionParams);
    } catch (stripeErr: unknown) {
      const msg = stripeErr instanceof Error ? stripeErr.message : "";
      // Jeśli w bazie zapisany był stary/nieistniejący ID klienta Stripe, zresetuj go i ponów
      if (stripeCustomerId && msg.includes("No such customer")) {
        console.warn("[Stripe Checkout] Nieprawidłowy klient Stripe w bazie, ponawianie z nowym klientem...");
        await prisma.subscription.update({
          where: { userId: user.id },
          data: { stripeCustomerId: null },
        }).catch(() => undefined);
        delete sessionParams.customer;
        delete sessionParams.customer_update;
        sessionParams.customer_email = user.email;
        session = await stripe.checkout.sessions.create(sessionParams);
      } else {
        const errorMsg = stripeErr instanceof Error ? stripeErr.message : "Błąd komunikacji ze Stripe.";
        console.error("[Stripe Checkout Error]:", errorMsg, stripeErr);
        throw new ApiError(400, `Błąd Stripe: ${errorMsg}`);
      }
    }

    if (!session?.url) {
      throw new ApiError(500, "Nie udało się wygenerować adresu sesji płatności Stripe.");
    }

    return json({ url: session.url });
  } catch (error) {
    return handleApiError(error);
  }
}
