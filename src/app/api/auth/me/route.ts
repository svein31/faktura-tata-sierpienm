import { getSessionUser, toPublicUser } from "@/lib/auth";
import { json } from "@/lib/api";

export const runtime = "nodejs";

/** GET /api/auth/me — bieżący użytkownik (lub 401). */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });
  }
  return json({ user: toPublicUser(user) });
}
