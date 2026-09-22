import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json } from "@/lib/api";
import { companyAccess } from "@/lib/company-write";
import { objectId } from "@/lib/company-scope";
import { invoicePdf } from "@/lib/pdf/invoice-print";
export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };
export async function GET(req: Request, { params }: Ctx) {
  try {
    const user = await getSessionUser(); if (!user) throw new ApiError(401, "Nieautoryzowany.");
    const { id } = await params;
    if (!objectId(id)) throw new ApiError(404, "Nie znaleziono faktury.");
    const invoice = await prisma.invoice.findUnique({ where: { id }, select: { userId: true, sellerCompanyId: true } });
    if (!invoice) throw new ApiError(404, "Nie znaleziono faktury.");
    if (invoice.sellerCompanyId) await companyAccess(prisma, user.id, invoice.sellerCompanyId);
    else if (invoice.userId !== user.id) throw new ApiError(404, "Nie znaleziono faktury.");
    const query = new URL(req.url).searchParams, version = query.get("version");
    if (version && !objectId(version)) throw new ApiError(400, "Nieprawidłowa wersja PDF.");
    if (query.get("history") === "1") {
      const cursor = query.get("cursor");
      if (cursor && !objectId(cursor)) throw new ApiError(400, "Nieprawidłowa strona.");
      const anchor = cursor ? await prisma.invoicePrintVersion.findFirst({ where: { id: cursor, invoiceId: id }, select: { createdAt: true } }) : null;
      if (cursor && !anchor) throw new ApiError(400, "Nieprawidłowa strona.");
      const versions = await prisma.invoicePrintVersion.findMany({ where: { invoiceId: id, ...(anchor ? { OR: [{ createdAt: { lt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { lt: cursor! } }] } : {}) }, select: { id: true, sourceVersion: true, createdAt: true, pdfSha256: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 31 });
      const context = await prisma.invoicePrintContext.findUnique({ where: { id }, select: { captureReason: true, createdAt: true } });
      return json({ versions: versions.slice(0, 30), nextCursor: versions.length > 30 ? versions[29].id : null, context });
    }
    const pdf = await invoicePdf(id, version || undefined);
    const filename = `faktura-${pdf.number.replace(/[^a-zA-Z0-9._-]/g, "_")}.pdf`;
    return new Response(new Uint8Array(pdf.buffer), { headers: {
      "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
      ...(pdf.versionId ? { "X-PDF-Version": pdf.versionId } : {}), ...(pdf.sha256 ? { "X-PDF-SHA256": pdf.sha256 } : {}),
    } });
  } catch (e) { return handleApiError(e); }
}
