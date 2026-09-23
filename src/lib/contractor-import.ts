import { ApiError } from "@/lib/api";
import { parseContractorBody } from "@/lib/parsers";
import type { Prisma } from "@prisma/client";
import { IMPORT_FIELDS, type ImportResult } from "@/lib/contractor-import-fields";

export function validateImportRows(input: unknown): { values: Prisma.ContractorCreateManyInput[]; results: ImportResult[] } {
  if (!Array.isArray(input) || !input.length || input.length > 200) throw new ApiError(400, "Wybierz od 1 do 200 wierszy kontrahentów.");
  const seen = new Set<string>();
  const values: Prisma.ContractorCreateManyInput[] = [];
  const results: ImportResult[] = [];
  for (const [index, raw] of input.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ApiError(400, `Nieprawidłowy wiersz ${index + 1}.`);
    const row = raw as Record<string, unknown>;
    for (const field of IMPORT_FIELDS) if (typeof row[field] !== "string" || (row[field] as string).length > 500) throw new ApiError(400, `Nieprawidłowe pole ${field} w wierszu ${index + 1}.`);
    const result: ImportResult = { line: index + 2, name: String(row.name).slice(0, 200), nip: String(row.nip).slice(0, 50), status: "invalid", reason: "" };
    try {
      const data = parseContractorBody({ name: row.name, nip: row.nip, taxIdType: "nip", country: "PL", address: { street: row.street, city: row.city, postal: row.postal, country: "PL" }, email: row.email, phone: row.phone });
      if (!data.nip || !/^\d{10}$/.test(data.nip)) throw new ApiError(400, "Wymagany jest polski NIP.");
      result.nip = data.nip;
      if (seen.has(data.nip)) { result.status = "duplicate"; result.reason = "Powtórzony NIP w pliku."; }
      else { seen.add(data.nip); result.status = "ready"; values.push(data as Prisma.ContractorCreateManyInput); }
    } catch (error) { result.reason = error instanceof Error ? error.message : "Nieprawidłowe dane."; }
    results.push(result);
  }
  return { values, results };
}

/** Maps existing company records to the preview and removes duplicates from the write set. */
export function excludeExisting(values: Prisma.ContractorCreateManyInput[], results: ImportResult[], existingNips: string[]) {
  const existing = new Set(existingNips);
  for (const row of results) if (row.status === "ready" && existing.has(row.nip)) { row.status = "duplicate"; row.reason = "NIP istnieje już w kartotece firmy."; }
  return values.filter(value => !existing.has(value.nip));
}
