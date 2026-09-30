import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json } from "@/lib/api";
import { objectId } from "@/lib/company-scope";
import { requireCompanyAccess } from "@/lib/permissions";
import { isAccountingInvoice } from "@/lib/accountant-summary";
import { calculateTaxes } from "@/lib/tax/calculator";
import { round2, roundToZloty } from "@/lib/tax/money";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const user = await getSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const q = new URL(req.url).searchParams, companyId = q.get("companyId"), period = q.get("month") || new Date().toISOString().slice(0, 7);
    if (!objectId(companyId) || !/^(2025|2026)-(0[1-9]|1[0-2])$/.test(period)) throw new ApiError(400, "Wybierz firmę i okres 2025–2026.");
    const access = await requireCompanyAccess(user.id, companyId); if (!access.ok) throw new ApiError(access.status, access.error);
    const mode = q.get("mode") || "skala";
    if (!["skala", "liniowy", "ryczalt", "cit"].includes(mode)) throw new ApiError(400, "Wybierz formę opodatkowania.");
    const value = (key: string, fallback = 0) => { const v = q.get(key), n = v === null || v === "" ? fallback : Number(v); if (!Number.isFinite(n) || n < 0 || n > 1e10) throw new ApiError(400, "Nieprawidłowa kwota: " + key); return n; };
    const year = Number(period.slice(0, 4)), month = Number(period.slice(5, 7));
    const [records, costs] = await Promise.all([
      prisma.invoice.findMany({ where: { sellerCompanyId: companyId, issueDate: { gte: year + "-01-01", lt: period + "-32" } }, take: 5001 }),
      prisma.expense.findMany({ where: { companyId, issueDate: { gte: year + "-01-01", lt: period + "-32" } }, take: 5001 }),
    ]);
    if (records.length > 5000 || costs.length > 5000) throw new ApiError(413, "Przekroczono limit prognozy 5000 dokumentów.");
    const posted = records.filter(isAccountingInvoice), purchases = posted.filter(i => i.type === "purchase"), refs = new Set(purchases.map(i => i.ksefNumber).filter(Boolean));
    const invoices = posted.filter(i => i.type === "sale" && (i.currency === "PLN" || i.exchangeRate && i.exchangeRate > 0));
    const purchaseRows = purchases.filter(i => i.currency === "PLN" || i.exchangeRate && i.exchangeRate > 0);
    const expenses = costs.filter(e => e.currency === "PLN" && (!e.ksefRefNumber || !refs.has(e.ksefRefNumber)));
    const amount = (i: typeof records[number], vat = false) => i.currency === "PLN" ? (vat ? i.totalVat : i.totalNet) || 0 : (vat ? i.totalVatPln : i.totalNetPln) || 0;
    const sumSales = (prefix: string) => round2(invoices.filter(i => i.issueDate.startsWith(prefix)).reduce((s, i) => s + amount(i), 0));
    const sumCosts = (prefix: string) => round2(purchaseRows.filter(i => i.issueDate.startsWith(prefix)).reduce((s, i) => s + amount(i), 0) + expenses.filter(e => e.issueDate.startsWith(prefix)).reduce((s, e) => s + e.totalNet, 0));
    const revenueNet = sumSales(period), costsNet = sumCosts(period), revenueYtd = sumSales(String(year)), costsYtd = sumCosts(String(year));
    const outputVat = invoices.filter(i => (i.vatRegisterPeriod || i.issueDate.slice(0, 7)) === period).reduce((s, i) => s + amount(i, true), 0);
    const inputVat = purchaseRows.filter(i => (i.vatRegisterPeriod || i.issueDate.slice(0, 7)) === period).reduce((s, i) => s + amount(i, true), 0) + expenses.filter(e => (e.vatRegisterPeriod || e.issueDate.slice(0, 7)) === period).reduce((s, e) => s + (e.vatDeductible === false ? 0 : e.totalVat * Math.max(0, Math.min(100, e.vatDeductiblePercent ?? 100)) / 100), 0);
    const vatBalance = round2(outputVat - inputVat), warnings = ["Prognoza zakłada, że wskazane koszty stanowią KUP. Podstawowy VAT zakupów z faktur przyjmuje 100% odliczenia; ograniczenia i procedury specjalne sprawdź z księgową.", "Wynik jest scenariuszem na podstawie dokumentów i podanych założeń. Nie tworzy deklaracji ani przelewu podatku."];
    const excluded = costs.filter(e => e.currency !== "PLN").length + posted.filter(i => i.currency !== "PLN" && !i.exchangeRate).length;
    if (excluded) warnings.push("Pominięto " + excluded + " dokumentów bez wyliczonej wartości PLN. Uzupełnij kursy i rejestr kosztów.");
    if (mode === "cit") {
      const rate = value("citRate", 19); if (![9, 19].includes(rate)) throw new ApiError(400, "CIT: wybierz 9% lub 19%.");
      const incomeYtd = Math.max(0, revenueYtd - costsYtd - value("loss")), taxYtd = roundToZloty(incomeYtd * rate / 100), advance = Math.max(0, taxYtd - value("paid"));
      if (rate === 9) warnings.push("Stawka 9% wymaga spełnienia warunków ustawowych; nie obejmuje zysków kapitałowych. Kwalifikację potwierdza księgowość.");
      return json({ period, revenueNet, costsNet, revenueYtd, costsYtd, vatBalance, incomeTax: advance, social: 0, health: 0, total: round2(advance + Math.max(0, vatBalance)), warnings, steps: [{ label: "Dochód CIT narastająco", value: incomeYtd }, { label: "CIT narastająco", value: taxYtd }] });
    }
    const ryczaltRate = value("ryczaltRate", 8.5);
    if (![2, 3, 5.5, 8.5, 10, 12, 14, 15, 17].includes(ryczaltRate)) throw new ApiError(400, "Nieprawidłowa stawka ryczałtu.");
    const zusScheme = q.get("zus") || "full";
    if (!["full", "preferential", "ulga_na_start", "none"].includes(zusScheme)) throw new ApiError(400, "Wybierz wariant ZUS.");
    const result = calculateTaxes({ year, month, taxationForm: mode as "skala" | "liniowy" | "ryczalt", ryczaltRate, revenueNet, costsNet, revenueYtd, costsYtd, previousMonthIncome: value("previousIncome"), zusScheme: zusScheme as "full" | "preferential" | "ulga_na_start" | "none", zusSickness: true, zusLabourFund: true, zusAccidentRate: 1.67, socialInCosts: false, applyTaxReducingAmount: true, lossCarryForward: value("loss"), paidAdvancesYtd: value("paid"), healthPaidYtd: value("healthPaid"), vatDue: Math.max(0, vatBalance) });
    warnings.push("Dochód poprzedniego miesiąca, zapłacone zaliczki i składki uzupełnij ręcznie. Kalkulator JDG zakłada ten sam wariant składek w poprzednich miesiącach.");
    return json({ period, revenueNet, costsNet, revenueYtd, costsYtd, vatBalance, incomeTax: result.pitAdvanceRounded, social: result.zusSocialTotal, health: result.zusHealth, total: result.totalDue, warnings: [...warnings, ...result.notes], steps: result.steps });
  } catch (e) { return handleApiError(e); }
}
