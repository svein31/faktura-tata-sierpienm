"use client";

import { buildInvoiceHtmlString } from "./invoice-html";
import { invoiceToJson, buildFaVatXml } from "./xml";
import { downloadFile } from "./utils";
import type { CompanyProfile, Contractor, Invoice } from "./types";

export interface ExportActions {
  exportPdf: () => void;
  exportHtml: () => void;
  exportXml: () => void;
  exportJson: () => void;
}

/**
 * Eksport PDF (przez okno drukowania → „Zapisz jako PDF"), HTML, XML FA(2), JSON.
 * Wszystko po stronie klienta — brak zależności od backendu.
 */
export function useInvoiceExports(
  invoice: Invoice,
  contractor: Contractor | undefined,
  company: CompanyProfile
): ExportActions {
  const safeName = invoice.number.replace(/[^a-zA-Z0-9_-]/g, "_");

  const exportPdf = () => {
    // Klasyczna technika: otwieramy ukryte okno z HTML i wywołujemy print().
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
    downloadFile(`${safeName}.xml`, buildFaVatXml(invoice, company), "application/xml;charset=utf-8");
  };

  const exportJson = () => {
    downloadFile(`${safeName}.json`, invoiceToJson(invoice, company), "application/json;charset=utf-8");
  };

  return { exportPdf, exportHtml, exportXml, exportJson };
}
