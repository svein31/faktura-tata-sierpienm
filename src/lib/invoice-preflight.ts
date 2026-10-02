import { isIsoCalendarDate } from "./nbp";
import { isValidNipFormat } from "./validation";
export type PreflightIssue = { code: string; severity: "error" | "warning"; message: string; href?: string };
export type PreflightInput = { number: string; issueDate: string; saleDate: string; dueDate: string; currency: string; lines: { name: string; quantity: number; netPrice: number; vatRate: string }[]; buyer: { name: string; nip?: string; country?: string; taxIdType?: string; street?: string; city?: string; postal?: string }; seller: { companyName: string; nip: string; street?: string | null; city?: string | null; postalCode?: string | null }; correction?: boolean; correctionReason?: string; exemptionBasis?: string; isSplitPayment?: boolean; gross: number };
export function assessInvoice(input: PreflightInput): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  const add = (code: string, severity: PreflightIssue["severity"], message: string) => issues.push({ code, severity, message });
  if (!input.number.trim()) add("number", "error", "Uzupełnij numer faktury.");
  for (const [key, value] of [["issueDate", input.issueDate], ["saleDate", input.saleDate], ["dueDate", input.dueDate]]) if (!isIsoCalendarDate(value)) add(key, "error", "Sprawdź datę: " + key + ".");
  if (isIsoCalendarDate(input.dueDate) && input.dueDate < input.issueDate) add("dueDate.order", "warning", "Termin płatności przypada przed wystawieniem. Upewnij się, że tak uzgodniono.");
  if (!input.seller.companyName.trim() || !isValidNipFormat(input.seller.nip)) add("seller", "error", "Sprawdź nazwę i poprawny NIP sprzedawcy.");
  if (!input.buyer.name.trim()) add("buyer", "error", "Uzupełnij nazwę nabywcy.");
  if ((input.buyer.country || "PL") === "PL" && (input.buyer.taxIdType || "nip") === "nip" && !isValidNipFormat(input.buyer.nip || "")) add("buyer.nip", "error", "Polski NIP nabywcy ma nieprawidłową sumę kontrolną.");
  if (!input.seller.street || !input.seller.city || !input.seller.postalCode) add("seller.address", "warning", "Uzupełnij adres sprzedawcy w profilu firmy przed wysyłką do KSeF.");
  if (!input.buyer.street || !input.buyer.city || !input.buyer.postal) add("buyer.address", "warning", "Sprawdź kompletność adresu nabywcy.");
  if (!/^[A-Z]{3}$/.test(input.currency)) add("currency", "error", "Wybierz poprawny kod waluty.");
  if (!Number.isFinite(input.gross)) add("totals", "error", "Kwoty przekraczają obsługiwany zakres. Sprawdź ceny i ilości.");
  if (!input.lines.length || input.lines.length > 200) add("lines", "error", "Faktura wymaga od 1 do 200 pozycji.");
  if (input.lines.some(l => !l.name.trim() || !Number.isFinite(l.quantity) || l.quantity <= 0 || !Number.isFinite(l.netPrice) || l.netPrice < 0 || !["23", "8", "5", "0", "zw", "np", "oo"].includes(l.vatRate))) add("lines.values", "error", "Sprawdź nazwy, ilości, ceny i stawki wszystkich pozycji.");
  if (input.lines.some(l => l.vatRate === "zw") && !input.exemptionBasis?.trim()) add("vat.exemption", "warning", "Sprawdź podstawę zwolnienia VAT i uzupełnij ją, jeśli jest wymagana.");
  if (input.correction && !input.correctionReason?.trim()) add("correction.reason", "error", "Uzupełnij przyczynę korekty.");
  if (input.currency === "PLN" && input.gross > 15000 && !input.isSplitPayment) add("mpp", "warning", "Kwota przekracza 15 000 zł. Sprawdź z księgowością, czy towary lub usługi wymagają MPP; sama kwota nie rozstrzyga obowiązku.");
  return issues;
}
