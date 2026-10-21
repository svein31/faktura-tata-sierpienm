import "server-only";
import { getApiSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { operatorNotifyTo } from "./product-observability";
/** New support-only access; existing company roles and business permissions are unchanged. */
export async function isSupportOperator() {
  const session = await getApiSessionUser();
  if (!session) return false;
  const user = await prisma.user.findUnique({ where: { id: session.id }, select: { email: true, emailVerifiedAt: true } });
  const expected = (process.env.SUPPORT_OPERATOR_EMAIL || operatorNotifyTo()).trim().toLowerCase();
  return Boolean(user?.emailVerifiedAt && user.email.trim().toLowerCase() === expected);
}
