import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { checkVies } from "@/lib/vies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const url = new URL(req.url);
    const vat = url.searchParams.get("vat") || "";
    const country = url.searchParams.get("country") || "";
    if (vat.length > 24 || country.length !== 2) throw new ApiError(400, "Nieprawidłowy numer VAT UE lub kraj.");
    if (!rateLimit(req, { windowMs: 60_000, max: 15 }).allowed) throw new ApiError(429, "Zbyt wiele zapytań. Spróbuj za minutę.");
    return json({ source: "VIES", checkedAt: new Date().toISOString(), ...await checkVies(vat, country) });
  } catch (error) { return handleApiError(error); }
}
