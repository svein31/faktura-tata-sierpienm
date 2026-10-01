import { ApiError, cleanStr } from "@/lib/api";
import { isIsoCalendarDate } from "@/lib/nbp";
import type { Prisma } from "@prisma/client";

const CURRENCIES = ["PLN", "EUR", "USD", "GBP", "CHF", "CZK"];
const ORDER_STATUSES = ["in_progress", "completed", "billed", "cancelled"];
const WORKFLOW_STATUSES = ["to_verify", "verified", "sent_to_accountant"];

export function nonNegativeNumber(value: unknown, field: string, maximum = 1e12): number {
  if ((typeof value !== "number" && typeof value !== "string") || value === "" || (typeof value === "string" && !value.trim())) throw new ApiError(400, `Pole „${field}” musi być liczbą.`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > maximum) throw new ApiError(400, `Pole „${field}” musi być nieujemną liczbą do ${maximum}.`);
  return parsed;
}
function enumValue(value: unknown, options: string[], field: string) {
  if (typeof value !== "string" || !options.includes(value)) throw new ApiError(400, `Nieprawidłowe pole „${field}”.`);
  return value;
}
export function documentCurrency(value: unknown) {
  return enumValue(cleanStr(value, 3, "currency").toUpperCase(), CURRENCIES, "currency");
}
function calendarDate(value: unknown, field: string) {
  const date = cleanStr(value, 10, field);
  if (!isIsoCalendarDate(date)) throw new ApiError(400, `Nieprawidłowa data „${field}”.`);
  return date;
}
export function expensePaymentFields(body: Record<string, unknown>, existing?: { paymentStatus: string; paidAt: Date | null }) {
  const paymentStatus = enumValue(body.paymentStatus ?? existing?.paymentStatus ?? "unpaid", ["paid", "unpaid"], "paymentStatus");
  let paidAt: Date | null = null;
  if (paymentStatus === "paid") {
    if (body.paidAt != null) {
      if (typeof body.paidAt !== "string" && typeof body.paidAt !== "number") throw new ApiError(400, "Nieprawidłowa data płatności.");
      if (typeof body.paidAt === "string") {
        const day = /^(\d{4}-\d{2}-\d{2})(?:T|$)/.exec(body.paidAt)?.[1];
        if (!day || !isIsoCalendarDate(day)) throw new ApiError(400, "Nieprawidłowa data płatności.");
      }
      paidAt = new Date(body.paidAt);
      if (!Number.isFinite(paidAt.getTime())) throw new ApiError(400, "Nieprawidłowa data płatności.");
    } else paidAt = existing?.paidAt || new Date();
  }
  return { paymentStatus, paidAt };
}
export function expenseWorkflow(value: unknown) { return enumValue(value, WORKFLOW_STATUSES, "workflowStatus"); }
export function parseExpenseBody(body: Record<string, unknown>, existing?: Record<string, any>) {
  const pick = (key: string, fallback: unknown = null) => body[key] === undefined ? (existing?.[key] ?? fallback) : body[key];
  const contractorName = cleanStr(pick("contractorName"), 200, "contractorName");
  if (!contractorName) throw new ApiError(400, "Podaj nazwę sprzedawcy / wystawcy kosztu.");
  const issueDate = calendarDate(pick("issueDate", new Date().toISOString().slice(0, 10)), "issueDate");
  const dueValue = pick("dueDate");
  const dueDate = dueValue == null || dueValue === "" ? null : calendarDate(dueValue, "dueDate");
  const totalGross = nonNegativeNumber(pick("totalGross", 0), "totalGross");
  const totalNet = nonNegativeNumber(pick("totalNet", Math.round(totalGross / 1.23 * 100) / 100), "totalNet");
  const totalVat = nonNegativeNumber(pick("totalVat", Math.round((totalGross - totalNet) * 100) / 100), "totalVat");
  if (Math.abs(totalNet + totalVat - totalGross) > 0.011) throw new ApiError(400, "Kwoty netto i VAT muszą sumować się do brutto.");
  return {
    contractorName, issueDate, dueDate, totalNet, totalVat, totalGross,
    number: cleanStr(pick("number"), 100, "number") || `KOSZT/${issueDate}`,
    nip: cleanStr(pick("nip"), 50, "nip") || null,
    category: cleanStr(pick("category", "inne"), 100, "category") || "inne",
    description: cleanStr(pick("description"), 4000, "description") || null,
    currency: documentCurrency(pick("currency", "PLN")),
    workflowStatus: expenseWorkflow(pick("workflowStatus", "to_verify")),
    ...expensePaymentFields(body, existing as {paymentStatus:string;paidAt:Date|null} | undefined),
    attachmentUrl: cleanStr(pick("attachmentUrl"), 2000, "attachmentUrl") || null,
    attachmentName: cleanStr(pick("attachmentName"), 300, "attachmentName") || null,
  };
}
export function orderStatus(value: unknown) { return enumValue(value, ORDER_STATUSES, "status"); }
export function orderMinutes(value: unknown) {
  const minutes = nonNegativeNumber(value, "trackedMinutes", 1e9);
  if (!Number.isInteger(minutes)) throw new ApiError(400, "Czas pracy musi być całkowitą liczbą minut.");
  return minutes;
}
/** Normalize floating point noise in whole-minute hours payloads. */
export function orderHoursToMinutes(value: unknown) {
  const raw = nonNegativeNumber(value, "trackedHours", 1e7) * 60;
  const minutes = Math.round(raw);
  if (Math.abs(raw - minutes) > Math.max(1e-7, raw * Number.EPSILON * 4)) throw new ApiError(400, "Czas pracy musi być całkowitą liczbą minut.");
  return orderMinutes(minutes);
}
function orderStages(value: unknown): Prisma.InputJsonValue {
  if (!Array.isArray(value) || value.length > 100) throw new ApiError(400, "Nieprawidłowa lista etapów zlecenia.");
  const ids = new Set<string>();
  return value.map(stage => {
    if (!stage || typeof stage !== "object" || Array.isArray(stage)) throw new ApiError(400, "Nieprawidłowy etap zlecenia.");
    const id = cleanStr(stage.id, 100, "stage.id"), name = cleanStr(stage.name, 200, "stage.name");
    if (!id || !name || ids.has(id)) throw new ApiError(400, "Etapy wymagają nazwy i unikalnego identyfikatora.");
    ids.add(id);
    const billedInvoiceId = cleanStr(stage.billedInvoiceId, 100, "stage.billedInvoiceId");
    return { id, name, amount: nonNegativeNumber(stage.amount, "stage.amount"),
      status: enumValue(stage.status, ["pending", "in_progress", "completed", "billed"], "stage.status"),
      ...(stage.dueDate ? {dueDate:calendarDate(stage.dueDate,"stage.dueDate")} : {}),
      ...(billedInvoiceId ? {billedInvoiceId} : {}) };
  });
}
export function parseOrderBody(body: Record<string, unknown>, existing?: Record<string, any>) {
  const pick = (key: string, fallback: unknown = null) => body[key] === undefined ? (existing?.[key] ?? fallback) : body[key];
  const totalGross = nonNegativeNumber(body.totalGross ?? body.totalAmount ?? existing?.totalGross ?? 0, "totalGross");
  const totalNet = nonNegativeNumber(body.totalNet ?? (body.totalGross !== undefined || body.totalAmount !== undefined || !existing ? Math.round(totalGross / 1.23 * 100) / 100 : existing.totalNet), "totalNet");
  if (totalNet > totalGross + 0.011) throw new ApiError(400, "Kwota netto nie może przekraczać brutto.");
  const number = cleanStr(pick("number"), 100, "number");
  const title = cleanStr(pick("title"), 300, "title");
  return {
    number, title, totalGross, totalNet,
    status: orderStatus(pick("status", "in_progress")),
    currency: documentCurrency(pick("currency", "PLN")),
    hourlyRate: nonNegativeNumber(pick("hourlyRate", 0), "hourlyRate"),
    trackedMinutes: orderMinutes(body.trackedMinutes ?? (body.trackedHours === undefined ? existing?.trackedMinutes ?? 0 : orderHoursToMinutes(body.trackedHours))),
    stages: orderStages(pick("stages", [])),
    notes: cleanStr(pick("notes"), 4000, "notes") || null,
  };
}
