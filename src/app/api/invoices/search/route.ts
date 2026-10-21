import { getApiSessionUser } from "@/lib/auth";
import { ApiError, handleApiError } from "@/lib/api";
import { readAuthorizedInvoiceSearch } from "@/lib/server/invoice-search-data";
import { privateResponse } from "@/lib/server/private-response";

export async function GET(req: Request) {
  try {
    const user = await getApiSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany.");
    return privateResponse(req, await readAuthorizedInvoiceSearch(user, new URL(req.url).searchParams));
  } catch (e) { return handleApiError(e); }
}
