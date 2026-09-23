import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson } from "@/lib/api";
import { parseBankStatementCsv, matchTransactionsToInvoices } from "@/lib/banking/csv-parser";
import { createHash } from "crypto";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const body = await readJson(req);
    const csvContent = String(body.csvContent || "").trim();
    if (!csvContent) {
      return json({ error: "Brak zawartości pliku CSV." }, { status: 400 });
    }
    if (csvContent.length > 2_000_000) throw new ApiError(413, "Plik CSV jest zbyt duży.");

    const filename = String(body.filename || "wyciag.csv");
    const bankFormat = String(body.bankFormat || "generic");
    const applyPayments = Boolean(body.applyPayments);

    // Parsowanie wyciągu
    const rawTransactions = parseBankStatementCsv(csvContent);
    if (rawTransactions.length === 0) {
      return json({ error: "Nie wykryto żadnych poprawnych operacji wpływów w przesłanym pliku." }, { status: 400 });
    }

    // Pobierz niezapłacone faktury sprzedaży użytkownika
    const invoices = await prisma.invoice.findMany({
      where: {
        userId: user.id,
        type: "sale",
        paymentStatus: { in: ["unpaid", "partially_paid"] },
      },
      select: {
        id: true,
        number: true,
        contractorId: true,
        totalGross: true,
        paidAmount: true,
        currency: true,
      },
    });

    const contractors = await prisma.contractor.findMany({
      where: { userId: user.id },
      select: { id: true, name: true, nip: true },
    });

    const contractorMap = new Map(contractors.map((c) => [c.id, c]));

    const candidates = invoices.map((inv) => {
      const ctr = contractorMap.get(inv.contractorId);
      return {
        id: inv.id,
        number: inv.number,
        contractorName: ctr?.name,
        contractorNip: ctr?.nip,
        totalGross: inv.totalGross || 0,
        paidAmount: inv.paidAmount || 0,
      };
    });

    const matched = matchTransactionsToInvoices(rawTransactions, candidates);

    const matchedCount = matched.filter((t) => t.matchedInvoiceId).length;
    const totalAmount = Math.round(matched.reduce((sum, t) => sum + t.amount, 0) * 100) / 100;
    // A preview never consumes the unique import key. Identical contents for the same
    // account have a stable identity, regardless of the filename or request time.
    const fileHash = createHash("sha256").update(user.id).update("\0").update(csvContent).digest("hex");
    let appliedCount = 0;
    if (applyPayments) {
      try {
        appliedCount = await prisma.$transaction(async (tx) => {
          await tx.bankStatementImport.create({ data: {
            userId: user.id, filename, bankFormat, rowCount: rawTransactions.length,
            matchedCount, totalAmount, fileHash,
          } });
          let applied = 0;
          const balances = new Map<string, { paid: number; total: number; status: string }>();
          for (const item of matched) {
            if (!item.matchedInvoiceId || !["exact", "high"].includes(item.confidence)) continue;
            const inv = await tx.invoice.findFirst({ where: {
              id: item.matchedInvoiceId, userId: user.id, type: "sale",
              paymentStatus: { in: ["unpaid", "partially_paid"] },
            }, select: { id: true, paidAmount: true, totalGross: true, version: true, status: true } });
            if (!inv) throw new ApiError(409, "Faktura zmieniła się od podglądu importu. Odśwież wyciąg.");
            const previous = balances.get(inv.id) ?? {
              paid: inv.paidAmount ?? 0, total: inv.totalGross ?? 0,
              status: inv.status,
            };
            const newPaid = Math.round((previous.paid + item.amount) * 100) / 100;
            if (!Number.isFinite(item.amount) || item.amount <= 0 || newPaid > previous.total + 0.05)
              throw new ApiError(409, "Kwota wpłaty przekracza saldo faktury. Zweryfikuj dopasowanie wyciągu.");
            const updated = await tx.invoice.updateMany({ where: {
              id: inv.id, userId: user.id, version: inv.version,
              paymentStatus: { in: ["unpaid", "partially_paid"] },
            }, data: {
              paidAmount: newPaid,
              paymentStatus: newPaid >= previous.total - 0.05 ? "paid" : "partially_paid",
              status: newPaid >= previous.total - 0.05 ? "paid" : previous.status,
              version: { increment: 1 },
            } });
            if (updated.count !== 1) throw new ApiError(409, "Faktura zmieniła się podczas importu. Ponów po odświeżeniu.");
            const paidAt = new Date(`${item.date}T12:00:00Z`);
            if (Number.isNaN(paidAt.getTime()) || paidAt.toISOString().slice(0, 10) !== item.date)
              throw new ApiError(400, "Nieprawidłowa data transakcji w wyciągu.");
            await tx.paymentRecord.create({ data: {
              userId: user.id, invoiceId: inv.id, amount: item.amount,
              method: "transfer", note: `Wyciąg bankowy: ${item.title.slice(0, 200)}`,
              paidAt,
            } });
            balances.set(inv.id, { ...previous, paid: newPaid });
            applied++;
          }
          return applied;
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
          throw new ApiError(409, "Ten wyciąg został już zaimportowany.", "IMPORT_DUPLICATE");
        throw error;
      }
    }

    return json({
      transactions: matched,
      rowCount: rawTransactions.length,
      matchedCount,
      totalAmount,
      appliedCount,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
