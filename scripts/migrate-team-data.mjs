import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function migrate() {
  console.log("[Migration] Rozpoczynam migrację danych zespołowych...");

  // 1. Pobierz wszystkie CompanyProfile
  const companies = await prisma.companyProfile.findMany({});
  console.log(`[Migration] Znaleziono ${companies.length} profili firm.`);

  let createdMembers = 0;
  for (const company of companies) {
    // Sprawdź czy istnieje CompanyMember dla właściciela firmy
    const existing = await prisma.companyMember.findUnique({
      where: {
        companyId_userId: {
          companyId: company.id,
          userId: company.userId,
        },
      },
    });

    if (!existing) {
      await prisma.companyMember.create({
        data: {
          companyId: company.id,
          userId: company.userId,
          role: "owner",
          canIssueInvoices: true,
          canCreateCorrections: true,
          canRecordPayments: true,
          canExport: true,
          canSendKsef: true,
          canManageBankAccounts: true,
          canManageTeam: true,
        },
      });
      createdMembers++;
      console.log(`[Migration] Utworzono członkostwo Właściciela dla firmy ${company.companyName} (${company.nip})`);
    }

    // Jeśli firma ma wpisany stary rachunek bankowy (bankAccount) a nie ma rekordów w CompanyBankAccount, utwórz domyślny
    if (company.bankAccount) {
      const bankAccountCount = await prisma.companyBankAccount.count({
        where: { companyId: company.id },
      });
      if (bankAccountCount === 0) {
        await prisma.companyBankAccount.create({
          data: {
            companyId: company.id,
            accountName: "Konto podstawowe",
            beneficiaryName: company.companyName,
            currency: "PLN",
            isMultiCurrency: false,
            accountNumber: company.bankAccount,
            bankName: "Rachunek bieżący",
            isDefault: true,
          },
        });
        console.log(`[Migration] Przeniesiono domyślny rachunek bankowy dla firmy ${company.companyName}`);
      }
    }
  }

  // 2. Faktury bez sellerCompanyId - przypisz do domyślnego profilu firmy użytkownika
  const invoicesWithoutCompany = await prisma.invoice.findMany({
    where: { sellerCompanyId: null },
  });
  console.log(`[Migration] Znaleziono ${invoicesWithoutCompany.length} faktur bez przypisanej firmy.`);

  let updatedInvoices = 0;
  for (const inv of invoicesWithoutCompany) {
    const userCompany = await prisma.companyProfile.findFirst({
      where: { userId: inv.userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });

    if (userCompany) {
      await prisma.invoice.update({
        where: { id: inv.id },
        data: { sellerCompanyId: userCompany.id },
      });
      updatedInvoices++;
    }
  }

  console.log(`[Migration] Zakończono migrację: utworzono ${createdMembers} powiązań CompanyMember, zaktualizowano ${updatedInvoices} faktur.`);
}

migrate()
  .catch((e) => {
    console.error("[Migration Error]:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
