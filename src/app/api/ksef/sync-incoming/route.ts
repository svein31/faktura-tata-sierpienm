import { assertAccountingPeriodsOpen } from "@/lib/accounting-period";
import { captureInvoicePrint } from "@/lib/pdf/invoice-print";
import { requireCompanyAccess } from "@/lib/permissions";
import { companyWriteAccess } from "@/lib/company-write";
import { ApiError, handleApiError, json } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { invoiceToDto } from "@/lib/dto";
import { KsefApiError, KsefClient, type KsefInvoiceHeader } from "@/lib/ksef/client";
import type { KsefEnvironment } from "@/lib/ksef/constants";
import { parseFa3IncomingInvoice } from "@/lib/ksef/incomingInvoice";
import { sendEmail } from "@/lib/email/sender";
import { isEmailVerifiedForSending } from "@/lib/email/verification";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const CURSOR_OVERLAP_MS = 5 * 60 * 1000;
const PAGE_SIZE = 100;
const MAX_PAGES = 20;

function asEnvironment(value: string | null | undefined): KsefEnvironment {
  return value === "production" ? "production" : value === "demo" ? "demo" : "test";
}

/** Wyciąga ujednolicony numer KSeF z metadanych faktury (v2: ksefNumber, v1 legacy: ksefReferenceNumber). */
function extractKsefNumber(header: KsefInvoiceHeader): string {
  const num = header.ksefNumber || header.ksefReferenceNumber || "";
  return typeof num === "string" ? num.trim() : "";
}

/** Pobiera i normalizuje UPO (XML lub base64-XML) jeżeli jest obecne w metadanych. */
function extractUpo(header: KsefInvoiceHeader): string | null {
  if (typeof header.upo !== "string" || !header.upo.trim()) return null;
  const raw = header.upo.trim();
  if (raw.startsWith("<")) return raw;
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8").trim();
    return decoded.startsWith("<") ? decoded : null;
  } catch {
    return null;
  }
}

/**
 * Pobiera lub inicjuje sesję KSeF dla danego użytkownika.
 *
 * Bezpieczeństwo:
 *  - Używa WYŁĄCZNIE tokena przypisanego do profilu firmy użytkownika.
 *  - Nie korzysta z globalnych zmiennych środowiskowych KSEF_TOKEN / KSEF_NIP
 *    jako fallbacku dla tokenów per-user — to zapobiega wyciekowi poświadczeń
 *    między użytkownikami/firmami.
 */
async function getSession(userId: string, companyId: string | null) {
  if (companyId) {
    const access = await requireCompanyAccess(userId, companyId, 'canSendKsef');
    if (!access.ok) throw new ApiError(access.status, access.error);
  }
  const companyProfile = companyId
    ? await prisma.companyProfile.findUnique({ where: { id: companyId } })
    : await prisma.companyProfile.findFirst({ where: { userId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] });
  const companySettings = companyProfile ? null : await prisma.companySettings.findUnique({ where: { userId } });
  const nip = (companyProfile?.nip || companySettings?.nip || '').replace(/\D/g, '');
  const ksefToken = (companyProfile?.ksefToken || '').trim();
  const settings = await prisma.ksefSettings.findUnique({ where: { userId } });
  const environment = asEnvironment(
    companyProfile?.ksefEnvironment ?? settings?.environment ?? process.env.KSEF_ENV ?? process.env.KSEF_ENVIRONMENT
  );
  const now = new Date();

  // Jeżeli istnieje aktywna sesja z ważnym accessToken — użyj jej.
  const activeSession = await prisma.ksefSession.findFirst({
    where: {
      userId,
      nip,
      environment,
      status: "ACTIVE",
      validUntil: { gt: now },
      accessToken: { not: null },
    },
    orderBy: { createdAt: "desc" },
  });

  if (activeSession?.accessToken) {
    return {
      companyProfile,
      session: activeSession,
      settings,
      client: new KsefClient({ environment, timeoutMs: 25_000 }),
      token: activeSession.accessToken,
    };
  }

  if (nip.length !== 10) {
    throw new ApiError(
      400,
      "Uzupełnij poprawny 10-cyfrowy NIP firmy w ustawieniach, aby móc synchronizować faktury z KSeF.",
      "KSEF_NIP_MISSING"
    );
  }
  if (!ksefToken) {
    const hint = settings?.certName
      ? " Certyfikat wybrany w ustawieniach dotyczy podpisu — do synchronizacji FZ potrzebny jest token API KSeF."
      : "";
    throw new ApiError(
      400,
      `Brak tokena KSeF. Dodaj token API KSeF w ustawieniach profilu firmy (zakładka "Firmy").${hint}`,
      "KSEF_CREDENTIALS_MISSING"
    );
  }

  const client = new KsefClient({ environment, timeoutMs: 25_000 });
  const auth = await client.loginWithKsefTokenV2(nip, ksefToken);

  const session = await prisma.ksefSession.upsert({
    where: { referenceNumber: auth.referenceNumber },
    update: {
      userId,
      nip,
      environment,
      authenticationToken: auth.authenticationToken,
      accessToken: auth.accessToken,
      validUntil: new Date(auth.validUntil),
      status: "ACTIVE",
    },
    create: {
      userId,
      nip,
      environment,
      referenceNumber: auth.referenceNumber,
      authenticationToken: auth.authenticationToken,
      accessToken: auth.accessToken,
      validUntil: new Date(auth.validUntil),
      status: "ACTIVE",
    },
  });

  return { companyProfile, session, settings, client, token: auth.accessToken };
}

