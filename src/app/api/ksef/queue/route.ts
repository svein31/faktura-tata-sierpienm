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
    const customIdempotencyKey = str(body.idempotencyKey).trim();

    if (!invoiceId || !/^[0-9a-fA-F]{24}$/.test(invoiceId)) {
      throw new ApiError(400, "Nieprawidłowy identyfikator faktury.");
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, userId: user.id },
    });

    if (!invoice) {
      throw new ApiError(404, "Nie znaleziono faktury.");
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
        userId: user.id,
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

    const idempotencyKey = customIdempotencyKey || `ksef-queue-${invoiceId}-${Date.now()}`;

    const task = await prisma.ksefQueueTask.create({
      data: {
        userId: user.id,
        invoiceId,
        environment,
        status: "queued",
        idempotencyKey,
        nextAttemptAt: new Date(),
      },
    });

    // Zaktualizuj stan faktury na "queued" (w kolejce)
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        ksefStatus: "queued",
        documentStatus: "ready",
      },
    });

    // Zapisz w rejestrze audytowym
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "ksef_queue_enqueued",
        entityType: "invoice",
        entityId: invoiceId,
        details: { taskId: task.id, idempotencyKey, environment },
      },
    });

    return json({
      success: true,
      task,
      message: "Faktura została pomyślnie dodana do kolejki wysyłki KSeF.",
    });
  } catch (e) {
    return handleApiError(e);
  }
}
