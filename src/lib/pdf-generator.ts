/**
 * Moduł generatora PDF faktur zgodny z Netlify Serverless Functions / AWS Lambda.
 * Oparty na czystym JavaScript (pdf-lib) – nie wymaga Puppeteer ani Chromium,
 * generuje czysty Buffer w pamięci RAM w ułamku sekundy (< 50ms).
 */

import { generateInvoicePdfBuffer } from "./pdf/generate-invoice-pdf";
import type { CompanyProfile, Contractor, Invoice } from "./types";

export { generateInvoicePdfBuffer };

/**
 * Główny interfejs generowania bufora PDF faktury.
 */
export async function generatePdfBuffer(
  invoice: Invoice,
  contractor?: Contractor,
  company?: CompanyProfile
): Promise<Buffer> {
  return generateInvoicePdfBuffer(invoice, contractor, company);
}