/**
 * Logika synchronizacji faktur zakupowych z KSeF — wyodrębnia do wspólnego użytku.
 * Zwraca dane synchronizacji zamiast Response obiektu.
 */
export async function performIncomingSync(companyId?: string | null) {
  const user = await getSessionUser();
  if (!user) {
    throw new ApiError(401, "Nieautoryzowany.", "UNAUTHENTICATED");
  }

  const { companyProfile, session, settings, client, token } = await getSession(user.id, companyId || null);

  const syncTo = new Date();
  const syncFrom = !companyId && settings?.lastIncomingSyncAt
    ? new Date(settings.lastIncomingSyncAt.getTime() - CURSOR_OVERLAP_MS)
    : new Date(syncTo.getTime() - DEFAULT_LOOKBACK_MS);

  // ── Stronicowane pobieranie metadanych faktur (nabywca = Subject2) ──────────
  const allHeaders: KsefInvoiceHeader[] = [];
  for (let pageOffset = 0; pageOffset < MAX_PAGES; pageOffset += 1) {
    const page = await client.queryIncomingInvoices(token, syncFrom, syncTo, pageOffset, PAGE_SIZE);
    allHeaders.push(...page.invoiceHeaders);

    if (!page.hasMore) break;

    if (pageOffset === MAX_PAGES - 1) {
      throw new ApiError(
        413,
        `Zakres zawiera ponad ${MAX_PAGES * PAGE_SIZE} faktur zakupowych. Zawęź zakres dat lub użyj eksportu asynchronicznego KSeF.`,
        "KSEF_SYNC_RANGE_TOO_LARGE"
      );
    }
  }

  // Deduplikacja po numerze KSeF w obrębie tej odpowiedzi
  const headerMap = new Map<string, KsefInvoiceHeader>();
  for (const header of allHeaders) {
    const num = extractKsefNumber(header);
    if (num) headerMap.set(num, header);
  }
  const uniqueHeaders = Array.from(headerMap.values());
  const ksefNumbers = uniqueHeaders.map(extractKsefNumber);

  // Sprawdź, które numery KSeF są już w bazie dla tego użytkownika
  const existingInDb = ksefNumbers.length
    ? await prisma.invoice.findMany({
        where: { ...(companyProfile ? { sellerCompanyId: companyProfile.id } : { userId: user.id }), ksefNumber: { in: ksefNumbers } },
        select: { ksefNumber: true },
      })
    : [];
  const existingSet = new Set(existingInDb.map((i) => i.ksefNumber).filter(Boolean));

  // Oczyść "osieroconę" rezerwacje (utknęły bez faktury >15 min temu)
  await prisma.ksefIncomingImport.deleteMany({
    where: {
      userId: user.id,
      invoiceId: null,
      createdAt: { lt: new Date(Date.now() - 15 * 60_000) },
    },
  }).catch(() => undefined);

  const imported = [];

  for (const header of uniqueHeaders) {
    const ksefNumber = extractKsefNumber(header);
    if (!ksefNumber || existingSet.has(ksefNumber)) continue;

    // Atomowa rezerwacja — blokuje równoległe duplikaty (unikalny index)
    let reservationId: string;
    try {
      const reservation = companyProfile
        ? await prisma.$transaction(async tx => {
            await companyWriteAccess(tx, user.id, companyProfile.id, "canSendKsef");
            return tx.ksefIncomingImport.create({
              data: { userId: user.id, ksefReferenceNumber: `${companyProfile.id}:${ksefNumber}` },
            });
          })
        : await prisma.ksefIncomingImport.create({
            data: { userId: user.id, ksefReferenceNumber: `${user.id}:${ksefNumber}` },
          });
      reservationId = reservation.id;
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") continue; // już importowane
      throw err;
    }

    try {
      const xml = await client.downloadInvoiceXml(token, ksefNumber);
      const parsed = parseFa3IncomingInvoice(xml, ksefNumber);

      const acquiredAt =
        header.acquisitionDate
        ?? header.acquisitionTimestamp
        ?? syncTo.toISOString();

      const invoice = await prisma.$transaction(async tx => {
      if (companyProfile) await companyWriteAccess(tx, user.id, companyProfile.id, "canSendKsef");
      await assertAccountingPeriodsOpen(tx, [{ companyId: companyProfile?.id, issueDate: parsed.issueDate }]);
      // Upsert kontrahenta-sprzedawcy w autoryzowanej transakcji faktury.
      let contractor = await tx.contractor.findFirst({
        where: companyProfile
          ? { companyId: companyProfile.id, nip: parsed.seller.nip }
          : { userId: user.id, nip: parsed.seller.nip, OR: [{ companyId: null }, { companyId: { isSet: false } }] },
      });
      if (contractor) {
        contractor = await tx.contractor.update({
          where: { id: contractor.id },
          data: { name: parsed.seller.name, address: parsed.seller.address },
        });
      } else {
        contractor = await tx.contractor.create({
          data: {
            userId: user.id,
            companyId: companyProfile?.id ?? null,
            name: parsed.seller.name,
            nip: parsed.seller.nip,
            address: parsed.seller.address,
            isVatPayer: true,
          },
        });
      }
      const invoice = await tx.invoice.create({
        data: {
          userId: user.id,
          number: parsed.number,
          type: "purchase",
          sellerCompanyId: companyProfile?.id ?? null,
          status: "issued",
          documentStatus: "issued",
          approvalStatus: "pending",
          contractorId: contractor.id,
          issueDate: parsed.issueDate,
          saleDate: parsed.saleDate,
          dueDate: parsed.dueDate,
          currency: parsed.currency,
          language: "PL",
          paymentMethod: parsed.paymentMethod,
          paymentTermDays: parsed.paymentTermDays,
          lines: parsed.lines as unknown as Prisma.InputJsonValue,
          nip: parsed.seller.nip,
          totalNet: parsed.totalNet,
          totalVat: parsed.totalVat,
          totalGross: parsed.totalGross,
          ksefNumber,
          upoXml: extractUpo(header),
          ksefXml: xml,
          ksefSessionId: session.id,
          ksef: {
            number: ksefNumber,
            status: "ACTIVE",
            sentAt: acquiredAt,
            environment: client.environment,
          },
        },
        include: { sellerCompany: true },
      });

      await captureInvoicePrint(tx, invoice, "ksef-import");
      await tx.ksefIncomingImport.update({
        where: { id: reservationId },
        data: { invoiceId: invoice.id },
      });
      return invoice;
      });

      existingSet.add(ksefNumber);
      imported.push(invoiceToDto(invoice));
    } catch (err) {
      // Zwolnij rezerwację — następna synchronizacja ponowi próbę
      await prisma.ksefIncomingImport.delete({ where: { id: reservationId } }).catch(() => undefined);
      throw err;
    }
  }

  // Zaktualizuj kursor synchronizacji dopiero po pomyślnym imporcie
  if (!companyId) await prisma.ksefSettings.upsert({
    where: { userId: user.id },
    update: { lastIncomingSyncAt: syncTo, lastAutoSyncAt: syncTo },
    create: {
      userId: user.id,
      environment: client.environment,
      lastIncomingSyncAt: syncTo,
      lastAutoSyncAt: syncTo,
    },
  });

  // Powiadomienie e-mail i in-app jeśli zaimportowano nowe faktury
  if (imported.length > 0) {
    await prisma.notification.create({
      data: {
        userId: user.id,
        kind: "ksef",
        title: `Pobrano ${imported.length} nową(-ych) faktur zakupowych z KSeF`,
        body: `Faktury oczekują na zatwierdzenie dla księgowości.`,
        link: "/invoices",
      },
    }).catch(() => undefined);

    const notifyEmail = settings?.autoSyncNotifyEmail?.trim() || user.email;
    if (notifyEmail && (notifyEmail.toLowerCase() === user.email.toLowerCase() || isEmailVerifiedForSending(user))) {
      const rowsHtml = imported.map((inv: any) => `
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 10px; font-weight: bold;">${inv.number}</td>
          <td style="padding: 10px; font-family: monospace; font-size: 11px;">${inv.ksefNumber || '—'}</td>
          <td style="padding: 10px; text-align: right; font-weight: bold;">${inv.totalGross !== undefined ? Number(inv.totalGross).toFixed(2) + ' ' + (inv.currency || 'PLN') : '—'}</td>
        </tr>
      `).join("");

      const appUrl = process.env.NEXTAUTH_URL || "https://fakturaprosto.pl";
      sendEmail({
        to: notifyEmail,
        subject: `Nowe faktury zakupowe z KSeF (${imported.length})`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 650px; margin: 0 auto; padding: 24px; color: #111827; background-color: #ffffff;">
            <h2 style="color: #059669; margin-top: 0;">Otrzymano nowe faktury zakupowe z KSeF</h2>
            <p>System FakturaProsto pobrał <b>${imported.length}</b> nową(-ych) fakturę(-ur) kosztową(-ych) wystawioną(-ych) na Twój NIP.</p>
            <p style="color: #4b5563; font-size: 14px;">Dokumenty oczekują na zatwierdzenie dla księgowości.</p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px;">
              <thead>
                <tr style="background-color: #f9fafb; text-align: left; border-bottom: 2px solid #e5e7eb;">
                  <th style="padding: 10px;">Nr faktury</th>
                  <th style="padding: 10px;">Numer KSeF</th>
                  <th style="padding: 10px; text-align: right;">Kwota brutto</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
            <div style="margin-top: 24px; text-align: center;">
              <a href="${appUrl}/invoices" style="display: inline-block; background-color: #059669; color: #ffffff; padding: 12px 24px; font-weight: bold; border-radius: 8px; text-decoration: none;">Przejdź do FakturaProsto</a>
            </div>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin-top: 32px;" />
            <p style="font-size: 11px; color: #9ca3af; text-align: center;">Wiadomość wygenerowana automatycznie przez system FakturaProsto.</p>
          </div>
        `,
      }).catch((e) => console.error("[sync-incoming] Błąd wysyłki e-mail powiadomienia:", e));
    }
  }

  return {
    success: true,
    importedCount: imported.length,
    foundCount: uniqueHeaders.length,
    skippedCount: uniqueHeaders.length - imported.length,
    syncedFrom: syncFrom.toISOString(),
    syncedTo: syncTo.toISOString(),
    invoices: imported,
  };
}

/** POST /api/ksef/sync-incoming — synchronizacja faktur zakupowych z KSeF (rola nabywcy). */
export async function POST(req: Request) {
  try {
    const companyId = new URL(req.url).searchParams.get('companyId');
    const result = await performIncomingSync(companyId);
    return json(result);
  } catch (error) {
    if (error instanceof KsefApiError) {
      return handleApiError(new ApiError(502, error.message, "KSEF_UPSTREAM_ERROR"));
    }
    return handleApiError(error);
  }
}
