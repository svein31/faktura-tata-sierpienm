import { parseOrderBody, orderStatus, orderMinutes, nonNegativeNumber } from "@/lib/business-document-validation";
import { documentWhere, requireDocumentWrite, scopedContractor } from "@/lib/document-scope";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { assertObjectId, ApiError, handleApiError, json, readJson } from "@/lib/api";
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
    assertObjectId(id);
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
    assertObjectId(id);
    const existing = await prisma.order.findFirst({
      where: { id, ...await documentWhere(user.id) },
    });
    if (!existing) return json({ error: "Zlecenie nie zostało znalezione." }, { status: 404 });
    await requireDocumentWrite(user, existing, "canIssueInvoices");

    const body = await readJson(req);
    const contractorId = body.contractorId ? String(body.contractorId).trim() : existing.contractorId;
    const contractor = await scopedContractor(user.id, contractorId || "", existing.companyId);
    if (existing.billedInvoiceId) throw new ApiError(409, "Rozliczone zlecenie nie podlega edycji.");
    const data = parseOrderBody(body, existing);
    if (!data.title || !data.number) throw new ApiError(400, "Podaj tytuł i numer zlecenia.");

    const updated = await prisma.order.update({
      where: { id, updatedAt: existing.updatedAt },
      data: {
        contractorId,
        contractorName: contractor.name,
        ...data,
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
    assertObjectId(id);
    const body = await readJson(req);

    const existing = await prisma.order.findFirst({
      where: { id, ...await documentWhere(user.id) },
    });
    if (!existing) return json({ error: "Zlecenie nie zostało znalezione." }, { status: 404 });
    await requireDocumentWrite(user, existing, "canIssueInvoices");

    if (existing.billedInvoiceId) throw new ApiError(409, "Rozliczone zlecenie nie podlega edycji.");
    const dataToUpdate: Record<string, any> = {};
    if ("status" in body) dataToUpdate.status = orderStatus(body.status);
    if ("trackedMinutes" in body) dataToUpdate.trackedMinutes = orderMinutes(body.trackedMinutes);
    else if ("trackedHours" in body) {
      const added = orderMinutes(nonNegativeNumber(body.trackedHours, "trackedHours", 1e7) * 60);
      dataToUpdate.trackedMinutes = { increment: added };
    }
    if ("stages" in body) dataToUpdate.stages = parseOrderBody({ stages: body.stages }, existing).stages;

    const updated = await prisma.order.update({
      where: { id, updatedAt: existing.updatedAt },
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
    assertObjectId(id);
    const existing = await prisma.order.findFirst({
      where: { id, ...await documentWhere(user.id) },
    });
    if (!existing) return json({ error: "Zlecenie nie zostało znalezione." }, { status: 404 });
    await requireDocumentWrite(user, existing, "canIssueInvoices");

    if (existing.billedInvoiceId) throw new ApiError(409, "Nie można usunąć zlecenia powiązanego z fakturą.");
    await prisma.order.delete({ where: { id, updatedAt: existing.updatedAt } });

    return json({ success: true, id });
  } catch (e) {
    return handleApiError(e);
  }
}

