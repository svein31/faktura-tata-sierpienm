import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { handleApiError, json } from "@/lib/api";
import { invoiceToDto, expenseToDto } from "@/lib/dto";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const url = new URL(req.url);
    const yearMonth = url.searchParams.get("month") || new Date().toISOString().slice(0, 7); // e.g. "2026-03"

    // 1. Faktury sprzedaży
    const invoices = await prisma.invoice.findMany({
      where: {
        userId: user.id,
        issueDate: {
          startsWith: yearMonth,
        },
      },
      orderBy: { issueDate: "asc" },
    });

    // 2. Dokumenty kosztowe
    const expenses = await prisma.expense.findMany({
      where: {
        userId: user.id,
        issueDate: {
          startsWith: yearMonth,
        },
      },
      orderBy: { issueDate: "asc" },
    });

    // 3. Obliczenia dla księgowości
    let salesNet = 0;
    let salesVat = 0;
    let salesGross = 0;

    invoices.forEach((inv) => {
      salesNet += inv.totalNet || 0;
      salesVat += inv.totalVat || 0;
      salesGross += inv.totalGross || 0;
    });

    let expenseNet = 0;
    let expenseVat = 0;
    let expenseGross = 0;

    expenses.forEach((exp) => {
      expenseNet += exp.totalNet;
      expenseVat += exp.totalVat;
      expenseGross += exp.totalGross;
    });

    const vatBalance = Math.round((salesVat - expenseVat) * 100) / 100;
    const incomeBeforeTax = Math.round((salesNet - expenseNet) * 100) / 100;

    return json({
      period: yearMonth,
      summary: {
        salesCount: invoices.length,
        salesNet,
        salesVat,
        salesGross,
        expenseCount: expenses.length,
        expenseNet,
        expenseVat,
        expenseGross,
        vatBalance, // >0 do zapłaty do US, <0 do przeniesienia/zwrotu
        incomeBeforeTax,
      },
      invoices: invoices.map(invoiceToDto),
      expenses: expenses.map(expenseToDto),
    });
  } catch (e) {
    return handleApiError(e);
  }
}
