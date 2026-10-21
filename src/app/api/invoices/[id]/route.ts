import { assertAccountingPeriodsOpen } from "@/lib/accounting-period";
import { captureInvoicePrint } from "@/lib/pdf/invoice-print";
import { KSEF_IN_FLIGHT } from "@/lib/ksef/transmission-claim";
import { contractorForCompany } from "@/lib/company-scope";
import { changedAcceptedInvoiceFields, PURCHASE_INVOICE_READ_ONLY } from "@/lib/invoice-policy";
import { prisma } from "@/lib/db";
import { invoiceBankAccountForCompany } from "@/lib/invoice-bank-account";
import { getApiSessionUser } from "@/lib/auth";
import { assertObjectId, ApiError, cleanStr, handleApiError, json, readJson } from "@/lib/api";
import { invoiceToDto } from "@/lib/dto";
import { parseInvoiceBody } from "@/lib/parsers";
import { getCompanyMembership, requireCompanyAccess } from "@/lib/permissions";
import { companyWriteAccess } from "@/lib/company-write";
import { buildFieldDiff, recordAuditLog } from "@/lib/audit";
import { claimInvoiceQuota } from "@/lib/invoice-quota";
import { invoiceNumberScope } from "@/lib/invoice-number-scope";
import { resolveInvoiceCorrectionSource } from "@/lib/invoice-correction-source";
import { round2 } from "@/lib/format";
import { warsawDate } from "@/lib/scheduling";
import { recordPilotEvent } from "@/lib/pilot-metrics";
import { readInvoiceContacts } from "@/lib/server/invoice-contacts";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Pomocnicza funkcja weryfikacji dostępu do faktury (własna lub z firmy zespołu). */
async function getInvoiceWithAccess(invoiceId: string, userId: string) {
  if (!/^[0-9a-fA-F]{24}$/.test(invoiceId)) return null;

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      sellerCompany: {
        include: { bankAccounts: true },
      },
      payments: true,
    },
  });

  if (!invoice) return null;

  // Własna faktura
  if (!invoice.sellerCompanyId && invoice.userId === userId) {
    return { invoice, membership: null, isDirectOwner: true };
  }

  // Faktura powiązana ze spółką
  if (invoice.sellerCompanyId) {
    const membership = await getCompanyMembership(userId, invoice.sellerCompanyId);
    if (membership) {
      return { invoice, membership, isDirectOwner: false };
    }
  }

  return null;
}

/** GET /api/invoices/[id] — szczegóły (dostęp dla autora oraz członków firmy). */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const user = await getApiSessionUser();
    assertObjectId((await params).id);
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const result = await getInvoiceWithAccess((await params).id, user.id);
    if (!result) {
      return json({ error: "Nie znaleziono faktury.", code: "NOT_FOUND" }, { status: 404 });
    }

    const invoice = invoiceToDto(result.invoice);
    // Older failures only persisted their explanation in the queue. Read one
    // selected error after invoice access has been checked, never a queue payload.
    if ((invoice.ksefStatus === "rejected" || String(invoice.status) === "ksef_rejected" || invoice.ksef?.status === "REJECTED") && !invoice.ksef?.processingDescription) {
      const last = await prisma.ksefQueueTask.findFirst({
        where: { invoiceId: invoice.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { status: true, errorDetails: true, environment: true },
      });
      if (last && ["demo", "test", "production"].includes(last.environment)) invoice.ksefProcessing = {
        error: last.status === "failed" ? last.errorDetails?.slice(0, 1500) || null : null,
        environment: last.environment as "demo" | "test" | "production",
      };
    }
    return json({ invoice, contractor: (await readInvoiceContacts(user.id, [invoice]))[0] ?? null });
  } catch (e) {
    return handleApiError(e);
  }
}

