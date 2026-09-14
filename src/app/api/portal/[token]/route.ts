import { prisma } from "@/lib/db";
import { json, handleApiError } from "@/lib/api";
import { invoiceToDto, offerToDto } from "@/lib/dto";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ token: string }>;
}

export async function GET(_req: Request, context: RouteContext) {
  try {
    const { token } = await context.params;
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) return json({ error: "Nie znaleziono dokumentu." }, { status: 404 });
    if (!token) {
      return json({ error: "Brak tokenu dostępu." }, { status: 400 });
    }

    // 1. Sprawdź fakturę (po shareToken lub id)
    const invoice = await prisma.invoice.findFirst({
      where: {
        shareToken: token,
        type: "sale",
      },
    });

    if (invoice) {
      const [contractor, companySettings, companyProfile] = await Promise.all([
        prisma.contractor.findUnique({ where: { id: invoice.contractorId } }),
        prisma.companySettings.findUnique({ where: { userId: invoice.userId } }),
        invoice.sellerCompanyId
          ? prisma.companyProfile.findUnique({ where: { id: invoice.sellerCompanyId } })
          : null,
      ]);

      const sellerName = companyProfile?.companyName || companySettings?.name || "Wystawca";
      const sellerNip = companyProfile?.nip || companySettings?.nip || "";
      const sellerStreet = companyProfile?.street || companySettings?.street || "";
      const sellerCity = companyProfile?.city || companySettings?.city || "";
      const sellerPostal = companyProfile?.postalCode || companySettings?.postal || "";
      const sellerIban = companyProfile?.bankAccount || companySettings?.iban || "";
      const sellerBankName = companySettings?.bankName || "";

      const buyerAddr = contractor?.address as { street?: string; city?: string; postal?: string; postalCode?: string } | null;

      return json({
        type: "invoice",
        document: invoiceToDto(invoice),
        seller: {
          name: sellerName,
          nip: sellerNip,
          street: sellerStreet,
          city: sellerCity,
          postal: sellerPostal,
          iban: sellerIban,
          bankName: sellerBankName,
        },
        buyer: {
          name: contractor?.name || "Kontrahent",
          nip: contractor?.nip || "",
          street: buyerAddr?.street || "",
          city: buyerAddr?.city || "",
          postal: buyerAddr?.postalCode || buyerAddr?.postal || "",
        },
      });
    }

    // 2. Sprawdź ofertę (po publicToken)
    const offer = await prisma.offer.findFirst({
      where: { publicToken: token },
    });

    if (offer) {
      const companySettings = await prisma.companySettings.findUnique({
        where: { userId: offer.userId },
      });

      return json({
        type: "offer",
        document: offerToDto(offer),
        seller: {
          name: companySettings?.name || "Wystawca",
          nip: companySettings?.nip || "",
          street: companySettings?.street || "",
          city: companySettings?.city || "",
          postal: companySettings?.postal || "",
          iban: companySettings?.iban || "",
          bankName: companySettings?.bankName || "",
        },
        buyer: {
          name: offer.contractorName,
          nip: offer.contractorNip || "",
          street: "",
          city: "",
          postal: "",
        },
      });
    }

    return json({ error: "Nie znaleziono dokumentu lub link wygasł." }, { status: 404 });
  } catch (e) {
    return handleApiError(e);
  }
}
