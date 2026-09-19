import { documentWhere, requireDocumentWrite, scopedContractor } from "@/lib/document-scope";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { handleApiError, json, readJson } from "@/lib/api";
import { orderToDto } from "@/lib/dto";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const { id } = await params;
    const order = await prisma.order.findFirst({
      where: { id, ...await documentWhere(user.id) },
    });

    if (!order) return json({ error: "Zlecenie nie zostało znalezione." }, { status: 404 });

    return json({ order: orderToDto(order) });
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
    const existing = await prisma.order.findFirst({
      where: { id, ...await documentWhere(user.id) },
    });
    if (!existing) return json({ error: "Zlecenie nie zostało znalezione." }, { status: 404 });
    await requireDocumentWrite(user, existing, "canIssueInvoices");

    const body = await readJson(req);
    const contractorId = body.contractorId ? String(body.contractorId).trim() : existing.contractorId;
    const contractor = await scopedContractor(user.id, contractorId || "", existing.companyId);
    const title = typeof body.title === "string" ? body.title.trim() : existing.title;
    const number = typeof body.number === "string" ? body.number.trim() : existing.number;
    const status = typeof body.status === "string" ? body.status : existing.status;
    const currency = typeof body.currency === "string" ? body.currency.toUpperCase() : existing.currency;
    const totalGross = typeof body.totalGross === "number" ? body.totalGross : (Number(body.totalAmount) || existing.totalGross);
    const totalNet = typeof body.totalNet === "number" ? body.totalNet : Math.round((totalGross / 1.23) * 100) / 100;
    const trackedMinutes = typeof body.trackedMinutes === "number" ? body.trackedMinutes : (typeof body.trackedHours === "number" ? body.trackedHours * 60 : existing.trackedMinutes);
    const hourlyRate = typeof body.hourlyRate === "number" ? body.hourlyRate : existing.hourlyRate;
    const stages = Array.isArray(body.stages) ? body.stages : (existing.stages as any);
    const notes = typeof body.notes === "string" ? body.notes.trim() : existing.notes;

    const updated = await prisma.order.update({
      where: { id },
      data: {
        contractorId,
        contractorName: contractor.name,
        title,
        number,
        status,
        stages,
        hourlyRate,
        trackedMinutes,
        currency,
        totalNet,
        totalGross,
        notes,
      },
    });

    return json({ order: orderToDto(updated) });
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

    const existing = await prisma.order.findFirst({
      where: { id, ...await documentWhere(user.id) },
    });
    if (!existing) return json({ error: "Zlecenie nie zostało znalezione." }, { status: 404 });
    await requireDocumentWrite(user, existing, "canIssueInvoices");

    const dataToUpdate: any = {};
    if (typeof body.status === "string") dataToUpdate.status = body.status;
    if (typeof body.trackedMinutes === "number") dataToUpdate.trackedMinutes = body.trackedMinutes;
    else if (typeof body.trackedHours === "number") dataToUpdate.trackedMinutes = (existing.trackedMinutes || 0) + body.trackedHours * 60;
    if (Array.isArray(body.stages)) dataToUpdate.stages = body.stages;

    const updated = await prisma.order.update({
      where: { id },
      data: dataToUpdate,
    });

    return json({ order: orderToDto(updated) });
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
    const existing = await prisma.order.findFirst({
      where: { id, ...await documentWhere(user.id) },
    });
    if (!existing) return json({ error: "Zlecenie nie zostało znalezione." }, { status: 404 });
    await requireDocumentWrite(user, existing, "canIssueInvoices");

    await prisma.order.delete({ where: { id } });

    return json({ success: true, id });
  } catch (e) {
    return handleApiError(e);
  }
}

