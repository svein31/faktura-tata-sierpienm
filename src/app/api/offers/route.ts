import { validateOfferDates, offerAmounts } from "@/lib/offer-validation";
import { documentWhere, newDocumentCompany, scopedContractor } from "@/lib/document-scope";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { handleApiError, json, readJson } from "@/lib/api";
import { offerToDto } from "@/lib/dto";
import * as crypto from "crypto";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const offers = await prisma.offer.findMany({
      where: await documentWhere(user.id, new URL(req.url).searchParams.get("companyId")),
      orderBy: { createdAt: "desc" },
    });

    return json({ offers: offers.map(offerToDto) });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const body = await readJson(req);
    const companyId = await newDocumentCompany(user, body.companyId);
    const contractorId = String(body.contractorId || "").trim();
    if (!contractorId) {
      return json({ error: "Wybierz kontrahenta dla oferty." }, { status: 400 });
    }

    const contractor = await scopedContractor(user.id, contractorId, companyId);

    const number = String(body.number || "").trim() || `OF/${new Date().getFullYear()}/${Date.now().toString().slice(-4)}`;
    const title = String(body.title || "").trim() || `Oferta handlowa ${number}`;
    const issueDate = String(body.issueDate || new Date().toISOString().slice(0, 10));
    const validUntil = String(body.validUntil || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
    const currency = String(body.currency || "PLN").toUpperCase();
    const status = "draft";
    const notes = typeof body.notes === "string" ? body.notes.trim() : null;
    const lines = Array.isArray(body.lines) ? body.lines : [];

    validateOfferDates(issueDate, validUntil, currency);
    const amounts = offerAmounts(lines);
    const publicToken = crypto.randomBytes(32).toString("hex");

    const offer = await prisma.offer.create({
      data: {
        userId: user.id,
        companyId,
        contractorId,
        contractorName: contractor.name,
        contractorNip: contractor.nip,
        number,
        title,
        status,
        issueDate,
        validUntil,
        currency,
        ...amounts,
        notes,
        publicToken,
      },
    });

    return json({ offer: offerToDto(offer) }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

