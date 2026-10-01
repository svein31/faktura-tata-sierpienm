import { parseOrderBody } from "@/lib/business-document-validation";
import { documentWhere, newDocumentCompany, scopedContractor } from "@/lib/document-scope";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson } from "@/lib/api";
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
    const data = parseOrderBody(body);
    data.number ||= `ZL/${new Date().getFullYear()}/${(orderCount + 1).toString().padStart(4, "0")}`;
    data.title ||= `Zlecenie ${data.number}`;
    const offerId = typeof body.offerId === "string" && body.offerId ? body.offerId : null;

    if (offerId && !await prisma.offer.findFirst({ where: { id: offerId, companyId, ...(!companyId ? { userId: user.id } : {}) } })) throw new ApiError(400, "Oferta nie należy do wybranej firmy.");
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        companyId,
        contractorId,
        contractorName: contractor.name,
        offerId,
        ...data,
      },
    });

    return json({ order: orderToDto(order) }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

