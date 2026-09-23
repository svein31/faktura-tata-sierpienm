import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { formatMoney, invoiceTotals, lineGross, lineNet, lineVat, vatRateLabel } from "../format";
import { invoiceLabels, paymentMethodLabel } from "../i18n";
import type { CompanyProfile, Contractor, Invoice, CompanyBankAccount } from "../types";
import { buildKsefVerificationUrl, generateQrPngBuffer, getKsefQrLabel } from "../ksef";
import { getTaxIdLabel } from "../validation";
import { DEFAULT_PRINT_CONFIG, type PrintConfig } from "./print-config";
import { remoteLogo } from "./remote-logo";

/**
 * Bezpieczne mapowanie znaków dla standardowych fontów PDF (WinAnsi).
 * Zapobiega błędom kodowania WinAnsi w środowiskach bez zewnętrznych fontów TTF.
 */
function cleanText(text: string | number | undefined | null): string {
  if (text === undefined || text === null) return "";
  const s = String(text);
  const polishMap: Record<string, string> = {
    ą: "a", Ą: "A",
    ć: "c", Ć: "C",
    ę: "e", Ę: "E",
    ł: "l", Ł: "L",
    ń: "n", Ń: "N",
    ó: "o", Ó: "O",
    ś: "s", Ś: "S",
    ź: "z", Ź: "Z",
    ż: "z", Ż: "Z",
  };
  return s.replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, (m) => polishMap[m] || m);
}

/**
 * Generuje profesjonalny plik PDF faktury (Buffer / Uint8Array) w środowisku Node.js / Netlify Functions.
 */
