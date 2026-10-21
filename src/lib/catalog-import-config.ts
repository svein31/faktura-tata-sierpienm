export type CatalogImportKind = "contractors" | "products";
export type CatalogImportResult = { line: number; name: string; nip?: string; status: "ready" | "duplicate" | "invalid"; reason: string };
export type CatalogImportPreview = { created: number; ready: number; duplicate: number; invalid: number; results: CatalogImportResult[] };
export type ImportColumn = { key: string; label: string; required?: boolean; aliases: string[] };
export const CATALOG_IMPORT_LIMIT = 200;
export const CATALOG_COLUMNS: Record<CatalogImportKind, ImportColumn[]> = {
  contractors: [
    { key: "name", label: "Nazwa", required: true, aliases: ["nazwa", "name", "firma", "nazwa firmy", "nazwa kontrahenta"] },
    { key: "nip", label: "NIP", required: true, aliases: ["nip", "tax id", "numer nip"] },
    { key: "street", label: "Ulica", aliases: ["ulica", "street", "adres"] },
    { key: "city", label: "Miasto", aliases: ["miasto", "city", "miejscowość"] },
    { key: "postal", label: "Kod pocztowy", aliases: ["kod pocztowy", "postal", "postal code"] },
    { key: "email", label: "E-mail", aliases: ["email", "e-mail", "adres e-mail"] },
    { key: "phone", label: "Telefon", aliases: ["telefon", "phone", "numer telefonu"] },
  ],
  products: [
    { key: "name", label: "Nazwa", required: true, aliases: ["nazwa", "name", "produkt", "nazwa produktu", "nazwa usługi"] },
    { key: "sku", label: "SKU / kod", aliases: ["sku", "kod", "symbol", "kod produktu"] },
    { key: "unit", label: "Jednostka", aliases: ["jednostka", "j.m.", "jm", "unit"] },
    { key: "netPrice", label: "Cena netto (PLN)", required: true, aliases: ["cena netto", "cena netto (pln)", "netprice", "net price", "net_price"] },
    { key: "vatRate", label: "Stawka VAT", required: true, aliases: ["vat", "stawka vat", "vatrate", "vat rate", "vat_rate"] },
    { key: "currency", label: "Waluta", aliases: ["waluta", "currency"] },
    { key: "description", label: "Opis", aliases: ["opis", "description"] },
  ],
};
export function suggestCatalogMapping(kind: CatalogImportKind, headers: string[]) {
  const normalized = headers.map(header => header.trim().toLocaleLowerCase("pl-PL"));
  const used = new Set<number>();
  return Object.fromEntries(CATALOG_COLUMNS[kind].map(field => {
    const index = normalized.findIndex((header, position) => !used.has(position) && field.aliases.includes(header));
    if (index >= 0) used.add(index);
    return [field.key, index < 0 ? "" : String(index)];
  }));
}
