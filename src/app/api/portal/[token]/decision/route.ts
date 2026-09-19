import { prisma } from "@/lib/db";
import { ApiError, cleanStr, handleApiError, json, readJson } from "@/lib/api";
import { assertOfferVersion, offerCanBeDecided } from "@/lib/offer-validation";
import { recordAuditLog } from "@/lib/audit";
import { offerToDto } from "@/lib/dto";
export const runtime = "nodejs";
export async function POST(req: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) throw new ApiError(404, "Nie znaleziono oferty.");
    const body = await readJson(req);
    if (body.decision !== "accepted" && body.decision !== "rejected") throw new ApiError(400, "Wybierz akceptację lub odrzucenie oferty.");
    const decision = body.decision;
    const name = cleanStr(body.name, 120, "imię i nazwisko");
    const note = cleanStr(body.note, 2000, "uwagi");
    if (!name) throw new ApiError(400, "Podaj imię i nazwisko osoby podejmującej decyzję.");
    const offer = await prisma.$transaction(async tx => {
      const existing = await tx.offer.findUnique({ where: { publicToken: token } });
      if (!existing) throw new ApiError(404, "Nie znaleziono oferty.");
      assertOfferVersion(existing.version, body.version);
      if (!offerCanBeDecided(existing)) throw new ApiError(409, "Oferta wygasła lub decyzja została już zapisana.");
      const updated = await tx.offer.update({ where: { id: existing.id, version: existing.version, status: "sent" }, data: { status: decision, acceptedAt: decision === "accepted" ? new Date() : null, rejectionReason: decision === "rejected" ? note : null, version: { increment: 1 } } });
      await recordAuditLog({ client: tx, companyId: existing.companyId, userName: name, action: `offer.${decision}`, entityType: "offer", entityId: existing.id, details: { version: existing.version, name, note, snapshot: { number: existing.number, title: existing.title, lines: existing.lines, currency: existing.currency, totalNet: existing.totalNet, totalVat: existing.totalVat, totalGross: existing.totalGross, validUntil: existing.validUntil } } });
      return updated;
    });
    return json({ offer: offerToDto(offer) });
  } catch (e) { return handleApiError(e); }
}
