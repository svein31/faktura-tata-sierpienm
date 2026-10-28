import { isIsoCalendarDate } from "./nbp";
import { isValidNipFormat, isValidIdWewFormat } from "./validation";
import { roundHalfUp } from "./tax/money";
export type PreflightIssue = { code: string; severity: "error" | "warning"; message: string; href?: string };
export type PreflightInput = { number: string; issueDate: string; saleDate: string; dueDate: string; currency: string; lines: { name: string; quantity: number; netPrice: number; vatRate: string }[]; buyer: { name: string; nip?: string; country?: string; taxIdType?: string; street?: string; city?: string; postal?: string }; recipient?: { name: string; nip?: string; taxId?: string; country?: string; taxIdType?: string; street?: string; city?: string; postal?: string; role?: string } | null; seller: { companyName: string; nip: string; street?: string | null; city?: string | null; postalCode?: string | null }; correction?: boolean; correctionReason?: string; originalInvoiceNumber?: string; originalIssueDate?: string; exemptionBasis?: string; isSplitPayment?: boolean; gross: number };
export function assessInvoice(input: PreflightInput): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  const add = (code: string, severity: PreflightIssue["severity"], message: string) => issues.push({ code, severity, message });
  if (!input.number.trim()) add("number", "error", "Uzupełnij numer faktury.");
  for (const [key, value, label] of [["issueDate", input.issueDate, "wystawienia"], ["saleDate", input.saleDate, "sprzedaży"], ["dueDate", input.dueDate, "płatności"]]) if (!isIsoCalendarDate(value)) add(key, "error", "Sprawdź datę " + label + ".");
  if (isIsoCalendarDate(input.dueDate) && input.dueDate < input.issueDate) add("dueDate.order", "warning", "Termin płatności przypada przed wystawieniem. Upewnij się, że tak uzgodniono.");
  if (!input.seller.companyName.trim() || !isValidNipFormat(input.seller.nip)) add("seller", "error", "Sprawdź nazwę i poprawny NIP sprzedawcy.");
  if (!input.buyer.name.trim()) add("buyer", "error", "Uzupełnij nazwę nabywcy.");
  if ((input.buyer.country || "PL") === "PL" && (input.buyer.taxIdType || "nip") === "nip" && !isValidNipFormat(input.buyer.nip || "")) add("buyer.nip", "error", "Polski NIP nabywcy ma nieprawidłową sumę kontrolną.");
  if (!input.seller.street || !input.seller.city || !input.seller.postalCode) add("seller.address", "warning", "Uzupełnij adres sprzedawcy w profilu firmy przed wysyłką do KSeF.");
  if (!input.buyer.street || !input.buyer.city || !input.buyer.postal) add("buyer.address", "warning", "Sprawdź kompletność adresu nabywcy.");
  if (input.recipient) {
    if (!input.recipient.name.trim()) add("recipient.name", "error", "Uzupełnij nazwę odbiorcy (Podmiot3).");
    const recTaxType = input.recipient.taxIdType || "nip";
    const recTaxId = (input.recipient.taxId || input.recipient.nip || "").trim();
    if (recTaxType === "nip" && !isValidNipFormat(recTaxId)) add("recipient.nip", "error", "Polski NIP odbiorcy (Podmiot3) ma nieprawidłową sumę kontrolną.");
    if (recTaxType === "id_wew" && !isValidIdWewFormat(recTaxId)) add("recipient.idWew", "error", "Identyfikator wewnętrzny KSeF (IDWew) odbiorcy musi mieć format NIP-5cyfr.");
    if (["vat_eu", "tin"].includes(recTaxType) && !recTaxId) add("recipient.taxId", "error", "Podaj identyfikator podatkowy odbiorcy (Podmiot3).");
    if (!input.recipient.street?.trim() || !input.recipient.city?.trim() || !input.recipient.postal?.trim()) add("recipient.address", "error", "Uzupełnij ulicę, kod pocztowy i miejscowość odbiorcy (Podmiot3).");
  }
  if (!/^[A-Z]{3}$/.test(input.currency)) add("currency", "error", "Wybierz poprawny kod waluty.");
  if (!Number.isFinite(input.gross) || Math.abs(input.gross) > 1e12) add("totals", "error", "Kwoty przekraczają obsługiwany zakres. Sprawdź ceny i ilości.");
  if (!input.lines.length || input.lines.length > 200) add("lines", "error", "Faktura wymaga od 1 do 200 pozycji.");
  if (input.lines.some(l => !l.name.trim() || !Number.isFinite(l.quantity) || (input.correction ? l.quantity === 0 : l.quantity <= 0) || Math.abs(l.quantity) > 1e9 || roundHalfUp(l.quantity, 6) === 0 || !Number.isFinite(l.netPrice) || l.netPrice < 0 || l.netPrice > 1e9 || !["23", "8", "5", "0", "zw", "np", "oo"].includes(l.vatRate))) add("lines.values", "error", "Sprawdź nazwy, ilości, ceny i stawki wszystkich pozycji.");
  if (input.lines.some(l => l.vatRate === "zw") && !input.exemptionBasis?.trim()) add("vat.exemption", "warning", "Sprawdź podstawę zwolnienia VAT i uzupełnij ją, jeśli jest wymagana.");
  if (input.correction && !input.correctionReason?.trim()) add("correction.reason", "error", "Uzupełnij przyczynę korekty.");
  if (input.correction && !input.originalInvoiceNumber?.trim()) add("correction.originalNumber", "error", "Podaj numer korygowanej faktury.");
  if (input.correction && (!isIsoCalendarDate(input.originalIssueDate || "") || (input.originalIssueDate || "") > input.issueDate)) add("correction.originalDate", "error", "Sprawdź datę korygowanej faktury.");
  if (input.currency === "PLN" && input.gross > 15000 && !input.isSplitPayment) add("mpp", "warning", "Kwota przekracza 15 000 zł. Sprawdź z księgowością, czy towary lub usługi wymagają MPP; sama kwota nie rozstrzyga obowiązku.");
  return issues;
}
