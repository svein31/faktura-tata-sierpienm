import { resolveSelectedCompany } from "@/lib/company-selection";
import { reportUnexpectedError } from "@/lib/error-report";
import { getInitialAppData } from "@/lib/server/app-initial-data";
import { readAuthorizedOverview } from "@/lib/server/overview-data";
import type { OverviewSeed } from "@/lib/use-overview";
import DashboardClient from "./dashboard-client";

export default async function DashboardPage() {
  const { user, bootstrap } = await getInitialAppData();
  let initialOverview: OverviewSeed | undefined;
  if (bootstrap) {
    const companies = bootstrap.companies ?? (bootstrap.company ? [bootstrap.company] : []);
    const company = resolveSelectedCompany(companies, null, bootstrap.company);
    if (company) {
      try {
        const data = await readAuthorizedOverview(user, new URLSearchParams({ companyId: company.id, months: "6" }));
        initialOverview = { companyId: company.id, months: 6, data };
      } catch (error) {
        reportUnexpectedError(error);
      }
    }
  }
  return <DashboardClient initialOverview={initialOverview} />;
}
