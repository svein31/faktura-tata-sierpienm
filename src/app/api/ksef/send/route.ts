import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson, str } from "@/lib/api";
import { invoiceToDto, notificationToDto } from "@/lib/dto";

export const runtime = "nodejs";

/**
 * POST /api/ksef/send — wysyłka e-Faktury do KSeF (TRYB DEMO).
 *
 * Wymaga uwierzytelnienia; zapisuje status KSeF na fakturze użytkownika.
 * Produkcyjna wysyłka wymaga tokena sesji MF, certyfikatu (p12) i środowiska
 * MF — patrz README („KSeF w produkcji"). W tej wersji zawsze symulacja demo,
 * dopóki KSEF_ENVIRONMENT != demo (wtedy zwraca jasny komunikat).
 */
export async function POST(req: Request) {
  try {
    const session = await getSessionUser();
    if (!session) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const body = await readJson(req);
    const xml = str(body.xml).trim();
    const environment = str(body.environment) || "demo";
    const invoiceId = str(body.invoiceId);
    const invoiceNumber = str(body.invoiceNumber);

    if (!xml || !xml.includes("<Faktura")) {
      throw new ApiError(400, "Brak prawidłowego dokumentu XML FA(2).");
    }
    if (!["demo", "test", "production"].includes(environment)) {
      throw new ApiError(400, "Nieprawidłowe środowisko KSeF.");
    }

    const invoice = await prisma.invoice.findFirst({
      where: {
        userId: session.id,
        OR: invoiceId ? [{ id: invoiceId }] : invoiceNumber ? [{ number: invoiceNumber }] : undefined,
      },
    });
    if (!invoice) throw new ApiError(404, "Nie znaleziono faktury do wysyłki.");

    if (environment !== "demo") {
      return json({
        success: false,
        demo: true,
        message:
          "Środowisko „" +
          environment +
          "” wymaga prawdziwej integracji MF (token sesji, certyfikat p12, wpis do KSeF). W tej wersji dostępna jest tylko symulacja demo — ustaw środowisko na „demo”.",
      });
    }

    const now = new Date();
    const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const rand = Math.random().toString(16).slice(2, 8).toUpperCase();
    const seq = invoice.number.replace(/[^0-9]/g, "").slice(-4) || rand.slice(0, 4);
    const ksefNumber = `eFA/DEMO/${ymd}/${seq}-${rand}`;
    const sentAt = now.toISOString();

    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: "ksef_sent",
        ksef: { number: ksefNumber, status: "ACTIVE", sentAt, environment: "demo" },
      },
    });

    await prisma.notification.create({
      data: {
        userId: session.id,
        kind: "ksef_status",
        title: `Faktura ${updated.number} wysłana do KSeF`,
        body: `Numer KSeF (demo): ${ksefNumber}`,
        link: `/invoices/${updated.id}`,
        read: false,
      },
    });

    return json({
      success: true,
      demo: true,
      ksefNumber,
      status: "ACTIVE",
      timestamp: sentAt,
      message: `Dokument zaakceptowany w KSeF (symulacja demo). Numer KSeF: ${ksefNumber}`,
      environment: "demo",
      invoice: invoiceToDto(updated),
    });
  } catch (e) {
    return handleApiError(e);
  }
}
