import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { handleApiError, json, readJson } from "@/lib/api";
import { parseBankStatementCsv, matchTransactionsToInvoices } from "@/lib/banking/csv-parser";
import * as crypto from "crypto";

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

    let appliedCount = 0;

    // Automatyczne księgowanie wpłat
    if (applyPayments) {
      for (const tx of matched) {
        if (tx.matchedInvoiceId && (tx.confidence === "exact" || tx.confidence === "high")) {
          const inv = invoices.find((i) => i.id === tx.matchedInvoiceId);
          if (inv) {
            const currentPaid = inv.paidAmount || 0;
            const newPaid = Math.round((currentPaid + tx.amount) * 100) / 100;
            const isFullyPaid = newPaid >= (inv.totalGross || 0) - 0.05;

            await prisma.paymentRecord.create({
              data: {
                userId: user.id,
                invoiceId: inv.id,
                amount: tx.amount,
                method: "transfer",
                note: `Wyciąg bankowy: ${tx.title.slice(0, 200)}`,
                paidAt: new Date(tx.date),
              },
            });

            await prisma.invoice.update({
              where: { id: inv.id },
              data: {
                paidAmount: newPaid,
                paymentStatus: isFullyPaid ? "paid" : "partially_paid",
                status: isFullyPaid ? "paid" : inv.paidAmount ? "paid" : "issued",
              },
            });

            appliedCount++;
          }
        }
      }
    }

    const matchedCount = matched.filter((t) => t.matchedInvoiceId).length;
    const totalAmount = Math.round(matched.reduce((sum, t) => sum + t.amount, 0) * 100) / 100;
    const fileHash = crypto.createHash("sha256").update(csvContent + user.id + Date.now()).digest("hex");

    try {
      await prisma.bankStatementImport.create({
        data: {
          userId: user.id,
          filename,
          bankFormat,
          rowCount: rawTransactions.length,
          matchedCount,
          totalAmount,
          fileHash,
        },
      });
    } catch {
      // Ignorujemy błędy unikalności hasha
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
