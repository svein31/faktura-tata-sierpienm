export const PURCHASE_INVOICE_READ_ONLY = "Faktury kosztowe można tylko przeglądać i akceptować lub cofać ich akceptację.";

const acceptedFields = ["number", "contractorId", "sellerCompanyId", "recipient", "issueDate", "saleDate", "dueDate", "currency", "lines", "paymentMethod", "bankAccountId", "bankAccountSnapshot", "isCorrection", "correctionReason", "originalInvoiceId", "originalInvoiceNumber", "originalIssueDate", "originalKsefNumber", "originalLines", "isProforma", "isSplitPayment", "exemptionBasis", "exchangeRate", "gtuCodes", "jpkProcedures"];
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value ?? null;
}
/** Do not report success while silently ignoring changes to a registered invoice. */
export function changedAcceptedInvoiceFields(body: Record<string, unknown>, current: Record<string, unknown>): string[] {
  return acceptedFields.filter(key => body[key] !== undefined && JSON.stringify(canonical(body[key])) !== JSON.stringify(canonical(current[key])));
}
