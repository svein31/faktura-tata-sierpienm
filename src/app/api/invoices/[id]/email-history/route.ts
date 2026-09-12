import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { emailLogToDto } from "@/lib/dto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/invoices/[id]/email-history
 * Zwraca pełną historię wysyłek e-mail dla danej faktury.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id: params.id, userId: user.id },
      select: { id: true },
    });

    if (!invoice) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Faktura nie istnieje lub brak uprawnień." },
        { status: 404 }
      );
    }

    const logs = await prisma.invoiceEmailLog.findMany({
      where: { invoiceId: params.id, userId: user.id },
      orderBy: { sentAt: "desc" },
      include: {
        user: { select: { name: true, email: true } },
      },
    });

    return NextResponse.json({
      logs: logs.map(emailLogToDto),
    });
  } catch (err: any) {
    console.error("GET_EMAIL_HISTORY_ERROR:", err);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: err.message || "Błąd pobierania historii wysyłek." },
      { status: 500 }
    );
  }
}