export async function generateInvoicePdfBuffer(
  invoice: Invoice,
  contractor?: Contractor | undefined,
  company?: CompanyProfile | undefined,
  config: PrintConfig = DEFAULT_PRINT_CONFIG
): Promise<Buffer> {
  const effectiveCompany: CompanyProfile = company || {
    id: "default",
    userId: "default",
    nip: "",
    companyName: "Moja Firma",
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`Faktura ${invoice.number}`);
  pdfDoc.setAuthor(effectiveCompany.companyName || effectiveCompany.name || "FakturaProsto");

  let page = pdfDoc.addPage([595.28, 841.89]); // A4 (points)
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const L = invoiceLabels[invoice.language || "PL"];
  const t = invoiceTotals(invoice);

  // Kolory (z uwzględnieniem personalizacji firmy)
  function parseHexColor(hex?: string | null) {
    if (!hex) return rgb(0.12, 0.44, 0.98); // domyślny #1e70fa
    const clean = hex.replace("#", "").trim();
    if (clean.length === 6) {
      const r = parseInt(clean.substring(0, 2), 16) / 255;
      const g = parseInt(clean.substring(2, 4), 16) / 255;
      const b = parseInt(clean.substring(4, 6), 16) / 255;
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        return rgb(r, g, b);
      }
    }
    return rgb(0.12, 0.44, 0.98);
  }

  const primaryColor = parseHexColor(config.accentColor || effectiveCompany.accentColor || effectiveCompany.primaryColor);
  const darkColor = rgb(0.09, 0.11, 0.15); // #171c26
  const grayColor = rgb(0.42, 0.45, 0.5); // #6b7280
  const lightBg = rgb(0.96, 0.97, 0.98); // #f4f6f8
  const borderColor = rgb(0.88, 0.9, 0.92);
  const successColor = rgb(0.08, 0.55, 0.35);
  const warningColor = rgb(0.85, 0.45, 0.05);

  let y = height - 40;
  const newPage = () => {
    page = pdfDoc.addPage([width, height]);
    y = height - 48;
    page.drawText(cleanText(`Faktura ${invoice.number} - kontynuacja`), { x: 40, y: y + 15, size: 8, font: fontRegular, color: grayColor, maxWidth: width - 80 });
  };
  const ensureSpace = (needed: number) => { if (y - needed < 65) newPage(); };
  const wrap = (value: string, maxWidth: number, size: number, bold = false) => {
    const font = bold ? fontBold : fontRegular, result: string[] = [];
    for (const paragraph of cleanText(value).split(/\r?\n/)) {
      let line = "";
      for (const char of paragraph) {
        if (line && font.widthOfTextAtSize(line + char, size) > maxWidth) {
          const space = line.lastIndexOf(" ");
          if (space > 0) { result.push(line.slice(0, space)); line = line.slice(space + 1); }
          else { result.push(line.trimEnd()); line = ""; }
        }
        line += char;
      }
      result.push(line.trimEnd());
    }
    return result.length ? result : [""];
  };

  // Osadzenie logo firmy (jeśli obecne)
  let logoImage = null;
  let logoWidth = 0;
  let logoHeight = 0;

  if (effectiveCompany.logoUrl) {
    try {
      const rawLogo = effectiveCompany.logoUrl;
      let imgBuffer: Buffer | null = null;
      let isPng = false;

      if (rawLogo.startsWith("data:image/png;base64,")) {
        imgBuffer = Buffer.from(rawLogo.replace("data:image/png;base64,", ""), "base64");
        isPng = true;
      } else if (rawLogo.startsWith("data:image/jpeg;base64,") || rawLogo.startsWith("data:image/jpg;base64,")) {
        imgBuffer = Buffer.from(rawLogo.replace(/^data:image\/jpe?g;base64,/, ""), "base64");
        isPng = false;
      } else if (rawLogo.startsWith("data:")) {
        const comma = rawLogo.indexOf(",");
        if (comma !== -1) {
          imgBuffer = Buffer.from(rawLogo.slice(comma + 1), "base64");
          isPng = rawLogo.includes("image/png");
        }
      } else if (rawLogo.startsWith("http://") || rawLogo.startsWith("https://")) {
        try {
          const fetched = await remoteLogo(rawLogo);
          imgBuffer = fetched.bytes;
          isPng = fetched.isPng;
        } catch {
          console.warn("[PDF] Logo URL niedostępne lub nie spełnia wymagań publicznego HTTPS/PNG/JPG.");
        }
      }

      if (imgBuffer && imgBuffer.length <= 2 * 1024 * 1024) {
        try {
          logoImage = isPng ? await pdfDoc.embedPng(imgBuffer) : await pdfDoc.embedJpg(imgBuffer);
        } catch {
          // Fallback: próba drugiego formatu
          try {
            logoImage = isPng ? await pdfDoc.embedJpg(imgBuffer) : await pdfDoc.embedPng(imgBuffer);
          } catch (embedErr) {
            console.warn("[PDF] Nie udało się osadzić obrazu logo (obsługiwane: PNG, JPG):", embedErr);
          }
        }

        if (logoImage) {
          const dims = logoImage.scale(1);
          const maxW = 100;
          const maxH = 46;
          const scale = Math.min(maxW / dims.width, maxH / dims.height, 1);
          logoWidth = dims.width * scale;
          logoHeight = dims.height * scale;
        }
      }
    } catch (e) {
      console.warn("[PDF] Nie udało się osadzić logo:", e);
    }
  }

  // ── Nagłówek dokumentu ──
  page.drawRectangle({
    x: 40,
    y: y - 94,
    width: width - 80,
    height: 104,
    color: lightBg,
  });

  if (logoImage) {
    page.drawImage(logoImage, {
      x: 52,
      y: y - 50 + (48 - logoHeight) / 2,
      width: logoWidth,
      height: logoHeight,
    });
  }

  const titleX = logoImage ? 55 + logoWidth + 14 : 55;
  const docTitle = invoice.isCorrection
    ? "FAKTURA KORYGUJACA"
    : invoice.type === "purchase" ? cleanText(L.purchaseDoc) : cleanText(L.saleDoc);

  page.drawText(docTitle.toUpperCase(), {
    x: titleX,
    y: y - 22,
    size: 14,
    font: fontBold,
    color: invoice.isCorrection ? rgb(0.7, 0.15, 0.15) : primaryColor,
  });

  page.drawText(wrap(`Nr: ${invoice.number}`, width - titleX - 50, 10, true).join("\n"), {
    x: titleX,
    y: y - 38,
    size: 10,
    lineHeight: 11,
    font: fontBold,
    color: darkColor,
  });

  if (invoice.ksefNumber || invoice.ksef?.number) {
    page.drawText(`KSeF: ${cleanText(invoice.ksefNumber || invoice.ksef?.number)}`, {
      x: titleX,
      y: y - 66,
      size: 7.5,
      font: fontRegular,
      color: grayColor,
    });
  } else if (invoice.isOffline) {
    page.drawText(`Tryb awaryjny KSeF (OFFLINE)`, {
      x: titleX,
      y: y - 66,
      size: 7.5,
      font: fontBold,
      color: warningColor,
    });
  }

  // Daty (prawa strona nagłówka)
  const dateX = 52;
  page.drawText(`${cleanText(L.issueDate)}: ${cleanText(invoice.issueDate)}`, {
    x: dateX,
    y: y - 84,
    size: 8,
    font: fontRegular,
    color: grayColor,
  });
  page.drawText(`${cleanText(L.saleDate)}: ${cleanText(invoice.saleDate)}`, {
    x: dateX + 168,
    y: y - 84,
    size: 8,
    font: fontRegular,
    color: grayColor,
  });
  page.drawText(`${cleanText(L.dueDate)}: ${cleanText(invoice.dueDate)}`, {
    x: dateX + 336,
    y: y - 84,
    size: 8,
    font: fontRegular,
    color: grayColor,
  });

  y -= 115;

  // ── Sprzedawca i Nabywca ──
  const colWidth = (width - 95) / 2;
  const compName = effectiveCompany.companyName || effectiveCompany.name || "—";
  const sellerName = invoice.type === "sale" ? compName : (contractor?.name ?? "—");
  const buyerName = invoice.type === "sale" ? (contractor?.name ?? "—") : compName;

  const streetPart = [effectiveCompany.street, effectiveCompany.buildingNumber].filter(Boolean).join(" ");
  const compStreet = effectiveCompany.flatNumber ? `${streetPart}/${effectiveCompany.flatNumber}` : (streetPart || effectiveCompany.street || "");
  const compCity = effectiveCompany.city || "";
  const compPostal = effectiveCompany.postalCode || effectiveCompany.postal || "";
  const compIban = effectiveCompany.bankAccount || effectiveCompany.iban || "";

  const sellerNip = invoice.type === "sale" ? (effectiveCompany.nip || "—") : (contractor?.nip ?? "—");
  const buyerNip = invoice.type === "sale" ? (contractor?.nip ?? "—") : (effectiveCompany.nip || "—");

  const sellerAddrStr = invoice.type === "sale" 
    ? `${compStreet}, ${compPostal} ${compCity}`
    : contractor?.address ? `${contractor.address.street}, ${contractor.address.postal} ${contractor.address.city}` : "—";

  const buyerAddrStr = invoice.type === "sale"
    ? contractor?.address ? `${contractor.address.street}, ${contractor.address.postal} ${contractor.address.city}` : "—"
    : `${compStreet}, ${compPostal} ${compCity}`;

  const buyerTaxIdType = contractor?.taxIdType || invoice.buyerTaxIdType || "nip";
  const buyerCountry = contractor?.country || contractor?.address?.country || invoice.buyerCountry || "PL";
  const buyerTaxLabel = invoice.type === "sale" ? getTaxIdLabel(buyerTaxIdType, buyerCountry, invoice.language || "PL") : L.nip;
  const buyerTaxIdValue = invoice.type === "sale" ? (contractor?.taxId || contractor?.nip || buyerNip) : effectiveCompany.nip;
  const partyWidth = colWidth - 24;
  const sellerRows = [...wrap(sellerName, partyWidth, 9, true), ...wrap(`NIP: ${sellerNip}`, partyWidth, 8.5), ...wrap(sellerAddrStr, partyWidth, 8.5)];
  const buyerRows = [...wrap(buyerName, partyWidth, 9, true), ...wrap(`${buyerTaxLabel}: ${buyerTaxIdValue || ""}`, partyWidth, 8.5), ...wrap(buyerAddrStr, partyWidth, 8.5)];
  const partyHeight = Math.max(90, 38 + Math.max(sellerRows.length, buyerRows.length) * 12);
  for (const [x, label, rows] of [[40, L.seller, sellerRows], [40 + colWidth + 15, L.buyer, buyerRows]] as const) {
    page.drawRectangle({ x, y: y - partyHeight + 5, width: colWidth, height: partyHeight, color: lightBg, borderColor, borderWidth: 1 });
    page.drawText(cleanText(label).toUpperCase(), { x: x + 12, y: y - 18, size: 8.5, font: fontBold, color: primaryColor });
    rows.forEach((text, index) => page.drawText(text, { x: x + 12, y: y - 34 - index * 12, size: 8.5, font: index === 0 ? fontBold : fontRegular, color: darkColor }));
  }
  y -= partyHeight - 90;
  // Baner faktury korygującej (jeśli dotyczy)
  if (invoice.isCorrection) {
    page.drawRectangle({
      x: 40,
      y: y - 122,
      width: width - 80,
      height: 32,
      color: rgb(0.99, 0.95, 0.95),
      borderColor: rgb(0.85, 0.3, 0.3),
      borderWidth: 0.8,
    });
    page.drawText(cleanText(`KOREKTA DO FAKTURY: ${invoice.originalInvoiceNumber || "FA/ORYG"} z dnia ${invoice.originalIssueDate || invoice.issueDate}`), {
      x: 52,
      y: y - 105,
      size: 8.5,
      font: fontBold,
      color: rgb(0.7, 0.15, 0.15),
    });
    page.drawText(cleanText(`Przyczyna: ${invoice.correctionReason || "Korekta pozycji faktury"}${invoice.originalKsefNumber ? ` | Nr KSeF korygowanej: ${invoice.originalKsefNumber}` : ""}`), {
      x: 52,
      y: y - 117,
      size: 7.5,
      font: fontRegular,
      color: darkColor,
    });
    y -= 135;
  } else {
    y -= 110;
  }

  // ── Tabela Pozycji Faktury ──
  page.drawRectangle({
    x: 40,
    y: y - 18,
    width: width - 80,
    height: 22,
    color: rgb(0.92, 0.94, 0.96),
  });

  const headers = [
    { label: "Lp", x: 45, width: 25 },
    { label: cleanText(L.item), x: 75, width: 175 },
    { label: cleanText(L.qty), x: 255, width: 35 },
    { label: cleanText(L.unit), x: 295, width: 35 },
    { label: cleanText(L.net), x: 335, width: 55 },
    { label: cleanText(L.vatRate), x: 395, width: 35 },
    { label: cleanText(L.vatAmount), x: 435, width: 55 },
    { label: cleanText(L.gross), x: 495, width: 55 },
  ];

  for (const h of headers) {
    page.drawText(h.label, {
      x: h.x,
      y: y - 12,
      size: 8,
      font: fontBold,
      color: darkColor,
    });
  }

  y -= 25;

  const tableHeader = () => {
    page.drawRectangle({ x: 40, y: y - 18, width: width - 80, height: 22, color: rgb(0.92, 0.94, 0.96) });
    for (const h of headers) page.drawText(h.label, { x: h.x, y: y - 12, size: 8, font: fontBold, color: darkColor });
    y -= 25;
  };
  const cellText = (value: string, x: number, cellWidth: number, bold = false) => {
    const font = bold ? fontBold : fontRegular, text = cleanText(value);
    const measured = font.widthOfTextAtSize(text, 8);
    const size = measured > cellWidth ? 8 * cellWidth / measured : 8;
    page.drawText(text, { x, y: y - 11, size, font, color: darkColor });
  };
  // Preserve every character of long names and continue across pages.
  invoice.lines.forEach((line, idx) => {
    const nameLines = wrap(line.name, 173, 8.5, true);
    let offset = 0;
    while (offset < nameLines.length) {
      if (y < 100) { newPage(); tableHeader(); }
      const available = Math.max(1, Math.floor((y - 70) / 12));
      const chunk = nameLines.slice(offset, offset + available);
      const rowHeight = Math.max(config.layout === "compact" ? 17 : 20, chunk.length * 12 + (config.layout === "compact" ? 3 : 6));
    const rowBg = idx % 2 === 1 ? rgb(0.98, 0.99, 1) : rgb(1, 1, 1);
    page.drawRectangle({
      x: 40,
      y: y - rowHeight + 4,
      width: width - 80,
      height: rowHeight,
      color: rowBg,
      borderColor: rgb(0.93, 0.94, 0.95),
      borderWidth: 0.5,
    });

    const netVal = formatMoney(lineNet(line), invoice.currency);
    const vatVal = formatMoney(lineVat(line), invoice.currency);
    const grossVal = formatMoney(lineGross(line), invoice.currency);

    chunk.forEach((text, index) => page.drawText(text, { x: 75, y: y - 11 - index * 12, size: 8.5, font: fontBold, color: darkColor }));
    if (offset === 0) {
      cellText(String(idx + 1), 45, 25);
      cellText(String(line.quantity), 255, 35);
      cellText(line.unit, 295, 35);
      cellText(netVal, 335, 55);
      cellText(vatRateLabel(line.vatRate), 395, 35);
      cellText(vatVal, 435, 55);
      cellText(grossVal, 495, 55, true);
    }
    y -= rowHeight;
    offset += chunk.length;
    }
  });

  y -= 15;
  ensureSpace(100);

  // ── Podsumowanie, Płatność i Kod QR CIRFMF ──
  const summaryBoxWidth = 200;
  const summaryX = width - 40 - summaryBoxWidth;

  page.drawRectangle({
    x: summaryX,
    y: y - 75,
    width: summaryBoxWidth,
    height: 80,
    color: lightBg,
    borderColor: borderColor,
    borderWidth: 1,
  });

  page.drawText(`${cleanText(L.totalNet)}:`, { x: summaryX + 12, y: y - 18, size: 9, font: fontRegular, color: grayColor });
  page.drawText(cleanText(formatMoney(t.net, invoice.currency)), { x: summaryX + 115, y: y - 18, size: 9, font: fontBold, color: darkColor });

  page.drawText(`${cleanText(L.totalVat)}:`, { x: summaryX + 12, y: y - 34, size: 9, font: fontRegular, color: grayColor });
  page.drawText(cleanText(formatMoney(t.vat, invoice.currency)), { x: summaryX + 115, y: y - 34, size: 9, font: fontBold, color: darkColor });

  // Pasek Do zapłaty (Gross)
  page.drawRectangle({
    x: summaryX + 6,
    y: y - 68,
    width: summaryBoxWidth - 12,
    height: 26,
    color: rgb(0.9, 0.94, 1),
    borderColor: primaryColor,
    borderWidth: 0.5,
  });
  page.drawText(`${cleanText(L.totalGross)}:`.toUpperCase(), { x: summaryX + 12, y: y - 56, size: 9.5, font: fontBold, color: primaryColor });
  page.drawText(cleanText(formatMoney(t.gross, invoice.currency)), { x: summaryX + 110, y: y - 56, size: 11, font: fontBold, color: primaryColor });

  // Informacje o płatności (po lewej stronie)
  const payInfoWidth = 195;
  page.drawRectangle({
    x: 40,
    y: y - 75,
    width: payInfoWidth,
    height: 80,
    color: lightBg,
    borderColor: borderColor,
    borderWidth: 1,
  });

  page.drawText(cleanText(L.paymentMethod).toUpperCase(), { x: 50, y: y - 18, size: 8, font: fontBold, color: grayColor });
  page.drawText(cleanText(paymentMethodLabel(invoice.paymentMethod, invoice.language || "PL")), {
    x: 50,
    y: y - 32,
    size: 9.5,
    font: fontBold,
    color: darkColor,
  });

  const bankSnapshot = invoice.bankAccountSnapshot as (CompanyBankAccount & { bankName?: string }) | undefined;
  if (bankSnapshot) {
    page.drawText(`Bank: ${cleanText(bankSnapshot.bankName || "—")}`, { x: 50, y: y - 44, size: 7, font: fontRegular, color: grayColor });
    page.drawText(`IBAN: ${cleanText(bankSnapshot.accountNumber)}`, { x: 50, y: y - 54, size: 7.5, font: fontBold, color: darkColor });
    if (bankSnapshot.swiftBic) {
      page.drawText(`SWIFT: ${cleanText(bankSnapshot.swiftBic)} | Waluta: ${cleanText(bankSnapshot.currency)}`, { x: 50, y: y - 64, size: 6.5, font: fontRegular, color: grayColor });
    }
  } else if (compIban) {
    page.drawText("Numer konta bankowego (IBAN):", { x: 50, y: y - 48, size: 7.5, font: fontRegular, color: grayColor });
    page.drawText(cleanText(compIban), { x: 50, y: y - 62, size: 8.5, font: fontBold, color: darkColor });
  }

  // ── Box KOD QR CIRFMF (w środku między płatnością a podsumowaniem) ──
  const qrBoxX = 40 + payInfoWidth + 8;
  const qrBoxWidth = summaryX - qrBoxX - 8;
  page.drawRectangle({
    x: qrBoxX,
    y: y - 75,
    width: qrBoxWidth,
    height: 80,
    color: lightBg,
    borderColor: borderColor,
    borderWidth: 1,
  });

  try {
    const qrUrl = invoice.qrCodeI || (invoice.ksefXml ? buildKsefVerificationUrl({
      sellerNip: sellerNip,
      issueDate: invoice.issueDate,
      environment: invoice.ksef?.environment || "test",
      xmlContent: invoice.ksefXml,
    }) : null);
    if (!qrUrl) throw new Error("Brak XML faktury potrzebnego do kodu I.");
    const qrLabel = getKsefQrLabel(invoice.ksefNumber || invoice.ksef?.number, invoice.isOffline);
    const qrPng = await generateQrPngBuffer(qrUrl, 160);
    const qrImage = await pdfDoc.embedPng(qrPng);

    const qrSize = 50;
    const qrImgX = qrBoxX + (qrBoxWidth - qrSize) / 2;
    page.drawImage(qrImage, {
      x: qrImgX,
      y: y - 56,
      width: qrSize,
      height: qrSize,
    });

    const isAcceptedKsef = Boolean((invoice.ksefNumber || invoice.ksef?.number) && !invoice.isOffline);
    page.drawText(cleanText(qrLabel), {
      x: qrBoxX + 4,
      y: y - 66,
      size: 6,
      font: fontBold,
      color: isAcceptedKsef ? successColor : warningColor,
    });

    if (invoice.isOffline && invoice.offlineDeadline) {
      page.drawText(`Termin: ${cleanText(invoice.offlineDeadline)}`, {
        x: qrBoxX + 4,
        y: y - 72,
        size: 5.5,
        font: fontRegular,
        color: rgb(0.85, 0.2, 0.2),
      });
    }
  } catch (err) {
    console.warn("[PDF] Kod QR KSeF niedostępny:", err);
    page.drawText(cleanText("Kod QR niedostępny"), { x: qrBoxX + 4, y: y - 42, size: 7, font: fontRegular, color: grayColor });
  }

  y -= 95;

  // ── Przeliczenie NBP dla walut obcych (art. 31a ustawy o VAT) ──
  if (invoice.currency && invoice.currency !== "PLN" && invoice.exchangeRate) {
    ensureSpace(35);
    const effRate = invoice.exchangeRate / (invoice.exchangeRateUnit || 1);
    const vatPln = invoice.totalVatPln ?? (t.vat * effRate);
    page.drawRectangle({
      x: 40,
      y: y - 24,
      width: width - 80,
      height: 22,
      color: rgb(0.95, 0.97, 1),
      borderColor: rgb(0.8, 0.88, 0.98),
      borderWidth: 0.6,
    });
    page.drawText(cleanText(`Przeliczenie NBP (art. 31a ustawy o VAT): Tabela ${invoice.exchangeRateTable || "—"} z dn. ${invoice.exchangeRateDate || "—"} | Kurs: 1 ${invoice.currency} = ${effRate.toFixed(4)} PLN | VAT w PLN: ${vatPln.toFixed(2)} PLN`), {
      x: 48,
      y: y - 16,
      size: 7,
      font: fontBold,
      color: rgb(0.12, 0.35, 0.75),
    });
    y -= 30;
  }

  // Keep full notes and KSeF information, including page continuations.
  const information: string[] = [];
  if (invoice.ksef?.number) information.push(`KSeF Numer: ${invoice.ksef.number} | Srodowisko: ${invoice.ksef.environment || "test"}`);
  else if (invoice.isOffline) information.push(`Dokument wystawiony w trybie awaryjnym/offline. Termin przeslania: ${invoice.offlineDeadline || "nastepny dzien roboczy"}`);
  if (invoice.notes) information.push(`Uwagi: ${invoice.notes}`);
  for (const paragraph of information) {
    for (const text of wrap(paragraph, width - 104, 8)) {
      ensureSpace(16);
      page.drawText(text, { x: 52, y: y - 12, size: 8, font: fontRegular, color: darkColor });
      y -= 12;
    }
    y -= 8;
  }

  // ── Stopka na każdej stronie ──
  for (const [index, footerPage] of pdfDoc.getPages().entries()) {
  footerPage.drawLine({
    start: { x: 40, y: 45 },
    end: { x: width - 40, y: 45 },
    thickness: 0.5,
    color: borderColor,
  });
  footerPage.drawText(cleanText(config.footerText), {
    x: 40,
    y: 32,
    size: Math.min(7.5, 7.5 * (width - 125) / Math.max(1, fontRegular.widthOfTextAtSize(cleanText(config.footerText), 7.5))),
    font: fontRegular,
    color: grayColor,
  });
  footerPage.drawText(`${index + 1} / ${pdfDoc.getPageCount()}`, { x: width - 75, y: 32, size: 7.5, font: fontRegular, color: grayColor });
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
