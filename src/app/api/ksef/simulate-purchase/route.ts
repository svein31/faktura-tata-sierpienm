import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { handleApiError, json } from "@/lib/api";
import { contractorToDto, invoiceToDto, notificationToDto } from "@/lib/dto";
import { todayISO, addDaysISO } from "@/lib/utils";
import { invoiceTotals } from "@/lib/format";

export const runtime = "nodejs";

const DEMO_SUPPLIER = {
  name: "DemoIT Solutions Sp. z o.o.",
  nip: "5270000024",
  regon: "146981234",
  address: { street: "ul. Przykładowa 1", city: "Warszawa", postal: "00-001", country: "PL" },
  email: "kontakt@demoit.example",
  phone: "+48 22 100 20 30",
  iban: "PL61 1090 1014 0000 0712 1981 2875",
  bankName: "Bank Demo SA",
};

/**
 * POST /api/ksef/simulate-purchase — przycisk „Symuluj nową fakturę z KSeF".
 *
 * Tworzy (dla bieżącego użytkownika):
 *  - kontrahenta demo (tylko jeśli użytkownik nie ma jeszcze żadnego),
 *  - fakturę zakupową FZ z nowym numerem,
 *  - nieprzeczytane powiadomienie (kind=invoice_purchase) — odbierane przez
 *    polling klienta (dzwonek, toast, dźwięk, powiadomienie przeglądarki).
 * Wszystko w obrębie konta użytkownika — brak wycieku między userami.
 */
export async function POST() {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    // Kontrahent demo — tylko jeśli użytkownik nie ma żadnego (eksplicytna akcja demo).
    let contractor = await prisma.contractor.findFirst({
      where: { userId: user.id, nip: DEMO_SUPPLIER.nip },
    });
    if (!contractor) {
      contractor = await prisma.contractor.create({
        data: {
          userId: user.id,
          name: DEMO_SUPPLIER.name,
          nip: DEMO_SUPPLIER.nip,
          regon: DEMO_SUPPLIER.regon,
          address: DEMO_SUPPLIER.address,
          email: DEMO_SUPPLIER.email,
          phone: DEMO_SUPPLIER.phone,
          iban: DEMO_SUPPLIER.iban,
          bankName: DEMO_SUPPLIER.bankName,
          isVatPayer: true,
        },
      });
    }

    // Numeracja FZ/RRRR/XXXX.
    const year = new Date().getFullYear();
    const prefix = `FZ/${year}/`;
    const last = await prisma.invoice.findFirst({
      where: { userId: user.id, type: "purchase", number: { startsWith: prefix } },
      orderBy: { createdAt: "desc" },
    });
    let seq = 1;
    const m = last?.number?.match(new RegExp(`^FZ/${year}/(\\d{4})$`));
    if (m) seq = Number(m[1]) + 1;
    const number = `${prefix}${String(seq).padStart(4, "0")}`;

    const today = todayISO();
    const invoice = await prisma.invoice.create({
      data: {
        userId: user.id,
        number,
        type: "purchase",
        status: "issued",
        contractorId: contractor.id,
        issueDate: today,
        saleDate: today,
        dueDate: addDaysISO(today, 14),
        currency: "PLN",
        language: "PL",
        paymentMethod: "transfer",
        paymentTermDays: 14,
        notes: "Faktura utworzona przez symulację przychodzącą z KSeF (demo).",
        lines: [
          {
            id: `ln_${Date.now().toString(36)}`,
            name: "Usługa programistyczna (osobodzień)",
            quantity: 2,
            unit: "md",
            netPrice: 1200,
            vatRate: "23",
          },
        ],
      },
    });

    const dto = invoiceToDto(invoice);
    const gross = invoiceTotals(dto).gross;

    const notification = await prisma.notification.create({
      data: {
        userId: user.id,
        kind: "invoice_purchase",
        title: `Nowa faktura zakupowa ${number}`,
        body: `Otrzymano fakturę zakupową od ${DEMO_SUPPLIER.name} na kwotę ${gross.toFixed(2)} PLN (symulacja KSeF).`,
        link: `/invoices/${invoice.id}`,
        read: false,
      },
    });

    return json(
      {
        ok: true,
        demo: true,
        invoice: dto,
        contractor: contractorToDto(contractor),
        notification: notificationToDto(notification),
      },
      { status: 201 }
    );
  } catch (e) {
    return handleApiError(e);
  }
}
