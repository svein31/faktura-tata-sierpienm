import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { handleApiError, json, readJson } from "@/lib/api";
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
    const offer = await prisma.offer.findFirst({
      where: { id, userId: user.id },
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
    const existing = await prisma.offer.findFirst({
      where: { id, userId: user.id },
    });
    if (!existing) return json({ error: "Oferta nie została znaleziona." }, { status: 404 });

    const body = await readJson(req);
    const contractorId = body.contractorId ? String(body.contractorId).trim() : existing.contractorId;
    const title = typeof body.title === "string" ? body.title.trim() : existing.title;
    const number = typeof body.number === "string" ? body.number.trim() : existing.number;
    const issueDate = typeof body.issueDate === "string" ? body.issueDate : existing.issueDate;
    const validUntil = typeof body.validUntil === "string" ? body.validUntil : existing.validUntil;
    const currency = typeof body.currency === "string" ? body.currency.toUpperCase() : existing.currency;
    const status = typeof body.status === "string" ? body.status : existing.status;
    const notes = typeof body.notes === "string" ? body.notes.trim() : existing.notes;
    const lines = Array.isArray(body.lines) ? body.lines : (existing.lines as any[]);

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

    const updated = await prisma.offer.update({
      where: { id },
      data: {
        contractorId,
        title,
        number,
        issueDate,
        validUntil,
        currency,
        status,
        notes,
        lines,
        totalNet: Math.round(totalNet * 100) / 100,
        totalGross: Math.round(totalGross * 100) / 100,
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
    const body = await readJson(req);
    const status = String(body.status || "").trim();

    const existing = await prisma.offer.findFirst({
      where: { id, userId: user.id },
    });
    if (!existing) return json({ error: "Oferta nie została znaleziona." }, { status: 404 });

    const updated = await prisma.offer.update({
      where: { id },
      data: { status },
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
    const existing = await prisma.offer.findFirst({
      where: { id, userId: user.id },
    });
    if (!existing) return json({ error: "Oferta nie została znaleziona." }, { status: 404 });

    await prisma.offer.delete({ where: { id } });

    return json({ success: true, id });
  } catch (e) {
    return handleApiError(e);
  }
}
