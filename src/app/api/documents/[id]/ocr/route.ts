import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json } from "@/lib/api";
import { inboxAccess } from "@/lib/document-inbox";
import { objectId } from "@/lib/company-scope";
export const maxDuration = 60;
export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  let claim: { id: string; version: number } | null = null;
  try {
    const user = await getSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const { id } = await context.params; if (!objectId(id)) throw new ApiError(404, "Nie znaleziono dokumentu.");
    const record = await prisma.expenseScan.findUnique({ where: { id } }); if (!record?.imageData) throw new ApiError(404, "Nie znaleziono dokumentu.");
    await inboxAccess(user.id, record.companyId, true);
    const key = process.env.OCR_SPACE_API_KEY;
    if (!key) throw new ApiError(503, "OCR nie jest skonfigurowany. Możesz opracować dokument ręcznie.");
    if (record.expenseId || ["converted", "rejected"].includes(record.status)) throw new ApiError(409, "Dokument ma już zapisaną decyzję.");
    if (record.status === "processing" && Date.now() - record.updatedAt.getTime() < 60000) throw new ApiError(409, "Rozpoznawanie jest w toku.");
    const updated = await prisma.expenseScan.update({ where: { id, version: record.version }, data: { version: { increment: 1 }, status: "processing", provider: "ocrspace", errorMessage: null } });
    claim = { id, version: updated.version };
    const form = new FormData(); form.set("base64Image", record.imageData); form.set("language", "auto"); form.set("OCREngine", "2"); form.set("isTable", "true");
    const res = await fetch("https://api.ocr.space/parse/image", { method: "POST", headers: { apikey: key }, body: form, signal: AbortSignal.timeout(25000), redirect: "error" });
    if (!res.ok) throw new ApiError(502, "Dostawca OCR jest niedostępny. Spróbuj ponownie.");
    const data = await res.json();
    if (data.IsErroredOnProcessing || data.OCRExitCode !== 1 || !Array.isArray(data.ParsedResults)) throw new ApiError(502, "OCR nie odczytał całego dokumentu. Spróbuj mniejszego lub wyraźniejszego pliku albo opracuj go ręcznie.");
    const rawText = data.ParsedResults.map((r: { ParsedText?: string }) => r.ParsedText || "").join("\n").slice(0, 100000);
    await prisma.expenseScan.update({ where: claim, data: { rawText, status: "needs_review", processedAt: new Date(), version: { increment: 1 }, confidence: null } });
    return json({ ok: true });
  } catch (e) {
    if (claim) await prisma.expenseScan.updateMany({ where: claim, data: { status: "failed", errorMessage: "Rozpoznawanie nie powiodło się. Ponów OCR lub opracuj ręcznie." } }).catch(() => undefined);
    return handleApiError(e);
  }
}
