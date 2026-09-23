export const IMPORT_FIELDS = ["name", "nip", "street", "city", "postal", "email", "phone"] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export type ImportRow = Record<ImportField, string>;
export type ImportResult = { line: number; name: string; nip: string; status: "ready" | "duplicate" | "invalid"; reason: string };
