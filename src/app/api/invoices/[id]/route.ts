import { contractorForCompany } from "@/lib/company-scope";
import { PURCHASE_INVOICE_READ_ONLY } from "@/lib/invoice-policy";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson } from "@/lib/api";
import { invoiceToDto } from "@/lib/dto";
import { parseInvoiceBody } from "@/lib/parsers";
import { getCompanyMembership, requireCompanyAccess } from "@/lib/permissions";
import { buildFieldDiff, recordAuditLog } from "@/lib/audit";

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
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const result = await getInvoiceWithAccess((await params).id, user.id);
    if (!result) {
      return json({ error: "Nie znaleziono faktury.", code: "NOT_FOUND" }, { status: 404 });
    }

    return json({ invoice: invoiceToDto(result.invoice) });
  } catch (e) {
    return handleApiError(e);
  }
}

/** PUT /api/invoices/[id] — aktualizacja z blokadą współbieżności i audytem. */
export async function PUT(req: Request, { params }: Ctx) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const result = await getInvoiceWithAccess((await params).id, user.id);
    if (!result) {
      return json({ error: "Nie znaleziono faktury.", code: "NOT_FOUND" }, { status: 404 });
    }

    const { invoice: existing } = result;
    if (existing.type === "purchase") throw new ApiError(403, PURCHASE_INVOICE_READ_ONLY);
    const body = await readJson(req);

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
      const allowedData: { notes?: string | null; approvalStatus?: string } = {};
      if (body.notes !== undefined) {
        allowedData.notes = typeof body.notes === "string" ? body.notes.trim() : null;
      }
      if (body.approvalStatus !== undefined && typeof body.approvalStatus === "string") {
        allowedData.approvalStatus = body.approvalStatus.trim();
      }

      const updated = await prisma.invoice.update({
        where: { id: existing.id },
        data: {
          ...allowedData,
          version: (existing.version || 1) + 1,
        },
        include: {
          sellerCompany: { include: { bankAccounts: true } },
          payments: true,
        },
      });

      const diffResult = buildFieldDiff(existing, allowedData, {
        notes: "Notatki",
        approvalStatus: "Status akceptacji",
      });

      // Zapis w audycie
      await recordAuditLog({
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

      return json({ invoice: invoiceToDto(updated) });
    }

    // 4. Parsowanie pełnego ciała zapytania
    const memberships = await prisma.companyMember.findMany({
      where: { userId: user.id },
      select: { companyId: true, company: { select: { userId: true } } },
    });
    const accessibleCompanyIds = memberships.map((m) => m.companyId);

    const data = await parseInvoiceBody(body, {
      contractorOwnedBy: async (id) => contractorForCompany(user.id, id, body.sellerCompanyId),
      companyOwnedBy: async (id) =>
        accessibleCompanyIds.includes(id) ||
        (await prisma.companyProfile.count({ where: { id, userId: user.id } })) > 0,
    });

    if (data.sellerCompanyId !== existing.sellerCompanyId) {
      throw new ApiError(400, "Nie można przenieść zapisanej faktury do innej firmy. Utwórz nowy dokument w wybranej firmie.");
    }

    // 5. Ochrona przed duplikatem numeru przy zmianie numeru
    if (data.number !== existing.number) {
      const conflict = await prisma.invoice.findFirst({
        where: {
          id: { not: existing.id },
          number: data.number,
          sellerCompanyId: data.sellerCompanyId ?? existing.sellerCompanyId,
        },
      });
      if (conflict) {
        throw new ApiError(409, `Faktura o numerze "${data.number}" już istnieje w tej firmie.`);
      }
    }

    const nextVersion = (existing.version || 1) + 1;

    const invoice = await prisma.invoice.update({
      where: { id: existing.id },
      data: {
        ...data,
        version: nextVersion,
      },
      include: {
        sellerCompany: { include: { bankAccounts: true } },
        payments: true,
      },
    });

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

    return json({ invoice: invoiceToDto(invoice) });
  } catch (e) {
    return handleApiError(e);
  }
}

/** DELETE /api/invoices/[id] — usunięcie (dopuszczalne tylko dla szkiców). */
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const result = await getInvoiceWithAccess((await params).id, user.id);
    if (!result) {
      return json({ error: "Nie znaleziono faktury.", code: "NOT_FOUND" }, { status: 404 });
    }

    const { invoice: existing } = result;
    if (existing.type === "purchase") throw new ApiError(403, PURCHASE_INVOICE_READ_ONLY);

    // Uprawnienia
    if (existing.sellerCompanyId) {
      const access = await requireCompanyAccess(user.id, existing.sellerCompanyId, "canIssueInvoices");
        if (!access.ok) throw new ApiError(access.status, access.error);
    }

    // Ochrona integralności księgowej: zabronione usuwanie wystawionych dokumentów
    const isDraft = existing.status === "draft" && existing.documentStatus === "draft";
    if (!isDraft && !existing.isProforma) {
      throw new ApiError(
        400,
        `Faktura ${existing.number} została już wystawiona lub przekazana do obiegu gospodarczego. Zgodnie z przepisami ustawy o VAT nie można jej usunąć. Aby dokonać korekty lub anulowania, wystaw fakturę korygującą.`
      );
    }

    if (existing.ksefNumber) {
      throw new ApiError(400, `Faktura posiada zarejestrowany numer KSeF (${existing.ksefNumber}) i nie może zostać usunięta.`);
    }

    await prisma.invoice.delete({ where: { id: existing.id } });

    // Zapis w audycie
    await recordAuditLog({
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

    return json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

