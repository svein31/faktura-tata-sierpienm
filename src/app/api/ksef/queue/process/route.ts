import { reconcileKsefInvoice } from "@/lib/ksef/reconcile-status";
import { processKsefAutoEmails, triggerAutoEmailOnKsef } from "@/lib/email/auto-send";
import { requireCompanyAccess } from "@/lib/permissions";
import { invoiceToDto } from "@/lib/dto";
import { prisma } from "@/lib/db";
import { claimKsefTransmission } from "@/lib/ksef/transmission-claim";
import { ApiError } from "@/lib/api";
import { handleApiError, json } from "@/lib/api";
import { KsefClient, buildFa3Xml, validateFa3Xml, generateDemoUpoXml } from "@/lib/ksef/index";
import { companyProfileToDto, companyToDto } from "@/lib/dto";
import type { CompanyProfile, Contractor, Invoice } from "@/lib/types";

export const runtime = "nodejs";

/**
 * POST /api/ksef/queue/process — Przetwarza oczekujące zadania w kolejce KSeF (worker/cron)
 */
export async function POST(req: Request) {
  try {
    if (process.env.KSEF_PAUSE_DISPATCH === "true") {
      return json(
        {
          message: "Kolejka KSeF jest tymczasowo wstrzymana przez administratora (KSEF_PAUSE_DISPATCH=true).",
          processed: 0,
          paused: true,
        },
        { status: 503 }
      );
    }

    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET || process.env.KSEF_QUEUE_SECRET;
    
    const isCron = Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);
    const { getSessionUser } = await import("@/lib/auth");
    const user = isCron ? null : await getSessionUser();
    if (!isCron && !user) return json({ error: "Nieautoryzowany." }, { status: 401 });

    const now = new Date();

    // An expired sending lease is ambiguous: require reconciliation, never blind resend.
    const abandoned = await prisma.ksefQueueTask.findMany({ where: {
      ...(!isCron ? { userId: user!.id } : {}), status: "processing", lockedUntil: { lt: now },
    }, take: 50 });
    for (const task of abandoned) {
      await prisma.$transaction(async (tx) => {
        const updated = await tx.ksefQueueTask.updateMany({ where: { id: task.id, status: "processing", lockedUntil: { lt: now } },
          data: { status: "verify_needed", lockedUntil: null, errorDetails: "Przerwane przetwarzanie: zweryfikuj wynik w KSeF przed ponowieniem." } });
        if (updated.count) await tx.invoice.update({ where: { id: task.invoiceId }, data: { ksefStatus: "verify_needed" } });
      });
    }

    // Confirm ambiguous transmissions and fetch delayed UPO without ever re-enqueueing a send.
    const verification = await prisma.invoice.findMany({ where: {
      ...(!isCron ? { userId: user!.id } : {}),
      referenceNumber: { not: null },
      updatedAt: { lt: new Date(now.getTime() - 30000) },
      OR: [{ ksefStatus: "verify_needed" }, { ksefStatus: "accepted", OR: [{ upoXml: null }, { upoXml: { isSet: false } }] }],
    }, include: { sellerCompany: true, ksefSession: true }, orderBy: { updatedAt: "asc" }, take: 3 });
    for (const invoice of verification) {
      const claimedCheck = await prisma.invoice.updateMany({ where: { id: invoice.id, updatedAt: invoice.updatedAt }, data: { updatedAt: now } });
      if (!claimedCheck.count) continue;
      const previousTask = await prisma.ksefQueueTask.findFirst({ where: { invoiceId: invoice.id }, orderBy: { createdAt: "desc" }, select: { userId: true } });
      const actorId = previousTask?.userId || invoice.ksefSession?.userId || invoice.userId;
      if (invoice.sellerCompanyId) {
        const access = await requireCompanyAccess(actorId, invoice.sellerCompanyId, "canSendKsef");
        if (!access.ok) continue;
      }
      try { await reconcileKsefInvoice(invoice, { id: actorId }); }
      catch { /* Keep verification required when MF/session is unavailable; never resend. */ }
    }

    // Pobierz do 10 zadań oczekujących
    const tasks = await prisma.ksefQueueTask.findMany({
      where: {
        ...(!isCron ? { userId: user!.id } : {}),
        status: "queued",
        OR: [
          { nextAttemptAt: null },
          { nextAttemptAt: { isSet: false } },
          { nextAttemptAt: { lte: now } },
        ],
        AND: [
          {
            OR: [
              { lockedUntil: null },
              { lockedUntil: { isSet: false } },
              { lockedUntil: { lt: now } },
            ],
          },
        ],
      },
      take: 10,
      include: {
        invoice: {
          include: { sellerCompany: true },
        },
        user: true,
      },
    });

    const results: Array<{ taskId: string; invoiceId: string; status: string; message: string }> = [];

    for (const task of tasks) {
      // Zablokuj zadanie na czas przetwarzania (5 minut)
      const claimed = await prisma.ksefQueueTask.updateMany({
        where: { id: task.id, status: "queued" },
        data: {
          status: "processing",
          lockedUntil: new Date(Date.now() + 5 * 60_000),
          attempts: { increment: 1 },
          lastAttemptAt: now,
        },
      });

      if (claimed.count !== 1) continue;
      const invoice = task.invoice;
      if (!invoice) {
        await prisma.ksefQueueTask.update({
          where: { id: task.id },
          data: { status: "failed", errorDetails: "Faktura nie istnieje." },
        });
        results.push({ taskId: task.id, invoiceId: task.invoiceId, status: "failed", message: "Faktura usunięta" });
        continue;
      }

      // Jeśli faktura została już zarejestrowana
      if (invoice.ksefNumber) {
        await prisma.ksefQueueTask.update({
          where: { id: task.id },
          data: { status: "completed", lockedUntil: null },
        });
        results.push({ taskId: task.id, invoiceId: invoice.id, status: "completed", message: "Faktura już posiada numer KSeF" });
        continue;
      }

      if (invoice.sellerCompanyId) {
        const access = await requireCompanyAccess(task.userId, invoice.sellerCompanyId, "canSendKsef");
        if (!access.ok) {
          await prisma.ksefQueueTask.update({ where: { id: task.id }, data: { status: "failed", lockedUntil: null, errorDetails: access.error } });
          results.push({ taskId: task.id, invoiceId: invoice.id, status: "failed", message: access.error });
          continue;
        }
      }
      if (invoice.isProforma || invoice.type === "purchase") {
        await prisma.ksefQueueTask.update({ where: { id: task.id }, data: { status: "failed", lockedUntil: null, errorDetails: "Ten dokument nie podlega wysyłce." } });
        continue;
      }
      const env = (task.environment || "test") as any;

      // ── TRYB DEMO ──
      if (env === "demo") {
        const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
        const rand = Math.random().toString(16).slice(2, 8).toUpperCase();
        const sellerNip = invoice.nip?.replace(/\D/g, "") || "5260301706";
        const ksefNumber = `${sellerNip}-${ymd}-${rand}-11`;
        const elemRef = `${ymd}-EE-${rand}0000-B67F415CDC-2C`;
        const upoXml = generateDemoUpoXml(elemRef, ksefNumber);

        try {
        await prisma.$transaction(async tx => {
        await claimKsefTransmission(tx, { invoiceId: invoice.id, version: invoice.version, userId: task.userId, taskId: task.id });
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            status: "ksef_active",
            documentStatus: "accepted",
            ksefStatus: "accepted",
            referenceNumber: elemRef,
            ksefNumber,
            upoXml,
            sentAt: now,
          },
        });

        await tx.ksefQueueTask.update({
          where: { id: task.id },
          data: { status: "completed", lockedUntil: null },
        });
        });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Nie można rozpocząć wysyłki.";
          await prisma.ksefQueueTask.update({ where: { id: task.id }, data: { status: "failed", lockedUntil: null, errorDetails: message } });
          results.push({ taskId: task.id, invoiceId: invoice.id, status: "failed", message });
          continue;
        }

        results.push({ taskId: task.id, invoiceId: invoice.id, status: "completed", message: "Zarejestrowano w demo KSeF" });
        continue;
      }

      // ── TRYB TEST / PRODUKCJA ──
      let submissionStarted = false;
      try {
        const client = new KsefClient({ environment: env });

        // Jeśli faktura ma już numer referencyjny sesji KSeF, najpierw sprawdzamy jej status
        // zamiast wysyłać ponownie (ochrona przed duplikatem)
        if (invoice.referenceNumber) {
          const ksefJson = (invoice.ksef as any) || {};
          const sessionRef = ksefJson.sessionReferenceNumber;

          let accessToken = "";
          const activeSession = await prisma.ksefSession.findFirst({
            where: {
              environment: env,
              userId: task.userId,
              nip: (invoice.sellerCompany?.nip || invoice.nip || "").replace(/\D/g, ""),
              status: "ACTIVE",
              validUntil: { gt: new Date() },
            },
            orderBy: { createdAt: "desc" },
          });
          accessToken = activeSession?.accessToken || "";

          if (accessToken && sessionRef) {
            const statusRes = await client.getInvoiceStatus(accessToken, sessionRef, invoice.referenceNumber);

            if (statusRes.status === "ACCEPTED" && statusRes.ksefReferenceNumber) {
              await prisma.invoice.update({
                where: { id: invoice.id },
                data: {
                  status: "ksef_active",
                  documentStatus: "accepted",
                  ksefStatus: "accepted",
                  ksefNumber: statusRes.ksefReferenceNumber,
                  upoXml: statusRes.upoXml,
                  ksef: { ...ksefJson, environment: env, number: statusRes.ksefReferenceNumber, status: "ACTIVE" },
                },
              });

              await prisma.ksefQueueTask.update({
                where: { id: task.id },
                data: { status: "completed", lockedUntil: null },
              });

              if (invoice.autoSendEmailOnKsef && statusRes.upoXml) await triggerAutoEmailOnKsef(invoice.id);

              results.push({ taskId: task.id, invoiceId: invoice.id, status: "completed", message: "Potwierdzono w KSeF (kod 200)" });
              continue;
            } else if (statusRes.status === "REJECTED") {
              await prisma.invoice.update({
                where: { id: invoice.id },
                data: {
                  status: "ksef_rejected",
                  documentStatus: "rejected",
                  ksefStatus: "rejected",
                },
              });

              await prisma.ksefQueueTask.update({
                where: { id: task.id },
                data: {
                  status: "failed",
                  lockedUntil: null,
                  errorDetails: statusRes.processingDescription || "Odrzucono przez KSeF",
                },
              });

              results.push({ taskId: task.id, invoiceId: invoice.id, status: "failed", message: "Odrzucono przez KSeF" });
              continue;
            }
          }
          // Pending or unavailable status must never fall through to sendInvoiceEncrypted.
          if (!accessToken || !sessionRef || task.attempts + 1 >= task.maxAttempts) {
            await prisma.$transaction([
              prisma.ksefQueueTask.update({ where: { id: task.id }, data: { status: "verify_needed", lockedUntil: null, errorDetails: "Nie można potwierdzić poprzedniej wysyłki. Wymagana weryfikacja KSeF." } }),
              prisma.invoice.update({ where: { id: invoice.id }, data: { ksefStatus: "verify_needed" } }),
            ]);
          } else {
            await prisma.ksefQueueTask.update({ where: { id: task.id }, data: { status: "queued", lockedUntil: null, nextAttemptAt: new Date(Date.now() + 30_000) } });
          }
          results.push({ taskId: task.id, invoiceId: invoice.id, status: "waiting_for_status", message: "Sprawdzono status bez ponownej wysyłki." });
          continue;
        }

        // Przygotowanie XML jeśli jeszcze nie został wysłany
        let xml = invoice.ksefXml || "";
        if (!xml) {
          let sellerProfile: CompanyProfile | null = null;
          if (invoice.sellerCompany) {
            sellerProfile = companyProfileToDto(invoice.sellerCompany);
          } else {
            const defComp = await prisma.companyProfile.findFirst({
              where: { userId: invoice.userId },
              orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
            });
            if (defComp) sellerProfile = companyProfileToDto(defComp);
            else {
              const legacy = await prisma.companySettings.findUnique({ where: { userId: invoice.userId } });
              if (legacy) sellerProfile = companyToDto(legacy);
            }
          }

          let buyerContractor: Contractor | null = null;
          if (invoice.contractorId) {
            const c = await prisma.contractor.findUnique({ where: { id: invoice.contractorId } });
            if (c) {
              buyerContractor = {
                id: c.id,
                name: c.name,
                nip: c.nip,
                regon: c.regon || undefined,
                address: c.address as any,
                email: c.email || undefined,
                phone: c.phone || undefined,
                isVatPayer: c.isVatPayer,
                createdAt: c.createdAt.toISOString(),
              };
            }
          }

          const invoiceData: Invoice = invoiceToDto(invoice);

          if (sellerProfile) {
            xml = buildFa3Xml({ invoice: invoiceData, seller: sellerProfile, buyer: buyerContractor });
          }
        }

        const val = validateFa3Xml(xml);
        if (invoice.isOffline && (!invoice.qrCodeI || !invoice.qrCodeII || !invoice.ksefXml || xml !== invoice.ksefXml)) {
          await prisma.ksefQueueTask.update({ where: { id: task.id }, data: { status: "failed", lockedUntil: null, errorDetails: "Brak podpisanych kodów offline lub niezgodny XML." } });
          results.push({ taskId: task.id, invoiceId: invoice.id, status: "failed", message: "Nieprawidłowy dokument offline" });
          continue;
        }
        if (!val.ok) {
          const errs = val.issues.map((i) => `[${i.path}] ${i.message}`).join("; ");
          await prisma.ksefQueueTask.update({
            where: { id: task.id },
            data: { status: "failed", errorDetails: `Błąd walidacji FA(3): ${errs}`, lockedUntil: null },
          });
          results.push({ taskId: task.id, invoiceId: invoice.id, status: "failed", message: "Błąd walidacji FA(3)" });
          continue;
        }

        // Ustal token KSeF
        const sellerNip = (invoice.sellerCompany?.nip || invoice.nip || process.env.KSEF_NIP || "").replace(/\D/g, "");
        const ksefToken = (invoice.sellerCompany?.ksefToken || "").trim();

        if (!ksefToken) {
          await prisma.ksefQueueTask.update({
            where: { id: task.id },
            data: {
              status: "failed",
              lockedUntil: null,
              errorDetails: `Brak tokena KSeF dla NIP ${sellerNip}`,
            },
          });
          results.push({ taskId: task.id, invoiceId: invoice.id, status: "failed", message: "Brak tokena KSeF" });
          continue;
        }

        const loginRes = await client.loginWithKsefToken(sellerNip, ksefToken);
        await prisma.ksefSession.upsert({
          where: { referenceNumber: loginRes.referenceNumber },
          create: { userId: task.userId, nip: sellerNip, environment: env, referenceNumber: loginRes.referenceNumber,
            accessToken: loginRes.accessToken, refreshToken: loginRes.refreshToken, validUntil: new Date(loginRes.validUntil), status: "ACTIVE" },
          update: { accessToken: loginRes.accessToken, refreshToken: loginRes.refreshToken, validUntil: new Date(loginRes.validUntil), status: "ACTIVE" },
        });
        await prisma.$transaction(tx => claimKsefTransmission(tx, { invoiceId: invoice.id, version: invoice.version, userId: task.userId, taskId: task.id }));
        submissionStarted = true;
        const onlineSession = await client.openOnlineSession(loginRes.accessToken);
        const sendRes = await client.sendInvoiceEncrypted(
          loginRes.accessToken,
          onlineSession.referenceNumber,
          xml,
          onlineSession.symmetricKey,
          onlineSession.iv,
          Boolean(invoice.isOffline)
        );

        const invoiceRef = sendRes.elementReferenceNumber;

        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            status: "ksef_sent",
            documentStatus: "ready",
            ksefStatus: "sending",
            referenceNumber: invoiceRef,
            ksefNumber: null, // NIE nadajemy numeru KSeF przed UPO
            ksefXml: xml,
            sentAt: now,
            ksef: {
              referenceNumber: invoiceRef,
              sessionReferenceNumber: onlineSession.referenceNumber,
              status: "QUEUED",
              sentAt: now.toISOString(),
              environment: env,
            },
          },
        });

        // Zadanie pozostaje w kolejce do sprawdzenia statusu za 30 sekund
        await prisma.ksefQueueTask.update({
          where: { id: task.id },
          data: {
            status: "queued",
            lockedUntil: null,
            nextAttemptAt: new Date(Date.now() + 30_000),
          },
        });

        results.push({ taskId: task.id, invoiceId: invoice.id, status: "sending", message: "Wysłano do KSeF, oczekiwanie na UPO" });
      } catch (procErr: any) {
        const errorMsg = procErr?.message || String(procErr);
        const nextAttempts = task.attempts + 1;
        if (!submissionStarted && procErr instanceof ApiError) {
          await prisma.ksefQueueTask.update({ where: { id: task.id }, data: { status: "failed", lockedUntil: null, errorDetails: errorMsg } });
          results.push({ taskId: task.id, invoiceId: invoice.id, status: "failed", message: errorMsg });
          continue;
        }

        if (submissionStarted || nextAttempts >= task.maxAttempts) {
          await prisma.ksefQueueTask.update({
            where: { id: task.id },
            data: {
              status: "verify_needed",
              lockedUntil: null,
              errorDetails: errorMsg,
            },
          });
          await prisma.invoice.update({
            where: { id: invoice.id },
            data: { ksefStatus: "verify_needed" },
          });
          results.push({ taskId: task.id, invoiceId: invoice.id, status: "verify_needed", message: errorMsg });
        } else {
          // Wykładniczy backoff: 30s * 2^attempts
          const delaySec = Math.min(30 * Math.pow(2, nextAttempts - 1), 600);
          await prisma.ksefQueueTask.update({
            where: { id: task.id },
            data: {
              status: "queued",
              lockedUntil: null,
              nextAttemptAt: new Date(Date.now() + delaySec * 1000),
              errorDetails: errorMsg,
            },
          });
          results.push({ taskId: task.id, invoiceId: invoice.id, status: "retry_scheduled", message: errorMsg });
        }
      }
    }

    // Email retries remain independent of the KSeF transmission queue, including when it is empty.
    const autoEmail = await processKsefAutoEmails(isCron ? undefined : user!.id);
    return json({
      success: true,
      processedCount: results.length,
      results,
      autoEmail,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
