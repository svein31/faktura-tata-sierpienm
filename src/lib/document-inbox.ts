import { createHash } from "node:crypto";
import { ApiError } from "@/lib/api";
import { objectId } from "@/lib/company-scope";
import { requireCompanyAccess } from "@/lib/permissions";
import { isIsoCalendarDate } from "@/lib/nbp";
import { round2 } from "@/lib/format";

export const MAX_DOCUMENT_BYTES = 3 * 1024 * 1024;
export async function inboxAccess(userId: string, companyId: unknown, write = false, approve = false) {
  if (!objectId(companyId)) throw new ApiError(400, "Wybierz firmę.");
  const access = await requireCompanyAccess(userId, companyId);
  if (!access.ok) throw new ApiError(access.status, access.error);
  if (approve && !access.membership.permissions.canExport) throw new ApiError(403, "Zatwierdzanie wymaga uprawnienia księgowego do eksportu.");
  if (write && !access.membership.permissions.canIssueInvoices && !access.membership.permissions.canExport) throw new ApiError(403, "Brak uprawnień do opracowania dokumentów.");
  return companyId;
}
export function documentMime(bytes: Buffer) {
  if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES) throw new ApiError(400, "Dozwolone są pliki do 3 MB.");
  if (bytes.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  throw new ApiError(400, "Wybierz dokument PDF, JPG lub PNG.");
}
export function documentIdentity(companyId: string, bytes: Buffer) {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return { sha256, id: createHash("sha256").update(`${companyId}:${sha256}`).digest("hex").slice(0, 24) };
}
export function reviewFields(body: Record<string, unknown>) {
  const field = (key: string, max: number) => typeof body[key] === "string" ? (body[key] as string).trim().slice(0, max) : "";
  const number = field("number", 100), contractorName = field("contractorName", 200), issueDate = field("issueDate", 10), currency = field("currency", 3).toUpperCase(), nip = field("nip", 20), category = field("category", 60) || "inne";
  if (!number || !contractorName || !isIsoCalendarDate(issueDate) || !/^[A-Z]{3}$/.test(currency)) throw new ApiError(400, "Uzupełnij numer, sprzedawcę, datę i walutę dokumentu.");
  const values = ["totalNet", "totalVat", "totalGross"].map(key => body[key]);
  if (values.some(n => typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 1e10)) throw new ApiError(400, "Wpisz nieujemne kwoty dokumentu. Korekty wymagają osobnej obsługi.");
  const [totalNet, totalVat, totalGross] = (values as number[]).map(round2);
  if (Math.abs(round2(totalNet + totalVat) - totalGross) > 0.011) throw new ApiError(400, "Netto + VAT musi być równe brutto.");
  const lines = reviewLines(body.lines, { totalNet, totalVat, totalGross });
  return { number, contractorName, nip, issueDate, currency, category, totalNet, totalVat, totalGross, ...(lines !== undefined ? { lines } : {}) };
}

export function reviewLines(value: unknown, totals: { totalNet: number; totalVat: number; totalGross: number }) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 200) throw new ApiError(400, "Dokument może zawierać do 200 pozycji.");
  const lines = value.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new ApiError(400, "Nieprawidłowa pozycja.");
    const row = item as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const unit = typeof row.unit === "string" ? row.unit.trim() : "";
    if (!name || name.length > 500 || !unit || unit.length > 20) throw new ApiError(400, "Uzupełnij nazwę i jednostkę każdej pozycji.");
    const values = ["quantity", "totalNet", "totalVat", "totalGross"].map(key => row[key]);
    if (values.some(n => typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 1e10) || Number(row.quantity) <= 0) throw new ApiError(400, "Sprawdź ilości i nieujemne kwoty pozycji.");
    const [quantity, net, vat, gross] = values as number[];
    const totalNet = round2(net), totalVat = round2(vat), totalGross = round2(gross);
    if (Math.abs(round2(totalNet + totalVat) - totalGross) > 0.011) throw new ApiError(400, "Netto + VAT każdej pozycji musi być równe brutto.");
    return { name, unit, quantity, totalNet, totalVat, totalGross };
  });
  if (lines.length) {
    for (const key of ["totalNet", "totalVat", "totalGross"] as const) {
      if (Math.abs(round2(lines.reduce((sum, line) => sum + line[key], 0)) - totals[key]) > 0.011) throw new ApiError(400, "Suma pozycji musi zgadzać się z kwotami dokumentu.");
    }
  }
  return lines;
}
