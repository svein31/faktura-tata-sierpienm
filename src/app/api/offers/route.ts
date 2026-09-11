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
      where: { userId: user.id },
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
    const contractorId = String(body.contractorId || "").trim();
    if (!contractorId) {
      return json({ error: "Wybierz kontrahenta dla oferty." }, { status: 400 });
    }

    const contractor = await prisma.contractor.findFirst({
      where: { id: contractorId, userId: user.id },
    });
    if (!contractor) {
      return json({ error: "Wybrany kontrahent nie należy do Twojego konta." }, { status: 400 });
    }

    const number = String(body.number || "").trim() || `OF/${new Date().getFullYear()}/${Date.now().toString().slice(-4)}`;
    const title = String(body.title || "").trim() || `Oferta handlowa ${number}`;
    const issueDate = String(body.issueDate || new Date().toISOString().slice(0, 10));
    const validUntil = String(body.validUntil || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
    const currency = String(body.currency || "PLN").toUpperCase();
    const status = String(body.status || "draft");
    const notes = typeof body.notes === "string" ? body.notes.trim() : null;
    const lines = Array.isArray(body.lines) ? body.lines : [];

    let totalNet = 0;
    let totalGross = 0;
    for (const l of lines) {
      const q = Number(l.quantity) || 1;
      const p = Number(l.netPrice) || 0;
      const net = q * p;
      const vatRateNum = parseFloat(String(l.vatRate || "23").replace(/%/g, "")) || 23;
      const vat = (net * vatRateNum) / 100;
      totalNet += net;
      totalGross += net + vat;
    }

    const publicToken = String(body.publicToken || crypto.randomBytes(16).toString("hex"));

    const offer = await prisma.offer.create({
      data: {
        userId: user.id,
        contractorId,
        contractorName: contractor.name,
        contractorNip: contractor.nip,
        number,
        title,
        status,
        issueDate,
        validUntil,
        currency,
        lines,
        totalNet: Math.round(totalNet * 100) / 100,
        totalVat: Math.round((totalGross - totalNet) * 100) / 100,
        totalGross: Math.round(totalGross * 100) / 100,
        notes,
        publicToken,
      },
    });

    return json({ offer: offerToDto(offer) }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
