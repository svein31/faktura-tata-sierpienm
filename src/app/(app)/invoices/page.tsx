import { resolveSelectedCompany } from "@/lib/company-selection";
import { reportUnexpectedError } from "@/lib/error-report";
import { getInitialAppData } from "@/lib/server/app-initial-data";
import { readAuthorizedInvoiceSearch } from "@/lib/server/invoice-search-data";
import type { InitialInvoiceSearch } from "@/lib/use-invoice-search";
import InvoicesClient from "./invoices-client";

export default async function InvoicesPage() {
  const { user, bootstrap } = await getInitialAppData();
  let initialSearch: InitialInvoiceSearch | undefined;

  if (bootstrap) {
    const company = resolveSelectedCompany(bootstrap.companies, null, bootstrap.company);
    // Keep this order and these defaults identical to the client's first query.
    // Warm navigation may retain another company; the hook rejects that seed
    // before rendering any rows when its complete URL does not match.
    const params = new URLSearchParams({
      companyId: company?.id ?? "unassigned",
      search: "",
      status: "all",
      type: "all",
      approval: "all",
      currency: "all",
      cursor: "",
    });
    try {
      initialSearch = {
        url: `/api/invoices/search?${params.toString()}`,
        data: await readAuthorizedInvoiceSearch(user, params),
      };
    } catch (error) {
      reportUnexpectedError(error);
      // The client repeats the authorized API request and retains its normal
      // error display and retry controls if the initial server read fails.
    }
  }

  return <InvoicesClient initialSearch={initialSearch} />;
}
