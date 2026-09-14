import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { handleApiError, json } from "@/lib/api";
import { companyProfileToDto } from "@/lib/dto";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/companies/[id]/set-default
 * Ustawia wskazaną firmę jako domyślną (oraz odznacza pozostałe).
 */
export async function PATCH(_req: Request, { params }: Ctx) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });
    }

    const existing = await prisma.companyProfile.findFirst({
      where: { id: (await params).id, userId: user.id },
    });
    if (!existing) {
      return json({ error: "Nie znaleziono profilu firmy.", code: "NOT_FOUND" }, { status: 404 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.companyProfile.updateMany({
        where: { userId: user.id },
        data: { isDefault: false },
      });

      return tx.companyProfile.update({
        where: { id: existing.id },
        data: { isDefault: true },
      });
    });

    return json({ success: true, company: companyProfileToDto(updated) });
  } catch (e) {
    return handleApiError(e);
  }
}