/** PUT /api/invoices/[id] — aktualizacja z blokadą współbieżności i audytem. */
export async function PUT(req: Request, { params }: Ctx) {
  try {
    const user = await getApiSessionUser();
    assertObjectId((await params).id);
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const result = await getInvoiceWithAccess((await params).id, user.id);
    if (!result) {
      return json({ error: "Nie znaleziono faktury.", code: "NOT_FOUND" }, { status: 404 });
    }

    const { invoice: existing } = result;
    if (existing.type === "purchase") throw new ApiError(403, PURCHASE_INVOICE_READ_ONLY);
    if (KSEF_IN_FLIGHT.includes(existing.ksefStatus || "") || (existing.referenceNumber && !existing.ksefNumber)) throw new ApiError(409, "Dokument oczekuje na rozstrzygnięcie wysyłki KSeF.");
    if (existing.documentKind === "advance" || existing.documentKind === "final" || (existing.isProforma && await prisma.invoiceSettlement.count({where:{sourceId:existing.id}}))) throw new ApiError(409,"Dokument rozliczenia lub powiązana proforma są zablokowane przed edycją i usunięciem.");
    const body = await readJson(req);
    const previousDto = invoiceToDto(existing);
    if (body.type !== undefined && body.type !== existing.type) throw new ApiError(409, "Nie można zmienić faktury sprzedaży w koszt. Utwórz właściwy dokument osobno.");
    if (body.approvalStatus !== undefined) {
      const approval = cleanStr(body.approvalStatus, 30, "approvalStatus");
      if (!["pending", "approved"].includes(approval)) throw new ApiError(400, "Nieprawidłowy status akceptacji.");
      if (approval !== previousDto.approvalStatus) throw new ApiError(409, "Status akceptacji zmieniaj przez osobną operację zatwierdzania kosztu.");
    }
    const recordedPaid = round2(previousDto.paidAmount ?? 0);
    if ((body.paidAmount !== undefined && body.paidAmount !== recordedPaid) ||
      (body.paymentStatus !== undefined && body.paymentStatus !== previousDto.paymentStatus) ||
      (body.status === "paid" && existing.status !== "paid")) {
      throw new ApiError(409, "Wpłaty i status płatności zmieniaj przez rejestrację wpłaty, nie przez edycję faktury.");
    }

    // 1. Sprawdź optymistyczną blokadę współbieżności (Optimistic Concurrency Control)
    if (
      typeof body.version === "number" &&
      existing.version &&
      body.version < existing.version
    ) {
      throw new ApiError(
        409,
        `Dokument został w międzyczasie zmodyfikowany przez innego użytkownika (wersja w bazie: v${existing.version}, Twoja wersja: v${body.version}). Odśwież dane, aby nie nadpisać cudzych zmian.`
      );
    }

    // 2. Weryfikacja uprawnień do edycji
    if (existing.sellerCompanyId) {
      if (existing.isCorrection || body.isCorrection) {
        const access = await requireCompanyAccess(user.id, existing.sellerCompanyId, "canCreateCorrections");
        if (!access.ok) throw new ApiError(access.status, access.error);
      } else {
        const access = await requireCompanyAccess(user.id, existing.sellerCompanyId, "canIssueInvoices");
        if (!access.ok) throw new ApiError(access.status, access.error);
      }
    }

    // 3. Ochrona integralności: faktury z nadanym numerem KSeF
    if (existing.ksefNumber) {
      if (changedAcceptedInvoiceFields(body, invoiceToDto(existing) as unknown as Record<string, unknown>).length) {
        throw new ApiError(409, "Faktura została przyjęta w KSeF. Zmiana dat, pozycji, numeru lub rachunku wymaga faktury korygującej. Możesz zmienić notatki.");
      }
      const allowedData: { notes?: string | null } = {};
      if (body.notes !== undefined) {
        allowedData.notes = cleanStr(body.notes, 4000, "notes") || null;
      }

    const updated = await prisma.$transaction(async tx => {
      if (existing.sellerCompanyId) await companyWriteAccess(tx, user.id, existing.sellerCompanyId,
        existing.isCorrection || body.isCorrection ? "canCreateCorrections" : "canIssueInvoices");
      if (!existing.sellerCompanyId) {
        const actor = await tx.user.findUnique({ where: { id: user.id }, select: { role: true } });
        if (!actor || !["owner", "accountant"].includes(actor.role)) throw new ApiError(403, "Brak uprawnienia do zmiany faktury.");
      }
      await assertAccountingPeriodsOpen(tx, [{ companyId: existing.sellerCompanyId, issueDate: existing.issueDate }]);
      await captureInvoicePrint(tx, existing, "before-edit");
      const updated = await tx.invoice.update({
        where: { id: existing.id, OR: [{ version: existing.version }, ...((existing.version ?? 1) <= 1 ? [{ version: { isSet: false } }] : [])] },
        data: {
          ...allowedData,
          version: (existing.version || 1) + 1,
        },
        include: {
          sellerCompany: { include: { bankAccounts: true } },
          payments: true,
        },
      });

      await captureInvoicePrint(tx, updated, "edited");
      const diffResult = buildFieldDiff(existing, allowedData, {
        notes: "Notatki",
        approvalStatus: "Status akceptacji",
      });

      // Zapis w audycie
      await recordAuditLog({
        client: tx,
        companyId: existing.sellerCompanyId || undefined,
        documentId: existing.id,
        userId: user.id,
        userName: user.name || user.email,
        userEmail: user.email,
        action: "invoice_updated",
        entityType: "invoice",
        entityId: existing.id,
        description: `Zaktualizowano notatki/status faktury KSeF ${existing.number}`,
        diff: diffResult.diff,
      });

    return updated;
    });

      return json({ invoice: invoiceToDto(updated) });
    }

    // 4. Parsowanie pełnego ciała zapytania
    if (existing.isOffline && existing.qrCodeII)
      throw new ApiError(409, "Wystawionej faktury offline nie można zmieniać: podpisany XML i kody QR muszą pozostać identyczne.");
    const memberships = await prisma.companyMember.findMany({
      where: { userId: user.id },
      select: { companyId: true, company: { select: { userId: true } } },
    });
    const accessibleCompanyIds = memberships.map((m) => m.companyId);

    const correctionBody = await resolveInvoiceCorrectionSource(prisma, user.id, body, existing.id);
    const parsed = await parseInvoiceBody(correctionBody, {
      contractorOwnedBy: async (id) => contractorForCompany(user.id, id, correctionBody.sellerCompanyId),
      companyOwnedBy: async (id) =>
        accessibleCompanyIds.includes(id) ||
        (await prisma.companyProfile.count({ where: { id, userId: user.id } })) > 0,
    });
    const bankDetails = body.bankAccountMode === "preserve" && existing.sellerCompanyId === parsed.sellerCompanyId && existing.bankAccountSnapshot
      ? { bankAccountId: existing.bankAccountId, bankAccountSnapshot: existing.bankAccountSnapshot }
      : await invoiceBankAccountForCompany(parsed.sellerCompanyId, parsed.bankAccountId, parsed.currency, body.bankAccountMode === "primary");
    const data = { ...parsed, ...bankDetails };
    // Edits retain the recorded ledger and reconcile it against the new total.
    // The version predicate below also fences a payment registered concurrently.
    data.paidAmount = recordedPaid;
    data.paymentStatus = recordedPaid > 0 && recordedPaid >= data.totalGross ? "paid"
      : recordedPaid > 0 ? "partially_paid" : data.dueDate < warsawDate() ? "overdue" : "unpaid";
    if (data.status === "paid" && data.paymentStatus !== "paid") data.status = "issued";
    if (data.status !== "draft" && data.paymentStatus === "paid") data.status = "paid";

    // Wystawienie jest nieodwracalne: cofnięcie do szkicu/proformy pozwoliłoby usunąć dokument i ominąć licznik.
    if ((existing.issuedAt || (existing.type === "sale" && !existing.isProforma && existing.status !== "draft")) &&
      (data.status === "draft" || data.isProforma || data.type !== "sale")) {
      throw new ApiError(409, "Wystawionej faktury nie można przywrócić do szkicu ani proformy. Użyj korekty.");
    }

    if (data.sellerCompanyId !== existing.sellerCompanyId) {
      throw new ApiError(400, "Nie można przenieść zapisanej faktury do innej firmy. Utwórz nowy dokument w wybranej firmie.");
    }

    if (data.isRecurring && data.recurringNextDate === existing.recurringNextDate) data.recurringAnchorDay = existing.recurringAnchorDay ?? data.recurringAnchorDay;

    // 5. Ochrona przed duplikatem numeru przy zmianie numeru
    if (data.number !== existing.number) {
      const conflict = await prisma.invoice.findFirst({
        where: {
          id: { not: existing.id },
          number: data.number,
          ...invoiceNumberScope(existing.userId, existing.sellerCompanyId),
        },
      });
      if (conflict) {
        throw new ApiError(409, `Faktura o numerze "${data.number}" już istnieje w tej firmie.`);
      }
    }

    const nextVersion = (existing.version || 1) + 1;

    const invoice = await prisma.$transaction(async tx => {
    if (existing.sellerCompanyId) await companyWriteAccess(tx, user.id, existing.sellerCompanyId,
      existing.isCorrection || body.isCorrection ? "canCreateCorrections" : "canIssueInvoices");
    if (!existing.sellerCompanyId) {
      const actor = await tx.user.findUnique({ where: { id: user.id }, select: { role: true } });
      if (!actor || !["owner", "accountant"].includes(actor.role)) throw new ApiError(403, "Brak uprawnienia do zmiany faktury.");
    }
    await assertAccountingPeriodsOpen(tx, [
      { companyId: existing.sellerCompanyId, issueDate: existing.issueDate },
      { companyId: data.sellerCompanyId, issueDate: data.issueDate },
    ]);
    if (data.number !== existing.number) {
      await tx.invoiceNumberClaim.create({ data: { id: `${existing.sellerCompanyId || user.id}:${data.number}` } });
    }
    const issuedAt = data.type === "sale" && !data.isProforma && !existing.issuedAt && (existing.status === "draft" || existing.isProforma) && data.status !== "draft"
      ? await claimInvoiceQuota(tx, user.id, existing.sellerCompanyId) : existing.issuedAt;
    await captureInvoicePrint(tx, existing, "before-edit");
    const invoice = await tx.invoice.update({
      where: { id: existing.id, OR: [{ version: existing.version }, ...((existing.version ?? 1) <= 1 ? [{ version: { isSet: false } }] : [])] },
      data: {
        ...data,
        issuedAt,
        version: nextVersion,
        recurringUserId: data.isRecurring ? user.id : null,
      },
      include: {
        sellerCompany: { include: { bankAccounts: true } },
        payments: true,
      },
    });

    if (data.number !== existing.number && !existing.issuedAt && existing.status === "draft" && existing.documentStatus === "draft") {
      await tx.invoiceNumberClaim.deleteMany({ where: { id: `${existing.sellerCompanyId || existing.userId}:${existing.number}` } });
    }
    await captureInvoicePrint(tx, invoice, "edited");
    // 6. Trwały zapis audytu z wyliczonym diffem
    const diffResult = buildFieldDiff(existing, invoice, {
      number: "Numer",
      type: "Typ",
      status: "Status",
      currency: "Waluta",
      issueDate: "Data wystawienia",
      saleDate: "Data sprzedaży",
      dueDate: "Termin płatności",
      paymentMethod: "Metoda płatności",
      exchangeRate: "Kurs waluty",
      exchangeRateTable: "Tabela NBP",
      exchangeRateRule: "Podstawa kursu",
      notes: "Notatki",
    });

    await recordAuditLog({
        client: tx,
      companyId: invoice.sellerCompanyId || undefined,
      documentId: invoice.id,
      userId: user.id,
      userName: user.name || user.email,
      userEmail: user.email,
      action: "invoice_updated",
      entityType: "invoice",
      entityId: invoice.id,
      description: `Zmodyfikowano fakturę ${invoice.number} (wersja v${nextVersion})`,
      diff: diffResult.diff,
    });

    return invoice;
    });

    if (!existing.issuedAt && invoice.type === "sale" && !invoice.isProforma && invoice.issuedAt) recordPilotEvent(req, "first_invoice");
    return json({ invoice: invoiceToDto(invoice) });
  } catch (e) {
    if (["P2025", "P2034"].includes((e as { code?: string }).code || "")) return handleApiError(new ApiError(409, "Dokument zmienił się podczas zapisu. Odśwież dane."));
    return handleApiError(e);
  }
}

