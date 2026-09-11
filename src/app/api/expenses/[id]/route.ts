import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { handleApiError, json, readJson } from "@/lib/api";
import { expenseToDto, documentCommentToDto } from "@/lib/dto";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, context: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const { id } = await context.params;
    const expense = await prisma.expense.findFirst({
      where: { id, userId: user.id },
      include: {
        comments: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!expense) {
      return json({ error: "Nie znaleziono kosztu." }, { status: 404 });
    }

    return json({
      expense: expenseToDto(expense),
      comments: expense.comments.map(documentCommentToDto),
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: Request, context: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const { id } = await context.params;
    const existing = await prisma.expense.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      return json({ error: "Nie znaleziono kosztu." }, { status: 404 });
    }

    const body = await readJson(req);
    const contractorName = typeof body.contractorName === "string" && body.contractorName.trim() ? body.contractorName.trim() : existing.contractorName;
    const number = typeof body.number === "string" && body.number.trim() ? body.number.trim() : existing.number;
    const nip = typeof body.nip === "string" ? body.nip.trim() : existing.nip;
    const issueDate = typeof body.issueDate === "string" && body.issueDate.trim() ? body.issueDate.trim() : existing.issueDate;
    const dueDate = typeof body.dueDate === "string" ? body.dueDate.trim() : existing.dueDate;
    const category = typeof body.category === "string" ? body.category : existing.category;
    const description = typeof body.description === "string" ? body.description.trim() : existing.description;
    const totalGross = typeof body.totalGross === "number" ? body.totalGross : existing.totalGross;
    const totalNet = typeof body.totalNet === "number" ? body.totalNet : existing.totalNet;
    const totalVat = typeof body.totalVat === "number" ? body.totalVat : existing.totalVat;
    const currency = typeof body.currency === "string" ? body.currency.toUpperCase() : existing.currency;
    const paymentStatus = body.paymentStatus === "paid" ? "paid" : (body.paymentStatus === "unpaid" ? "unpaid" : existing.paymentStatus);
    const paidAt = paymentStatus === "paid"
      ? (typeof body.paidAt === "string" || typeof body.paidAt === "number" ? new Date(body.paidAt) : (existing.paidAt || new Date()))
      : null;
    const workflowStatus = typeof body.workflowStatus === "string" ? body.workflowStatus : existing.workflowStatus;
    const attachmentUrl = typeof body.attachmentUrl === "string" ? body.attachmentUrl.trim() : existing.attachmentUrl;
    const attachmentName = typeof body.attachmentName === "string" ? body.attachmentName.trim() : existing.attachmentName;

    const updated = await prisma.expense.update({
      where: { id },
      data: {
        contractorName,
        number,
        nip,
        issueDate,
        dueDate,
        category,
        description,
        totalNet,
        totalVat,
        totalGross,
        currency,
        paymentStatus,
        paidAt,
        workflowStatus,
        attachmentUrl,
        attachmentName,
      },
    });

    return json({ expense: expenseToDto(updated) });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const { id } = await context.params;
    const existing = await prisma.expense.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      return json({ error: "Nie znaleziono kosztu." }, { status: 404 });
    }

    const body = await readJson(req);
    const updateData: Record<string, unknown> = {};

    if (typeof body.workflowStatus === "string") {
      updateData.workflowStatus = body.workflowStatus;
    }

    if (typeof body.paymentStatus === "string") {
      updateData.paymentStatus = body.paymentStatus;
      if (body.paymentStatus === "paid") {
        updateData.paidAt = typeof body.paidAt === "string" || typeof body.paidAt === "number" ? new Date(body.paidAt) : new Date();
      } else {
        updateData.paidAt = null;
      }
    }

    if (typeof body.description === "string") {
      updateData.description = body.description.trim();
    }

    if (typeof body.category === "string") {
      updateData.category = body.category;
    }

    const updated = await prisma.expense.update({
      where: { id },
      data: updateData,
    });

    return json({ expense: expenseToDto(updated) });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(_req: Request, context: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const { id } = await context.params;
    const existing = await prisma.expense.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      return json({ error: "Nie znaleziono kosztu." }, { status: 404 });
    }

    await prisma.expense.delete({
      where: { id },
    });

    return json({ success: true });
  } catch (e) {
    return handleApiError(e);
  }
}
