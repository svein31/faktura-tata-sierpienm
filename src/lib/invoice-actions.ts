"use client";

import { buildInvoiceHtmlString } from "./invoice-html";
import { invoiceToJson } from "./xml";
import { buildFa3Xml } from "./ksef/xmlBuilder";
import { downloadFile } from "./utils";
import type { CompanyProfile, Contractor, Invoice } from "./types";

export interface ExportActions {
  exportPdf: () => void;
  exportHtml: () => void;
  exportXml: () => void;
  exportJson: () => void;
}

/**
 * Eksport PDF (przez okno drukowania → „Zapisz jako PDF"), HTML, oficjalnego XML FA(3), JSON.
 */
export function useInvoiceExports(
  invoice: Invoice,
  contractor: Contractor | undefined,
  company: CompanyProfile,
  pdfMode: "saved" | "preview" = "saved"
): ExportActions {
  const safeName = invoice.number.replace(/[^a-zA-Z0-9_-]/g, "_");

  const exportPdf = () => {
    if (pdfMode === "saved" && /^[a-f0-9]{24}$/i.test(invoice.id)) {
      window.open(`/api/invoices/${invoice.id}/pdf`, "_blank", "noopener,noreferrer");
      return;
    }
    const html = buildInvoiceHtmlString(invoice, contractor, company);
    const w = window.open("", "_blank", "width=900,height=1100");
    if (!w) {
      downloadFile(`${safeName}.html`, html, "text/html;charset=utf-8");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.print();
      setTimeout(() => w.close(), 400);
    }, 350);
  };

  const exportHtml = () => {
    downloadFile(
      `${safeName}.html`,
      buildInvoiceHtmlString(invoice, contractor, company),
      "text/html;charset=utf-8"
    );
  };

  const exportXml = () => {
    const xml = buildFa3Xml({ invoice, seller: company, buyer: contractor });
    downloadFile(`${safeName}-FA3.xml`, xml, "application/xml;charset=utf-8");
  };

  const exportJson = () => {
    downloadFile(`${safeName}.json`, invoiceToJson(invoice, company), "application/json;charset=utf-8");
  };

  return { exportPdf, exportHtml, exportXml, exportJson };
}
