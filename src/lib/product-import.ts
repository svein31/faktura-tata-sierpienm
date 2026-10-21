import type { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api";
import { parseProductBody } from "@/lib/parsers";
import { CATALOG_COLUMNS, CATALOG_IMPORT_LIMIT, type CatalogImportResult } from "@/lib/catalog-import-config";

const normalize = (value: string) => value.trim().normalize("NFKC").toLocaleLowerCase("pl-PL");
/** A SKU identifies an article; without it, use the exact normalized name. Never overwrite. */
export function productImportKey(value: { name: string; sku?: string | null }) {
  return value.sku?.trim() ? `sku:${normalize(value.sku)}` : `name:${normalize(value.name)}`;
}
export function validateProductImportRows(input: unknown) {
  if (!Array.isArray(input) || !input.length || input.length > CATALOG_IMPORT_LIMIT) throw new ApiError(400, "Wybierz od 1 do 200 wierszy produktów lub usług.");
  const values: Prisma.ProductCreateManyInput[] = [], results: CatalogImportResult[] = [], seen = new Set<string>();
  for (const [index, raw] of input.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ApiError(400, `Nieprawidłowy wiersz ${index + 1}.`);
    const row = raw as Record<string, unknown>;
    for (const { key } of CATALOG_COLUMNS.products) if (typeof row[key] !== "string" || (row[key] as string).length > 1000) throw new ApiError(400, `Nieprawidłowe pole ${key} w wierszu ${index + 1}.`);
    const result: CatalogImportResult = { line: index + 2, name: String(row.name).slice(0, 200), status: "invalid", reason: "" };
    try {
      if (row.currency && String(row.currency).trim().toUpperCase() !== "PLN") throw new Error("Katalog przechowuje ceny w PLN. Przelicz cenę przed importem.");
      const price = String(row.netPrice).trim().replace(/[\s\u00a0\u202f]/g, "");
      if (!/^\d+(?:[.,]\d{1,2})?$/.test(price)) throw new Error("Podaj cenę netto, np. 1250,50. Maksymalnie dwa miejsca po przecinku.");
      const netPrice = Number(price.replace(",", "."));
      if (netPrice > 999999999.99) throw new Error("Cena netto przekracza limit 999 999 999,99 PLN.");
      const vatRate = String(row.vatRate).trim().toLowerCase().replace(/\s*%$/, "");
      const data = parseProductBody({ ...row, netPrice, vatRate });
      const key = productImportKey(data);
      if (seen.has(key)) { result.status = "duplicate"; result.reason = "Powtórzone SKU lub nazwa pozycji bez SKU w pliku."; }
      else { seen.add(key); result.status = "ready"; values.push(data as Prisma.ProductCreateManyInput); }
    } catch (error) { result.reason = error instanceof Error ? error.message : "Nieprawidłowe dane."; }
    results.push(result);
  }
  return { values, results };
}
export function excludeExistingProducts(values: Prisma.ProductCreateManyInput[], results: CatalogImportResult[], existing: { name: string; sku: string | null }[]) {
  const keys = new Set(existing.map(productImportKey));
  let at = 0;
  for (const row of results) if (row.status === "ready") {
    if (keys.has(productImportKey(values[at]))) { row.status = "duplicate"; row.reason = "SKU lub nazwa pozycji bez SKU istnieje już w katalogu firmy."; }
    at++;
  }
  return values.filter(value => !keys.has(productImportKey(value)));
}
