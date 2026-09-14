"use client";
import { useMemo } from "react";
import { useAppStore } from "./store";
import { invoicesForCompany } from "./company-selection";
export function useCompanyInvoices() {
  const invoices = useAppStore((s) => s.invoices);
  const companyId = useAppStore((s) => s.selectedCompanyId);
  return useMemo(() => invoicesForCompany(invoices, companyId), [invoices, companyId]);
}
