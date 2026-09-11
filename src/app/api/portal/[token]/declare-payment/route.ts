import { prisma } from "@/lib/db";
import { json, handleApiError, readJson } from "@/lib/api";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ token: string }>;
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const { token } = await context.params;
    const body = await readJson(req);

    const declaredDate = typeof body.declaredDate === "string" ? body.declaredDate.trim() : "";
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!declaredDate) {
      return json({ error: "Podaj planowaną datę zapłaty." }, { status: 400 });
    }

    const invoice = await prisma.invoice.findFirst({
      where: {
        OR: [{ shareToken: token }, { id: token }],
      },
    });

    if (!invoice) {
      return json({ error: "Nie znaleziono dokumentu." }, { status: 404 });
    }

    const contractor = await prisma.contractor.findUnique({
      where: { id: invoice.contractorId },
    });

    const clientName = contractor?.name || "Kontrahent (Portal)";
    const message = `Zadeklarowano płatność na dzień: ${declaredDate}${note ? ` (Wiadomość: "${note}")` : ""}`;

    // Zapisz deklarację na fakturze oraz w komentarzach
    await Promise.all([
      prisma.invoice.update({
        where: { id: invoice.id },
        data: { declaredPaymentDate: declaredDate },
      }),
      prisma.documentComment.create({
        data: {
          userId: invoice.userId,
          authorName: clientName,
          authorRole: "client",
          docType: "invoice",
          docId: invoice.id,
          invoiceId: invoice.id,
          message,
        },
      }),
    ]);

    return json({ success: true, message: "Pomyślnie zgłoszono planowaną datę płatności." });
  } catch (e) {
    return handleApiError(e);
  }
}