/** DELETE /api/invoices/[id] — usunięcie (dopuszczalne tylko dla szkiców). */
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const user = await getApiSessionUser();
    assertObjectId((await params).id);
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const result = await getInvoiceWithAccess((await params).id, user.id);
    if (!result) {
      return json({ error: "Nie znaleziono faktury.", code: "NOT_FOUND" }, { status: 404 });
    }

    const { invoice: existing } = result;
    if (existing.type === "purchase") throw new ApiError(403, PURCHASE_INVOICE_READ_ONLY);
    if (KSEF_IN_FLIGHT.includes(existing.ksefStatus || "") || (existing.referenceNumber && !existing.ksefNumber)) throw new ApiError(409, "Dokument oczekuje na rozstrzygnięcie wysyłki KSeF.");
    if (existing.documentKind === "advance" || existing.documentKind === "final" || (existing.isProforma && await prisma.invoiceSettlement.count({where:{sourceId:existing.id}}))) throw new ApiError(409,"Dokument rozliczenia lub powiązana proforma są zablokowane przed edycją i usunięciem.");

    // Uprawnienia
    if (existing.sellerCompanyId) {
      const access = await requireCompanyAccess(user.id, existing.sellerCompanyId, "canIssueInvoices");
        if (!access.ok) throw new ApiError(access.status, access.error);
    }

    // Ochrona integralności księgowej: zabronione usuwanie wystawionych dokumentów
    const isDraft = existing.status === "draft" && existing.documentStatus === "draft";
    if (existing.issuedAt || (!isDraft && !existing.isProforma)) {
      throw new ApiError(
        400,
        `Faktura ${existing.number} została już wystawiona lub przekazana do obiegu gospodarczego. Zgodnie z przepisami ustawy o VAT nie można jej usunąć. Aby dokonać korekty lub anulowania, wystaw fakturę korygującą.`
      );
    }

    if (existing.ksefNumber) {
      throw new ApiError(400, `Faktura posiada zarejestrowany numer KSeF (${existing.ksefNumber}) i nie może zostać usunięta.`);
    }

    await prisma.$transaction(async tx => {
    if (existing.sellerCompanyId) await companyWriteAccess(tx, user.id, existing.sellerCompanyId, "canIssueInvoices");
    if (!existing.sellerCompanyId) {
      const actor = await tx.user.findUnique({ where: { id: user.id }, select: { role: true } });
      if (!actor || !["owner", "accountant"].includes(actor.role)) throw new ApiError(403, "Brak uprawnienia do zmiany faktury.");
    }
    await assertAccountingPeriodsOpen(tx, [{ companyId: existing.sellerCompanyId, issueDate: existing.issueDate }]);
    const claimed = await tx.invoice.updateMany({
      where: { id: existing.id, OR: [{ version: existing.version }, ...((existing.version ?? 1) <= 1 ? [{ version: { isSet: false } }] : [])] },
      data: { version: (existing.version || 1) + 1 },
    });
    if (!claimed.count) throw new ApiError(409, "Dokument zmienił się podczas zapisu. Odśwież dane.");
    await tx.invoice.delete({ where: { id: existing.id } });
    if (isDraft) {
      await tx.invoiceNumberClaim.deleteMany({ where: { id: `${existing.sellerCompanyId || existing.userId}:${existing.number}` } });
    }

    // Zapis w audycie
    await recordAuditLog({
        client: tx,
      companyId: existing.sellerCompanyId || undefined,
      documentId: existing.id,
      userId: user.id,
      userName: user.name || user.email,
      userEmail: user.email,
      action: "invoice_deleted",
      entityType: "invoice",
      entityId: existing.id,
      description: `Usunięto szkic faktury ${existing.number}`,
      details: {
        number: existing.number,
        currency: existing.currency,
        status: existing.status,
      },
    });

    });

    return json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
