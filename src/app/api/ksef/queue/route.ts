import { requireCompanyAccess } from "@/lib/permissions";
import { recordAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson, str } from "@/lib/api";

export const runtime = "nodejs";

/**
 * GET /api/ksef/queue — pobiera listę zadań w kolejce KSeF użytkownika
 */
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const tasks = await prisma.ksefQueueTask.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        invoice: {
          select: {
            id: true,
            number: true,
            issueDate: true,
            ksefStatus: true,
            documentStatus: true,
            ksefNumber: true,
          },
        },
      },
    });

    return json({ tasks });
  } catch (e) {
    return handleApiError(e);
  }
}

/**
 * POST /api/ksef/queue — dodaje fakturę do asynchronicznej kolejki wysyłki KSeF
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const body = await readJson(req);
    const invoiceId = str(body.invoiceId).trim();
    const environment = (str(body.environment) || "test").toLowerCase();
    if (!["demo", "test", "production"].includes(environment)) throw new ApiError(400, "Nieprawidłowe środowisko KSeF.");

    if (!invoiceId || !/^[0-9a-fA-F]{24}$/.test(invoiceId)) {
      throw new ApiError(400, "Nieprawidłowy identyfikator faktury.");
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId },
    });

    if (!invoice) {
      throw new ApiError(404, "Nie znaleziono faktury.");
    }

    if (invoice.sellerCompanyId) {
      const access = await requireCompanyAccess(user.id, invoice.sellerCompanyId, "canSendKsef");
      if (!access.ok) throw new ApiError(access.status, access.error);
    } else if (invoice.userId !== user.id || user.role === "viewer") {
      throw new ApiError(403, "Brak uprawnienia do wysyłki tej faktury.");
    }
    if (invoice.isProforma) throw new ApiError(400, "Proforma nie podlega wysyłce do KSeF.");
    if (invoice.referenceNumber || ["sending", "verify_needed"].includes(invoice.ksefStatus || "")) {
      throw new ApiError(409, "Najpierw zweryfikuj status poprzedniej wysyłki w KSeF.");
    }
    if (invoice.type === "purchase") {
      throw new ApiError(400, "Faktury zakupowe nie podlegają kolejkowaniu do wysyłki KSeF.");
    }

    if (invoice.ksefNumber) {
      throw new ApiError(400, `Faktura posiada już nadany numer KSeF (${invoice.ksefNumber}).`);
    }

    // Sprawdź czy zadanie już istnieje i czeka
    const existingTask = await prisma.ksefQueueTask.findFirst({
      where: {
        invoiceId,
        status: { in: ["queued", "processing"] },
      },
    });

    if (existingTask) {
      return json({
        success: true,
        alreadyQueued: true,
        task: existingTask,
        message: "Faktura już oczekuje w kolejce KSeF.",
      });
    }

    // A stable document/version key closes the race between concurrent enqueue requests.
    const idempotencyKey = `ksef:${invoiceId}:${invoice.version || 1}`;
    let task;
    try {
      task = await prisma.$transaction(async (tx) => {
        const previous = await tx.ksefQueueTask.findUnique({ where: { idempotencyKey } });
        if (previous && previous.status !== "failed") return previous;
        const data = { userId: user.id, environment, status: "queued", nextAttemptAt: new Date(), attempts: 0, lockedUntil: null, errorDetails: null };
        const created = previous
          ? await tx.ksefQueueTask.update({ where: { id: previous.id }, data })
          : await tx.ksefQueueTask.create({ data: { ...data, invoiceId, idempotencyKey } });
        await tx.invoice.update({ where: { id: invoiceId }, data: { ksefStatus: "queued", documentStatus: "ready" } });
        await recordAuditLog({ client: tx, companyId: invoice.sellerCompanyId, documentId: invoiceId,
          userId: user.id, userName: user.name, userEmail: user.email,
          action: "ksef_queue_enqueued", entityType: "invoice", entityId: invoiceId,
          details: { taskId: created.id, idempotencyKey, environment },
        });
        return created;
      });
    } catch (error) {
      // Concurrent MongoDB transactions can report P2034 before the unique index reports P2002.
      if (!["P2002", "P2034"].includes((error as { code?: string }).code || "")) throw error;
      const existing = await prisma.ksefQueueTask.findUnique({ where: { idempotencyKey } });
      if (!existing) throw new ApiError(409, "Równoległe kolejkowanie. Odśwież status faktury.");
      return json({ success: true, alreadyQueued: true, task: existing });
    }

    return json({
      success: true,
      task,
      message: "Faktura została pomyślnie dodana do kolejki wysyłki KSeF.",
    });
  } catch (e) {
    return handleApiError(e);
  }
}

