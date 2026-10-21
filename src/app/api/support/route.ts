import { after } from "next/server";
import { getApiSessionUser } from "@/lib/auth";
import { json } from "@/lib/api";
import { isUnsafeCrossOrigin } from "@/lib/csrf";
import { rateLimitSubject } from "@/lib/rate-limit";
import { boundedJson, normalizeSupport } from "@/lib/product-diagnostics";
import { notifySupport, productDb, saveSupportReport } from "@/lib/server/product-observability";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  if (isUnsafeCrossOrigin(req)) return json({ error: "Odśwież stronę i spróbuj ponownie." }, { status: 403 });
  const user = await getApiSessionUser(); if (!user) return json({ error: "Zaloguj się, aby wysłać zgłoszenie." }, { status: 401 });
  let input; try { input = normalizeSupport(await boundedJson(req, 10000)); } catch { return json({ error: "Zgłoszenie jest nieprawidłowe lub zbyt długie." }, { status: 400 }); }
  if (!input) return json({ error: "Opisz problem w 10–2000 znakach." }, { status: 400 });
  try {
    const limit = await rateLimitSubject(user.id, { max: 10, windowMs: 3600000 }, "support-report");
    if (!limit.allowed) return json({ error: "Wysłano już kilka zgłoszeń. Spróbuj później." }, { status: 429 });
    const ticket = await saveSupportReport(user.id, input);
    after(() => notifySupport(ticket.reference).catch(() => {}));
    return json({ ...ticket, message: "Zgłoszenie zapisane. Zachowaj jego numer." }, { status: 201 });
  } catch { return json({ error: "Nie udało się potwierdzić zapisu. Zachowaj opis i spróbuj ponownie." }, { status: 503 }); }
}
export async function GET() {
  const user = await getApiSessionUser(); if (!user) return json({ error: "Zaloguj się." }, { status: 401 });
  try {
    const rows = await (await productDb()).collection("SupportReport").find({ userId: user.id, expiresAt: { $gt: new Date() } }, { projection: { _id: 0, reference: 1, category: 1, createdAt: 1, status: 1 }, maxTimeMS: 2000 }).sort({ createdAt: -1 }).limit(10).toArray();
    return json({ reports: rows });
  } catch { return json({ error: "Nie udało się wczytać zgłoszeń." }, { status: 503 }); }
}
