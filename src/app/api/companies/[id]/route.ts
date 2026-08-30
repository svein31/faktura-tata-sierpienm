import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson } from "@/lib/api";
import { companyProfileToDto } from "@/lib/dto";
import { parseCompanyProfileBody } from "@/lib/parsers";

export const runtime = "nodejs";

type Ctx = { params: { id: string } };

/**
 * GET /api/companies/[id]
 * Pobiera szczegóły profilu firmy (tylko własny rekord).
 */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });
    }

    const company = await prisma.companyProfile.findFirst({
      where: { id: params.id, userId: user.id },
    });
    if (!company) {
      return json({ error: "Nie znaleziono profilu firmy.", code: "NOT_FOUND" }, { status: 404 });
    }

    return json({ company: companyProfileToDto(company) });
  } catch (e) {
    return handleApiError(e);
  }
}

/**
 * PUT /api/companies/[id]
 * Aktualizuje dane firmy (NIP, adres, nr konta, token KSeF, status domyślnej).
 */
export async function PUT(req: Request, { params }: Ctx) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });
    }

    const existing = await prisma.companyProfile.findFirst({
      where: { id: params.id, userId: user.id },
    });
    if (!existing) {
      return json({ error: "Nie znaleziono profilu firmy.", code: "NOT_FOUND" }, { status: 404 });
    }

    const body = await readJson(req);
    const data = parseCompanyProfileBody(body);

    // Sprawdzenie czy NIP nie koliduje z inną firmą tego użytkownika
    if (data.nip !== existing.nip) {
      const duplicateNip = await prisma.companyProfile.findFirst({
        where: {
          userId: user.id,
          nip: data.nip,
          id: { not: existing.id },
        },
      });
      if (duplicateNip) {
        throw new ApiError(400, "Posiadasz już inny profil firmy z tym numerem NIP.");
      }
    }

    let updated;
    if (data.isDefault && !existing.isDefault) {
      updated = await prisma.$transaction(async (tx) => {
        await tx.companyProfile.updateMany({
          where: { userId: user.id },
          data: { isDefault: false },
        });
        return tx.companyProfile.update({
          where: { id: existing.id },
          data: {
            ...data,
            isDefault: true,
          },
        });
      });
    } else {
      updated = await prisma.companyProfile.update({
        where: { id: existing.id },
        data,
      });
    }

    return json({ company: companyProfileToDto(updated) });
  } catch (e) {
    return handleApiError(e);
  }
}

/**
 * DELETE /api/companies/[id]
 * Usuwa profil firmy (jeśli nie ma powiązanych wystawionych faktur).
 */
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });
    }

    const existing = await prisma.companyProfile.findFirst({
      where: { id: params.id, userId: user.id },
    });
    if (!existing) {
      return json({ error: "Nie znaleziono profilu firmy.", code: "NOT_FOUND" }, { status: 404 });
    }

    // Bezpieczeństwo relacji: sprawdzenie powiązanych faktur
    const linkedInvoicesCount = await prisma.invoice.count({
      where: { sellerCompanyId: existing.id },
    });
    if (linkedInvoicesCount > 0) {
      throw new ApiError(
        400,
        `Nie można usunąć profilu firmy (${existing.companyName}), ponieważ wystawiono z niego ${linkedInvoicesCount} faktur(y).`
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.companyProfile.delete({ where: { id: existing.id } });

      // Jeśli usunięta firma była domyślna, ustaw kolejną jako domyślną
      if (existing.isDefault) {
        const remaining = await tx.companyProfile.findFirst({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
        });
        if (remaining) {
          await tx.companyProfile.update({
            where: { id: remaining.id },
            data: { isDefault: true },
          });
        }
      }
    });

    return json({ success: true });
  } catch (e) {
    return handleApiError(e);
  }
}
