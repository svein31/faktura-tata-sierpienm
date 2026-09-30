import { randomBytes } from "node:crypto";
import { validateOfferDates, offerAmounts, assertOfferVersion } from "@/lib/offer-validation";
import { documentWhere, requireDocumentWrite, scopedContractor } from "@/lib/document-scope";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { assertObjectId, ApiError, handleApiError, json, readJson } from "@/lib/api";
import { offerToDto } from "@/lib/dto";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const { id } = await params;
    assertObjectId(id);
    const offer = await prisma.offer.findFirst({
      where: { id, ...await documentWhere(user.id) },
    });

    if (!offer) return json({ error: "Oferta nie została znaleziona." }, { status: 404 });

    return json({ offer: offerToDto(offer) });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const { id } = await params;
    assertObjectId(id);
    const existing = await prisma.offer.findFirst({
      where: { id, ...await documentWhere(user.id) },
    });
    if (!existing) return json({ error: "Oferta nie została znaleziona." }, { status: 404 });
    await requireDocumentWrite(user, existing, "canIssueInvoices");

    const body = await readJson(req);
    const contractorId = body.contractorId ? String(body.contractorId).trim() : existing.contractorId;
    const contractor = await scopedContractor(user.id, contractorId || "", existing.companyId);
    const title = typeof body.title === "string" ? body.title.trim() : existing.title;
    const number = typeof body.number === "string" ? body.number.trim() : existing.number;
    const issueDate = typeof body.issueDate === "string" ? body.issueDate : existing.issueDate;
    const validUntil = typeof body.validUntil === "string" ? body.validUntil : existing.validUntil;
    const currency = typeof body.currency === "string" ? body.currency.toUpperCase() : existing.currency;
    const status = "draft";
    const notes = typeof body.notes === "string" ? body.notes.trim() : existing.notes;
    const lines = Array.isArray(body.lines) ? body.lines : (existing.lines as any[]);

    assertOfferVersion(existing.version, body.version);
    if (["accepted", "rejected", "converted"].includes(existing.status)) throw new ApiError(409, "Zapisana decyzja blokuje edycję tej wersji oferty. Utwórz nową ofertę.");
    validateOfferDates(issueDate, validUntil, currency);
    const amounts = offerAmounts(lines);
    const updated = await prisma.offer.update({
      where: { id, version: existing.version, status: existing.status },
      data: {
        contractorId,
        contractorName: contractor.name,
        title,
        number,
        issueDate,
        validUntil,
        currency,
        status,
        notes,
        ...amounts,
        contractorNip: contractor.nip,
        version: { increment: 1 },
        publicToken: randomBytes(32).toString("hex"),
      },
    });

    return json({ offer: offerToDto(updated) });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const { id } = await params;
    assertObjectId(id);
    const body = await readJson(req);
    const status = String(body.status || "").trim();

    const existing = await prisma.offer.findFirst({
      where: { id, ...await documentWhere(user.id) },
    });
    if (!existing) return json({ error: "Oferta nie została znaleziona." }, { status: 404 });
    await requireDocumentWrite(user, existing, "canIssueInvoices");

    assertOfferVersion(existing.version, body.version);
    if (!["draft", "sent", "expired"].includes(status) || ["accepted", "rejected", "converted"].includes(existing.status)) throw new ApiError(409, "Niedozwolona zmiana statusu oferty.");
    const updated = await prisma.offer.update({
      where: { id, version: existing.version, status: existing.status },
      data: { status, version: { increment: 1 }, ...(status === "draft" || status === "expired" ? { publicToken: randomBytes(32).toString("hex") } : {}) },
    });

    return json({ offer: offerToDto(updated) });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const { id } = await params;
    assertObjectId(id);
    const existing = await prisma.offer.findFirst({
      where: { id, ...await documentWhere(user.id) },
    });
    if (!existing) return json({ error: "Oferta nie została znaleziona." }, { status: 404 });
    await requireDocumentWrite(user, existing, "canIssueInvoices");

    if (["accepted", "rejected", "converted"].includes(existing.status)) throw new ApiError(409, "Nie można usunąć oferty z zapisaną decyzją lub rozliczeniem.");
    await prisma.offer.delete({ where: { id, version: existing.version, status: existing.status } });

    return json({ success: true, id });
  } catch (e) {
    return handleApiError(e);
  }
}

