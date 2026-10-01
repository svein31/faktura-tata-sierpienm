import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { assertObjectId, ApiError, handleApiError } from "@/lib/api";
import { inboxAccess } from "@/lib/document-inbox";
import { objectId } from "@/lib/company-scope";
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    assertObjectId((await context.params).id); if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const { id } = await context.params; if (!objectId(id)) throw new ApiError(404, "Nie znaleziono dokumentu.");
    const doc = await prisma.expenseScan.findUnique({ where: { id } }); if (!doc?.imageData) throw new ApiError(404, "Nie znaleziono dokumentu.");
    await inboxAccess(user.id, doc.companyId);
    const bytes = Buffer.from(doc.imageData.slice(doc.imageData.indexOf(",") + 1), "base64");
    return new Response(bytes, { headers: { "Content-Type": doc.mimeType, "Content-Length": String(bytes.length), "Content-Disposition": `inline; filename="document.${doc.mimeType === "application/pdf" ? "pdf" : doc.mimeType === "image/png" ? "png" : "jpg"}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'; frame-ancestors 'self'" } });
  } catch (e) { return handleApiError(e); }
}
