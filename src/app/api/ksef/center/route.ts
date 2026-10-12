import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson } from "@/lib/api";
import { companyAccess, companyWriteAccess } from "@/lib/company-write";
import { certificateNotice, inspectPublicCertificate, latarniaStatus, stuckKsefTask } from "@/lib/ksef/center";
import { recordAuditLog } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function access(companyId: unknown) {
  const user = await getSessionUser();
  if (!user) throw new ApiError(401, "Nieautoryzowany.");
  const { company } = await companyAccess(prisma, user.id, companyId, "canSendKsef");
  return { company, user };
}

export async function GET(req: Request) {
  try {
    const { company } = await access(new URL(req.url).searchParams.get("companyId"));
    const [profile, settings, tasks, grouped] = await Promise.all([
      prisma.companyProfile.findUniqueOrThrow({ where: { id: company.id }, select: { ksefCertValidFrom: true, ksefCertValidTo: true, ksefCertCheckedAt: true, ksefCertFingerprint: true } }),
      prisma.ksefSettings.findUnique({ where: { userId: company.userId }, select: { environment: true } }),
      prisma.ksefQueueTask.findMany({
        where: { invoice: { sellerCompanyId: company.id }, status: { in: ["queued", "processing", "failed", "verify_needed"] } },
        select: { id: true, status: true, attempts: true, maxAttempts: true, invoiceId: true, invoice: { select: { number: true } }, lockedUntil: true, nextAttemptAt: true, updatedAt: true },
        orderBy: { updatedAt: "desc" }, take: 40,
      }),
      prisma.ksefQueueTask.groupBy({ by: ["status"], where: { invoice: { sellerCompanyId: company.id } }, _count: { _all: true } }),
    ]);
    const environment = settings?.environment === "test" ? "test" : "production";
    const official = await latarniaStatus(environment);
    const now = new Date();
    return json({
      checkedAt: now.toISOString(), environment: settings?.environment || "demo",
      official: { ...official, environment, source: "https://github.com/CIRFMF/ksef-latarnia" },
      certificate: {
        validFrom: profile.ksefCertValidFrom?.toISOString() || null,
        validTo: profile.ksefCertValidTo?.toISOString() || null,
        checkedAt: profile.ksefCertCheckedAt?.toISOString() || null,
        fingerprintEnd: profile.ksefCertFingerprint?.slice(-8) || null,
        notice: certificateNotice(profile.ksefCertValidTo, now),
        source: "public_certificate_unverified",
      },
      counts: Object.fromEntries(grouped.map(row => [row.status, row._count._all])),
      tasks: tasks.map(task => ({
        id: task.id, invoiceId: task.invoiceId, number: task.invoice.number,
        status: task.status, attempts: task.attempts, maxAttempts: task.maxAttempts,
        updatedAt: task.updatedAt.toISOString(), nextAttemptAt: task.nextAttemptAt?.toISOString() || null,
        stuck: stuckKsefTask(task, now),
        nextStep: task.status === "verify_needed" ? "Sprawdź wynik w KSeF. Nie wysyłaj ponownie bez uzgodnienia."
          : task.status === "failed" ? "Sprawdź fakturę i szczegóły błędu."
          : stuckKsefTask(task, now) ? "Zadanie jest opóźnione. Sprawdź działanie pracownika kolejki."
          : "Zadanie oczekuje na przetworzenie.",
      })),
      limited: tasks.length === 40,
    });
  } catch (error) { return handleApiError(error); }
}

export async function POST(req: Request) {
  try {
    if (Number(req.headers.get("content-length") || 0) > 48000) throw new ApiError(413, "Plik jest za duży.");
    const body = await readJson(req);
    const { company, user } = await access(body.companyId);
    if (body.action !== "upload" && body.action !== "clear") throw new ApiError(400, "Nieprawidłowa operacja.");
    const certificate = body.action === "upload" ? inspectPublicCertificate(body.certificateBase64) : null;
    const result = await prisma.$transaction(async tx => {
      await companyWriteAccess(tx, user.id, company.id, "canSendKsef");
      const updated = await tx.companyProfile.update({ where: { id: company.id }, data: {
        ksefCertFingerprint: certificate?.fingerprint || null,
        ksefCertValidFrom: certificate?.validFrom || null,
        ksefCertValidTo: certificate?.validTo || null,
        ksefCertCheckedAt: certificate ? new Date() : null,
      } });
      await recordAuditLog({ client: tx, companyId: company.id, userId: user.id, userName: user.name, userEmail: user.email,
        action: body.action === "upload" ? "ksef.certificate_metadata_saved" : "ksef.certificate_metadata_cleared",
        entityType: "companyProfile", entityId: company.id,
        details: { validTo: updated.ksefCertValidTo?.toISOString() || null, fingerprintEnd: updated.ksefCertFingerprint?.slice(-8) || null },
      });
      return updated;
    });
    return json({ certificate: {
      validFrom: result.ksefCertValidFrom?.toISOString() || null,
      validTo: result.ksefCertValidTo?.toISOString() || null,
      checkedAt: result.ksefCertCheckedAt?.toISOString() || null,
      fingerprintEnd: result.ksefCertFingerprint?.slice(-8) || null,
      notice: certificateNotice(result.ksefCertValidTo),
      source: "public_certificate_unverified",
    } });
  } catch (error) { return handleApiError(error); }
}
