import { assertAccountingPeriodsOpen } from "@/lib/accounting-period";
import { documentWhere, newDocumentCompany, scopedContractor } from "@/lib/document-scope";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { handleApiError, json, readJson } from "@/lib/api";
import { expenseToDto } from "@/lib/dto";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const expenses = await prisma.expense.findMany({
      where: await documentWhere(user.id, new URL(req.url).searchParams.get("companyId")),
      orderBy: { issueDate: "desc" },
    });

    return json({ expenses: expenses.map(expenseToDto) });
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
    const contractorName = String(body.contractorName || "").trim();
    if (!contractorName) {
      return json({ error: "Podaj nazwę sprzedawcy / wystawcy kosztu." }, { status: 400 });
    }

    const number = String(body.number || "").trim() || `KOSZT/${new Date().toISOString().slice(0, 10)}`;
    const nip = typeof body.nip === "string" && body.nip.trim() ? body.nip.trim() : null;
    const issueDate = String(body.issueDate || new Date().toISOString().slice(0, 10));
    const dueDate = typeof body.dueDate === "string" && body.dueDate.trim() ? body.dueDate.trim() : null;
    const category = String(body.category || "inne");
    const description = typeof body.description === "string" ? body.description.trim() : null;
    const totalGross = Number(body.totalGross) || 0;
    const totalNet = typeof body.totalNet === "number" ? body.totalNet : Math.round((totalGross / 1.23) * 100) / 100;
    const totalVat = typeof body.totalVat === "number" ? body.totalVat : Math.round((totalGross - totalNet) * 100) / 100;
    const currency = String(body.currency || "PLN").toUpperCase();
    const paymentStatus = body.paymentStatus === "paid" ? "paid" : "unpaid";
    const paidAt = paymentStatus === "paid" ? (typeof body.paidAt === "string" || typeof body.paidAt === "number" ? new Date(body.paidAt) : new Date()) : null;
    const attachmentUrl = typeof body.attachmentUrl === "string" ? body.attachmentUrl.trim() : null;
    const attachmentName = typeof body.attachmentName === "string" ? body.attachmentName.trim() : null;
    const workflowStatus = String(body.workflowStatus || "to_verify");

    const expense = await prisma.$transaction(async tx => {
    await assertAccountingPeriodsOpen(tx, [{ companyId, issueDate }]);
    return tx.expense.create({
      data: {
        userId: user.id,
        companyId,
        number,
        contractorName,
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
        attachmentUrl,
        attachmentName,
        workflowStatus,
        isKsefSource: false,
      },
    });
    });

    return json({ expense: expenseToDto(expense) }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
