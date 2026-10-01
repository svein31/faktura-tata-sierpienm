import { parseExpenseBody } from "@/lib/business-document-validation";
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
    const data = parseExpenseBody(body);

    const expense = await prisma.$transaction(async tx => {
    await assertAccountingPeriodsOpen(tx, [{ companyId, issueDate: data.issueDate }]);
    return tx.expense.create({
      data: {
        userId: user.id,
        companyId,
        ...data,
        isKsefSource: false,
      },
    });
    });

    return json({ expense: expenseToDto(expense) }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
