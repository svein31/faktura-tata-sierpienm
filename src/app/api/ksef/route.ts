import { resolveKsefCompany } from "@/lib/ksef/company";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, cleanStr, handleApiError, json, readJson, str } from "@/lib/api";
import { ksefToDto } from "@/lib/dto";

export const runtime = "nodejs";

const ENVIRONMENTS = ["demo", "test", "production"] as const;

/**
 * PUT /api/ksef — ustawienia KSeF bieżącego użytkownika.
 */
export async function PUT(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const body = await readJson(req);

    const environmentRaw = str(body.environment);
    if (!ENVIRONMENTS.includes(environmentRaw as (typeof ENVIRONMENTS)[number])) {
      throw new ApiError(400, "Nieprawidłowe środowisko KSeF.");
    }
    const environment = environmentRaw as (typeof ENVIRONMENTS)[number];

    const existing = await prisma.ksefSettings.findUnique({ where: { userId: user.id } });

    let tokenSet = existing?.tokenSet ?? false;
    let tokenMask = existing?.tokenMask ?? "";

    // Opcjonalny token w body — zapisujemy maskę oraz aktualizujemy domyślny profil firmy
    if (typeof body.token === "string" && body.token.trim().length > 0) {
      const t = body.token.trim();
      if (t.length < 4) throw new ApiError(400, "Token musi mieć co najmniej 4 znaki.");
      tokenSet = true;
      tokenMask = `••••${t.slice(-4)}`;

      // Zapisz token w profilu firmy użytkownika
      const defaultProfile = await resolveKsefCompany(user.id, str(body.companyId));

      if (defaultProfile) {
        await prisma.companyProfile.update({
          where: { id: defaultProfile.id },
          data: { ksefToken: t },
        });
      }
    }

    const data = {
      environment,
      tokenSet,
      tokenMask,
      certName: cleanStr(body.certName, 200, "certName"),
      autoValidate: body.autoValidate === false ? false : true,
    };

    const ksef = await prisma.ksefSettings.upsert({
      where: { userId: user.id },
      update: data,
      create: { userId: user.id, ...data },
    });

    return json({ ksef: ksefToDto(ksef) });
  } catch (e) {
    return handleApiError(e);
  }
}
