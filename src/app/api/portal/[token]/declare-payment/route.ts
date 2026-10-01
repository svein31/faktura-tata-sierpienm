import { isIsoCalendarDate } from "@/lib/nbp";
import { prisma } from "@/lib/db";
import { json, handleApiError, readJson, cleanStr } from "@/lib/api";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ token: string }>;
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const { token } = await context.params;
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) return json({ error: "Nie znaleziono dokumentu." }, { status: 404 });
    const body = await readJson(req);

    const declaredDate = cleanStr(body.declaredDate, 10, "declaredDate");
    const note = cleanStr(body.note, 2000, "note");

    if (!isIsoCalendarDate(declaredDate)) {
      return json({ error: "Podaj prawidłową planowaną datę zapłaty." }, { status: 400 });
    }

    const invoice = await prisma.invoice.findFirst({
      where: {
        shareToken: token,
        type: "sale",
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
    await prisma.$transaction(async tx => {
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { declaredPaymentDate: declaredDate },
      });
      await tx.documentComment.create({
        data: {
          userId: invoice.userId,
          authorName: clientName,
          authorRole: "client",
          docType: "invoice",
          docId: invoice.id,
          invoiceId: invoice.id,
          message,
        },
      });
    });

    return json({ success: true, message: "Pomyślnie zgłoszono planowaną datę płatności." });
  } catch (e) {
    return handleApiError(e);
  }
}
