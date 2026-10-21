import { json } from "@/lib/api";
import { isSupportOperator } from "@/lib/server/support-operator";
import { productDb } from "@/lib/server/product-observability";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  if (!await isSupportOperator()) return json({ error: "Brak dostępu." }, { status: 403 });
  try {
    const reports = await (await productDb()).collection("SupportReport").find({ expiresAt: { $gt: new Date() } }, { projection: { _id: 0, userId: 0, requestId: 0 }, maxTimeMS: 2000 }).sort({ createdAt: -1 }).limit(50).toArray();
    return json({ reports });
  } catch { return json({ error: "Nie udało się wczytać zgłoszeń." }, { status: 503 }); }
}
