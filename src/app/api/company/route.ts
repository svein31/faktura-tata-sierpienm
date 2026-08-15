import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, cleanStr, handleApiError, json, readJson } from "@/lib/api";
import { companyToDto } from "@/lib/dto";

export const runtime = "nodejs";

/** PUT /api/company — aktualizacja profilu firmy (sprzedawcy) bieżącego użytkownika. */
export async function PUT(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const body = await readJson(req);
    const data = {
      name: cleanStr(body.name, 200, "name"),
      nip: cleanStr(body.nip, 20, "nip"),
      regon: cleanStr(body.regon, 20, "regon"),
      street: cleanStr(body.street, 200, "street"),
      city: cleanStr(body.city, 100, "city"),
      postal: cleanStr(body.postal, 20, "postal"),
      country: cleanStr(body.country, 10, "country") || "PL",
      iban: cleanStr(body.iban, 60, "iban"),
      bankName: cleanStr(body.bankName, 200, "bankName"),
      email: cleanStr(body.email, 200, "email"),
      phone: cleanStr(body.phone, 50, "phone"),
    };

    const company = await prisma.companySettings.upsert({
      where: { userId: user.id },
      update: data,
      create: { userId: user.id, ...data },
    });

    return json({ company: companyToDto(company) });
  } catch (e) {
    if (e instanceof ApiError) return handleApiError(e);
    return handleApiError(e);
  }
}
