import { documentWhere, newDocumentCompany, scopedContractor } from "@/lib/document-scope";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { handleApiError, json, readJson } from "@/lib/api";
import { orderToDto } from "@/lib/dto";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const orders = await prisma.order.findMany({
      where: await documentWhere(user.id, new URL(req.url).searchParams.get("companyId")),
      orderBy: { createdAt: "desc" },
    });

    return json({ orders: orders.map(orderToDto) });
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
      return json({ error: "Wybierz kontrahenta dla zlecenia." }, { status: 400 });
    }

    const contractor = await scopedContractor(user.id, contractorId, companyId);

    const orderCount = await prisma.order.count({ where: { userId: user.id } });
    const number = String(body.number || "").trim() || `ZL/${new Date().getFullYear()}/${(orderCount + 1).toString().padStart(4, "0")}`;
    const title = String(body.title || "").trim() || `Zlecenie ${number}`;
    const status = String(body.status || "in_progress");
    const currency = String(body.currency || "PLN").toUpperCase();
    const notes = typeof body.notes === "string" ? body.notes.trim() : null;
    const totalGross = typeof body.totalGross === "number" ? body.totalGross : (Number(body.totalAmount) || 0);
    const totalNet = typeof body.totalNet === "number" ? body.totalNet : Math.round((totalGross / 1.23) * 100) / 100;
    const trackedMinutes = typeof body.trackedMinutes === "number" ? body.trackedMinutes : ((Number(body.trackedHours) || 0) * 60);
    const hourlyRate = typeof body.hourlyRate === "number" ? body.hourlyRate : 0;
    const stages = Array.isArray(body.stages) ? body.stages : [];
    const offerId = typeof body.offerId === "string" && body.offerId ? body.offerId : null;

    const order = await prisma.order.create({
      data: {
        userId: user.id,
        companyId,
        contractorId,
        contractorName: contractor.name,
        offerId,
        number,
        title,
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

    return json({ order: orderToDto(order) }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

