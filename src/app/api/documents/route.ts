import { scanDocument } from "@/lib/document-safety";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json } from "@/lib/api";
import { documentIdentity, documentMime, inboxAccess, MAX_DOCUMENT_BYTES } from "@/lib/document-inbox";
import { objectId } from "@/lib/company-scope";
import { recordAuditLog } from "@/lib/audit";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const user = await getSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const url = new URL(req.url), companyId = await inboxAccess(user.id, url.searchParams.get("companyId"));
    const cursor = url.searchParams.get("cursor"), search = (url.searchParams.get("search") || "").slice(0, 100);
    if (cursor && !objectId(cursor)) throw new ApiError(400, "Nieprawidłowy kursor.");
    const anchor = cursor ? await prisma.expenseScan.findFirst({ where: { id: cursor, companyId }, select: { id: true, createdAt: true } }) : null;
    if (cursor && !anchor) throw new ApiError(400, "Odśwież listę dokumentów.");
    const rows = await prisma.expenseScan.findMany({ where: { companyId, ...(search ? { fileName: { contains: search, mode: "insensitive" } } : {}), ...(anchor ? { OR: [{ createdAt: { lt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { lt: anchor.id } }] } : {}) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 31, select: { id: true, fileName: true, mimeType: true, sizeBytes: true, status: true, createdAt: true, expenseId: true, version: true, errorMessage: true, safetyStatus: true, safetyReason: true } });
    return json({ documents: rows.slice(0,30), nextCursor: rows.length > 30 ? rows[29].id : null, scannerConfigured: Boolean(process.env.DOCUMENT_SCAN_URL && process.env.DOCUMENT_SCAN_TOKEN), ocrAvailable: Boolean(process.env.OCR_SPACE_API_KEY) });
  } catch (e) { return handleApiError(e); }
}
export async function POST(req: Request) {
  try {
    const user = await getSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const companyId = await inboxAccess(user.id, new URL(req.url).searchParams.get("companyId"), true);
    // Bound the request before multipart parsing, including chunked requests.
    const reader = req.body?.getReader(); if (!reader) throw new ApiError(400, "Brak pliku.");
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_DOCUMENT_BYTES + 65536) { await reader.cancel(); throw new ApiError(413, "Plik przekracza limit 3 MB."); } chunks.push(value); }
    const form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": req.headers.get("content-type") || "" } }).formData();
    const file = form.get("file"); if (!(file instanceof File)) throw new ApiError(400, "Wybierz plik.");
    const bytes = Buffer.from(await file.arrayBuffer()), mimeType = documentMime(bytes), identity = documentIdentity(companyId, bytes);
    const existing = await prisma.expenseScan.findUnique({ where: { id: identity.id } });
    if (existing) return json({ id: existing.id, duplicate: true });
    const safety = await scanDocument(bytes);
    const count = await prisma.expenseScan.count({ where: { companyId, createdAt: { gte: new Date(Date.now() - 86400000) } } });
    if (count >= 100) throw new ApiError(429, "Osiągnięto dzienny limit 100 dokumentów firmy.");
    await prisma.$transaction(async tx => {
      // This company mutex also serializes concurrent quota claims.
      await tx.companyProfile.update({ where: { id: companyId }, data: { updatedAt: new Date() } });
      const [daily, storage] = await Promise.all([
        tx.expenseScan.count({ where: { companyId, createdAt: { gte: new Date(Date.now() - 86400000) } } }),
        tx.expenseScan.aggregate({ where: { companyId }, _sum: { sizeBytes: true } }),
      ]);
      if (daily >= 100) throw new ApiError(429, "Dzienny limit firmy: 100 dokumentów.");
      if ((storage._sum.sizeBytes || 0) + bytes.length > 500 * 1024 * 1024) throw new ApiError(413, "Skrzynka osiągnęła limit 500 MB. Skontaktuj się z operatorem.");
      await tx.expenseScan.create({ data: { ...identity, ...safety, companyId, userId: user.id, fileName: file.name.replace(/[\x00-\x1f/\\]/g, "_").slice(0, 200), mimeType, sizeBytes: bytes.length, imageData: `data:${mimeType};base64,${bytes.toString("base64")}`, captureSource: "upload", status: "needs_review", provider: "manual" } });
      await recordAuditLog({ client: tx, companyId, userId: user.id, entityType: "expense_scan", entityId: identity.id, action: "document.uploaded", details: { sha256: identity.sha256, sizeBytes: bytes.length, mimeType } });
    });
    return json({ id: identity.id, duplicate: false, safetyStatus: safety.safetyStatus, safetyReason: safety.safetyReason }, { status: 201 });
  } catch (e) { return handleApiError(e); }
}
