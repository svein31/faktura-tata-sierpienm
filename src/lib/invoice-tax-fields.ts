import { FieldError } from "./api";
export const JPK_PROCEDURES = ["WSTO_EE", "IED", "TP", "TT_WNT", "TT_D", "MR_T", "MR_UZ", "I_42", "I_63", "B_SPV", "B_SPV_DOSTAWA", "B_MPV_PROWIZJA"] as const;
export function parseInvoiceTaxFields(body: Record<string, unknown>) {
  function codes(key: string, allowed: (value: string) => boolean) {
    const value = body[key]; if (value === undefined) return undefined;
    if (!Array.isArray(value) || value.length > 20 || value.some(v => typeof v !== "string" || !allowed(v))) throw new FieldError(key, "Wybierz poprawne oznaczenia podatkowe.");
    return [...new Set(value)] as string[];
  }
  const gtuCodes = codes("gtuCodes", value => /^GTU_(0[1-9]|1[0-3])$/.test(value)), jpkProcedures = codes("jpkProcedures", value => (JPK_PROCEDURES as readonly string[]).includes(value));
  if (body.isSplitPayment !== undefined && typeof body.isSplitPayment !== "boolean") throw new FieldError("isSplitPayment", "MPP musi mieć wartość tak/nie.");
  const doc = body.jpkDocumentType;
  if (doc != null && doc !== "" && !["RO", "WEW", "FP"].includes(String(doc))) throw new FieldError("jpkDocumentType", "Nieprawidłowy rodzaj dokumentu JPK.");
  const period = body.vatRegisterPeriod;
  if (period != null && period !== "" && (typeof period !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period))) throw new FieldError("vatRegisterPeriod", "Podaj poprawny miesiąc ewidencji VAT.");
  if (body.exemptionBasis !== undefined && (typeof body.exemptionBasis !== "string" || body.exemptionBasis.length > 1000)) throw new FieldError("exemptionBasis", "Podstawa zwolnienia musi być tekstem do 1000 znaków.");
  return { ...(gtuCodes === undefined ? {} : { gtuCodes }), ...(jpkProcedures === undefined ? {} : { jpkProcedures }), ...(body.isSplitPayment === undefined ? {} : { isSplitPayment: body.isSplitPayment as boolean }), ...(doc === undefined ? {} : { jpkDocumentType: doc ? String(doc) : null }), ...(period === undefined ? {} : { vatRegisterPeriod: period ? String(period) : null }), ...(body.exemptionBasis === undefined ? {} : { exemptionBasis: String(body.exemptionBasis).trim() || null }) };
}
