import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError } from "@/lib/api";
import { privateEtag, privateResponse } from "@/lib/server/private-response";
import { readAuthorizedOverview } from "@/lib/server/overview-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Scoped MongoDB grouping: only bounded actions, clients and summary buckets cross the API boundary. */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const data = await readAuthorizedOverview(user, new URL(req.url).searchParams);
    return privateResponse(req, data, privateEtag({ ...data, checkedAt: undefined }));
  } catch (error) { return handleApiError(error); }
}
