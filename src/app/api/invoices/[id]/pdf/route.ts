import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { handleApiError, json } from "@/lib/api";
import { invoiceToDto, contractorToDto, companyProfileToDto } from "@/lib/dto";
import { generateInvoicePdfBuffer } from "@/lib/pdf/generate-invoice-pdf";

export const runtime = "nodejs";

type Ctx = { params: { id: string } };

/**
 * GET /api/invoices/[id]/pdf — Generuje i zwraca plik PDF faktury z kodem QR CIRFMF
 */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });
    }

    if (!/^[0-9a-fA-F]{24}$/.test(params.id)) {
      return json({ error: "Nie znaleziono faktury.", code: "NOT_FOUND" }, { status: 404 });
    }

    const invoiceRecord = await prisma.invoice.findFirst({
      where: { id: params.id, userId: user.id },
      include: { sellerCompany: true },
    });

    if (!invoiceRecord) {
      return json({ error: "Nie znaleziono faktury.", code: "NOT_FOUND" }, { status: 404 });
    }

    const invoiceDto = invoiceToDto(invoiceRecord);

    let contractorDto = undefined;
    if (invoiceRecord.contractorId) {
      const contractorRecord = await prisma.contractor.findFirst({
        where: { id: invoiceRecord.contractorId, userId: user.id },
      });
      if (contractorRecord) {
        contractorDto = contractorToDto(contractorRecord);
      }
    }

    let companyDto = undefined;
    if (invoiceRecord.sellerCompany) {
      companyDto = companyProfileToDto(invoiceRecord.sellerCompany);
    } else {
      const defaultCompany = await prisma.companyProfile.findFirst({
        where: { userId: user.id, isDefault: true },
      });
      if (defaultCompany) {
        companyDto = companyProfileToDto(defaultCompany);
      }
    }

    const pdfBuffer = await generateInvoicePdfBuffer(invoiceDto, contractorDto, companyDto);

    const safeFilename = `faktura-${invoiceRecord.number.replace(/[^a-zA-Z0-9._-]/g, "_")}.pdf`;

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${safeFilename}"`,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
