import { getApiSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json } from "@/lib/api";
import { readAuthorizedInvoiceSearch } from "@/lib/server/invoice-search-data";

export async function GET(req: Request) {
  try {
    const user = await getApiSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany.");
    return json(await readAuthorizedInvoiceSearch(user, new URL(req.url).searchParams));
  } catch (e) { return handleApiError(e); }
}
