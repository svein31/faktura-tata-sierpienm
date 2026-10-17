import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json } from "@/lib/api";
import { readAuthorizedOverview } from "@/lib/server/overview-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Scoped MongoDB grouping: only bounded actions, clients and summary buckets cross the API boundary. */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Nieautoryzowany.");
    return json(await readAuthorizedOverview(user, new URL(req.url).searchParams));
  } catch (error) { return handleApiError(error); }
}
