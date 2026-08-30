import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson } from "@/lib/api";
import { companyProfileToDto } from "@/lib/dto";
import { parseCompanyProfileBody } from "@/lib/parsers";

export const runtime = "nodejs";

/**
 * GET /api/companies
 * Pobiera listę wszystkich firm/spółek powiązanych z zalogowanym użytkownikiem.
 */
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });
    }

    const companies = await prisma.companyProfile.findMany({
      where: { userId: user.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });

    return json({ companies: companies.map(companyProfileToDto) });
  } catch (e) {
    return handleApiError(e);
  }
}

/**
 * POST /api/companies
 * Tworzy nowy profil firmy/spółki (z walidacją NIP i opcją domyślnej firmy).
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });
    }

    const body = await readJson(req);
    const data = parseCompanyProfileBody(body);

    // Sprawdzenie czy użytkownik nie ma już spółki o takim samym NIP
    const existingNip = await prisma.companyProfile.findFirst({
      where: { userId: user.id, nip: data.nip },
    });
    if (existingNip) {
      throw new ApiError(400, "Posiadasz już zapisany profil firmy z tym numerem NIP.");
    }

    // Liczba obecnych profili firmowych użytkownika
    const existingCount = await prisma.companyProfile.count({ where: { userId: user.id } });
    const shouldBeDefault = data.isDefault || existingCount === 0;

    let company;
    if (shouldBeDefault && existingCount > 0) {
      company = await prisma.$transaction(async (tx) => {
        await tx.companyProfile.updateMany({
          where: { userId: user.id },
          data: { isDefault: false },
        });
        return tx.companyProfile.create({
          data: {
            userId: user.id,
            ...data,
            isDefault: true,
          },
        });
      });
    } else {
      company = await prisma.companyProfile.create({
        data: {
          userId: user.id,
          ...data,
          isDefault: shouldBeDefault,
        },
      });
    }

    return json({ company: companyProfileToDto(company) }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
