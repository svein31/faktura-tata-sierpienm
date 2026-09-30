import { parseExpenseBody, expensePaymentFields, expenseWorkflow } from "@/lib/business-document-validation";
import { assertAccountingPeriodsOpen } from "@/lib/accounting-period";
import { documentWhere, requireDocumentWrite, scopedContractor } from "@/lib/document-scope";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { assertObjectId, ApiError, handleApiError, json, readJson } from "@/lib/api";
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
    assertObjectId(id);
    const expense = await prisma.expense.findFirst({
      where: { id, ...await documentWhere(user.id) },
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
    assertObjectId(id);
    const existing = await prisma.expense.findFirst({
      where: { id, ...await documentWhere(user.id) },
    });

    if (!existing) {
      return json({ error: "Nie znaleziono kosztu." }, { status: 404 });
    }
    await requireDocumentWrite(user, existing, "canIssueInvoices");
    if (existing.costReviewId) throw new ApiError(409, "Koszt jest w obiegu akceptacji. Oryginał nie podlega edycji.");
    if (existing.scanId || existing.isKsefSource) throw new ApiError(403, "Dokument źródłowy jest niezmienny. Dostępny jest podgląd i akceptacja.");

    const body = await readJson(req);
    const data = parseExpenseBody(body, existing);

    const updated = await prisma.$transaction(async tx => {
    await assertAccountingPeriodsOpen(tx, [
      { companyId: existing.companyId, issueDate: existing.issueDate },
      { companyId: existing.companyId, issueDate: data.issueDate },
    ]);
    return tx.expense.update({
      where: { id, updatedAt: existing.updatedAt, OR: [{ costReviewId: null }, { costReviewId: { isSet: false } }] },
      data: {
        ...data,
      },
    });
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
    assertObjectId(id);
    const existing = await prisma.expense.findFirst({
      where: { id, ...await documentWhere(user.id) },
    });

    if (!existing) {
      return json({ error: "Nie znaleziono kosztu." }, { status: 404 });
    }
    const body = await readJson(req);
    if (existing.costReviewId && "workflowStatus" in body) throw new ApiError(409, "Status kosztu zmienia się w obiegu akceptacji.");
    if ("paymentStatus" in body) await requireDocumentWrite(user, existing, "canRecordPayments");
    if ("workflowStatus" in body || "category" in body || "description" in body) await requireDocumentWrite(user, existing, "canExport");
    if (typeof body.workflowStatus === "string" && !["to_verify", "verified", "sent_to_accountant"].includes(body.workflowStatus)) throw new ApiError(400, "Nieprawidłowy status weryfikacji.");
    const updateData: Record<string, unknown> = {};

    if (typeof body.workflowStatus === "string") {
      updateData.workflowStatus = expenseWorkflow(body.workflowStatus);
    }

    if ("paymentStatus" in body || "paidAt" in body) {
      await requireDocumentWrite(user, existing, "canRecordPayments");
      Object.assign(updateData, expensePaymentFields(body, existing));
    }

    if (typeof body.description === "string") {
      updateData.description = body.description.trim();
    }

    if (typeof body.category === "string") {
      updateData.category = body.category;
    }

    const updated = await prisma.$transaction(async tx => {
    if (["workflowStatus", "category", "description"].some(key => key in body)) {
      await assertAccountingPeriodsOpen(tx, [{ companyId: existing.companyId, issueDate: existing.issueDate }]);
    }
    return tx.expense.update({
      where: { id, updatedAt: existing.updatedAt, ...("workflowStatus" in body ? { OR: [{ costReviewId: null }, { costReviewId: { isSet: false } }] } : {}) },
      data: updateData,
    });
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
    assertObjectId(id);
    const existing = await prisma.expense.findFirst({
      where: { id, ...await documentWhere(user.id) },
    });

    if (!existing) {
      return json({ error: "Nie znaleziono kosztu." }, { status: 404 });
    }
    await requireDocumentWrite(user, existing, "canIssueInvoices");
    if (existing.costReviewId) throw new ApiError(409, "Koszt w obiegu nie może być usunięty.");
    if (existing.scanId || existing.isKsefSource) throw new ApiError(403, "Dokument źródłowy jest niezmienny. Dostępny jest podgląd i akceptacja.");

    await prisma.$transaction(async tx => {
    await assertAccountingPeriodsOpen(tx, [{ companyId: existing.companyId, issueDate: existing.issueDate }]);
    await tx.expense.delete({
      where: { id, updatedAt: existing.updatedAt, OR: [{ costReviewId: null }, { costReviewId: { isSet: false } }] },
    });
    });

    return json({ success: true });
  } catch (e) {
    return handleApiError(e);
  }
}
