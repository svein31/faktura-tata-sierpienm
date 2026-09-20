import { extractOcrFields } from "@/lib/ocr-extraction";

export class OcrProviderError extends Error {
  constructor(message: string, public retryable = false) { super(message); this.name = "OcrProviderError"; }
}
export type OcrProvider = (imageData: string) => Promise<{ rawText: string; extraction: ReturnType<typeof extractOcrFields> }>;

export function parseOcrResponse(data: unknown) {
  if (!data || typeof data !== "object") throw new OcrProviderError("Nieprawidłowa odpowiedź usługi OCR.");
  const body = data as Record<string, unknown>;
  if (body.IsErroredOnProcessing || String(body.OCRExitCode) !== "1" || !Array.isArray(body.ParsedResults) || !body.ParsedResults.length) throw new OcrProviderError("OCR nie odczytał całego dokumentu. Sprawdź limit usługi i jakość pliku lub opracuj dokument ręcznie.");
  if (body.ParsedResults.length > 100) throw new OcrProviderError("Dokument przekracza limit 100 stron odczytu.");
  const pages = body.ParsedResults.map((page: unknown) => {
    if (!page || typeof page !== "object") throw new OcrProviderError("Brakuje wyniku strony OCR.");
    const result = page as Record<string, unknown>;
    if (String(result.FileParseExitCode) !== "1" || typeof result.ParsedText !== "string") throw new OcrProviderError("Nie wszystkie strony zostały poprawnie odczytane.");
    return result.ParsedText;
  });
  const rawText = pages.join("\n");
  if (!rawText.trim() || rawText.length > 100000) throw new OcrProviderError("Odczyt jest pusty lub przekracza limit tekstu. Opracuj dokument ręcznie.");
  return { rawText, extraction: extractOcrFields(pages) };
}

export const ocrSpace: OcrProvider = async imageData => {
  const key = process.env.OCR_SPACE_API_KEY;
  if (!key) throw new OcrProviderError("OCR nie jest skonfigurowany. Możesz opracować dokument ręcznie.");
  const form = new FormData(); form.set("base64Image", imageData); form.set("language", "auto"); form.set("OCREngine", "2"); form.set("isTable", "true");
  let response: Response;
  try { response = await fetch("https://api.ocr.space/parse/image", { method: "POST", headers: { apikey: key }, body: form, signal: AbortSignal.timeout(20000), redirect: "error" }); }
  catch { throw new OcrProviderError("Połączenie z OCR nie powiodło się. Zaplanowano ponowienie.", true); }
  if (!response.ok) throw new OcrProviderError("Usługa OCR odrzuciła żądanie. Sprawdź konfigurację i limit usługi.", response.status === 429 || response.status >= 500);
  const reader = response.body?.getReader(); if (!reader) throw new OcrProviderError("Pusta odpowiedź OCR.", true);
  const chunks: Uint8Array[] = []; let bytes = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    bytes += value.byteLength;
    if (bytes > 2 * 1024 * 1024) { await reader.cancel(); throw new OcrProviderError("Odpowiedź OCR przekracza limit rozmiaru."); }
    chunks.push(value);
  }
  let data: unknown;
  try { data = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new OcrProviderError("Nieprawidłowa odpowiedź OCR.", true); }
  return parseOcrResponse(data);
};
