import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { formatMoney, invoiceTotals, lineGross, lineNet, lineVat, vatRateLabel } from "../format";
import { invoiceLabels, paymentMethodLabel } from "../i18n";
import type { CompanyProfile, Contractor, Invoice } from "../types";
import { buildKsefVerificationUrl, generateQrPngBuffer, getKsefQrLabel } from "../ksef";

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
  company?: CompanyProfile | undefined
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
  pdfDoc.setAuthor(effectiveCompany.companyName || effectiveCompany.name || "Fakturo");

  const page = pdfDoc.addPage([595.28, 841.89]); // A4 (points)
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const L = invoiceLabels[invoice.language || "PL"];
  const t = invoiceTotals(invoice);

  // Kolory
  const primaryColor = rgb(0.12, 0.44, 0.98); // #1e70fa
  const darkColor = rgb(0.09, 0.11, 0.15); // #171c26
  const grayColor = rgb(0.42, 0.45, 0.5); // #6b7280
  const lightBg = rgb(0.96, 0.97, 0.98); // #f4f6f8
  const borderColor = rgb(0.88, 0.9, 0.92);
  const successColor = rgb(0.08, 0.55, 0.35);
  const warningColor = rgb(0.85, 0.45, 0.05);

  let y = height - 40;

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
          const res = await fetch(rawLogo);
          if (res.ok) {
            const arr = await res.arrayBuffer();
            imgBuffer = Buffer.from(arr);
            const contentType = res.headers.get("content-type") || "";
            isPng = contentType.includes("png") || rawLogo.toLowerCase().includes(".png");
          }
        } catch (fetchErr) {
          console.warn("[PDF] Nie udało się pobrać logo z URL:", fetchErr);
        }
      }

      if (imgBuffer) {
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
    y: y - 54,
    width: width - 80,
    height: 64,
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

  page.drawText(`Nr: ${cleanText(invoice.number)}`, {
    x: titleX,
    y: y - 38,
    size: 11,
    font: fontBold,
    color: darkColor,
  });

  if (invoice.ksefNumber || invoice.ksef?.number) {
    page.drawText(`KSeF: ${cleanText(invoice.ksefNumber || invoice.ksef?.number)}`, {
      x: titleX,
      y: y - 50,
      size: 7.5,
      font: fontRegular,
      color: grayColor,
    });
  } else if (invoice.isOffline) {
    page.drawText(`Tryb awaryjny KSeF (OFFLINE)`, {
      x: titleX,
      y: y - 50,
      size: 7.5,
      font: fontBold,
      color: warningColor,
    });
  }

  // Daty (prawa strona nagłówka)
  const dateX = width - 230;
  page.drawText(`${cleanText(L.issueDate)}: ${cleanText(invoice.issueDate)}`, {
    x: dateX,
    y: y - 18,
    size: 9,
    font: fontRegular,
    color: grayColor,
  });
  page.drawText(`${cleanText(L.saleDate)}: ${cleanText(invoice.saleDate)}`, {
    x: dateX,
    y: y - 31,
    size: 9,
    font: fontRegular,
    color: grayColor,
  });
  page.drawText(`${cleanText(L.dueDate)}: ${cleanText(invoice.dueDate)}`, {
    x: dateX,
    y: y - 44,
    size: 9,
    font: fontRegular,
    color: grayColor,
  });

  y -= 75;

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

  // Box Sprzedawca
  page.drawRectangle({
    x: 40,
    y: y - 85,
    width: colWidth,
    height: 90,
    color: lightBg,
    borderColor: borderColor,
    borderWidth: 1,
  });
  page.drawText(cleanText(L.seller).toUpperCase(), {
    x: 52,
    y: y - 18,
    size: 8.5,
    font: fontBold,
    color: primaryColor,
  });
  page.drawText(cleanText(sellerName), {
    x: 52,
    y: y - 34,
    size: 10,
    font: fontBold,
    color: darkColor,
  });
  page.drawText(`NIP: ${cleanText(sellerNip)}`, {
    x: 52,
    y: y - 48,
    size: 9,
    font: fontRegular,
    color: darkColor,
  });
  page.drawText(cleanText(sellerAddrStr), {
    x: 52,
    y: y - 62,
    size: 8.5,
    font: fontRegular,
    color: grayColor,
  });

  // Box Nabywca
  const buyerX = 40 + colWidth + 15;
  page.drawRectangle({
    x: buyerX,
    y: y - 85,
    width: colWidth,
    height: 90,
    color: lightBg,
    borderColor: borderColor,
    borderWidth: 1,
  });
  page.drawText(cleanText(L.buyer).toUpperCase(), {
    x: buyerX + 12,
    y: y - 18,
    size: 8.5,
    font: fontBold,
    color: rgb(0.08, 0.65, 0.45),
  });
  page.drawText(cleanText(buyerName), {
    x: buyerX + 12,
    y: y - 34,
    size: 10,
    font: fontBold,
    color: darkColor,
  });
  page.drawText(`NIP: ${cleanText(buyerNip)}`, {
    x: buyerX + 12,
    y: y - 48,
    size: 9,
    font: fontRegular,
    color: darkColor,
  });
  page.drawText(cleanText(buyerAddrStr), {
    x: buyerX + 12,
    y: y - 62,
    size: 8.5,
    font: fontRegular,
    color: grayColor,
  });
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

  // Rzędy pozycji
  invoice.lines.forEach((line, idx) => {
    const rowBg = idx % 2 === 1 ? rgb(0.98, 0.99, 1) : rgb(1, 1, 1);
    page.drawRectangle({
      x: 40,
      y: y - 16,
      width: width - 80,
      height: 20,
      color: rowBg,
      borderColor: rgb(0.93, 0.94, 0.95),
      borderWidth: 0.5,
    });

    const netVal = formatMoney(lineNet(line), invoice.currency);
    const vatVal = formatMoney(lineVat(line), invoice.currency);
    const grossVal = formatMoney(lineGross(line), invoice.currency);

    page.drawText(String(idx + 1), { x: 48, y: y - 11, size: 8, font: fontRegular, color: grayColor });
    page.drawText(cleanText(line.name).substring(0, 32), { x: 75, y: y - 11, size: 8.5, font: fontBold, color: darkColor });
    page.drawText(String(line.quantity), { x: 260, y: y - 11, size: 8.5, font: fontRegular, color: darkColor });
    page.drawText(cleanText(line.unit), { x: 298, y: y - 11, size: 8, font: fontRegular, color: grayColor });
    page.drawText(cleanText(netVal), { x: 335, y: y - 11, size: 8.5, font: fontRegular, color: darkColor });
    page.drawText(cleanText(vatRateLabel(line.vatRate)), { x: 400, y: y - 11, size: 8, font: fontRegular, color: darkColor });
    page.drawText(cleanText(vatVal), { x: 435, y: y - 11, size: 8.5, font: fontRegular, color: darkColor });
    page.drawText(cleanText(grossVal), { x: 495, y: y - 11, size: 8.5, font: fontBold, color: darkColor });

    y -= 20;
  });

  y -= 15;

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

  if (compIban) {
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
    const qrUrl = invoice.qrCodeI || buildKsefVerificationUrl({
      sellerNip: sellerNip,
      issueDate: invoice.issueDate,
      environment: invoice.ksef?.environment || "test",
      ksefNumber: invoice.ksefNumber || invoice.ksef?.number,
    });
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
    console.warn("[PDF] Nie udało się wygenerować kodu QR KSeF:", err);
    page.drawText("KSeF QR", { x: qrBoxX + 15, y: y - 42, size: 8, font: fontRegular, color: grayColor });
  }

  y -= 95;

  // ── Uwagi / KSeF info ──
  if (invoice.ksef?.number || invoice.notes || invoice.isOffline) {
    page.drawRectangle({
      x: 40,
      y: y - 35,
      width: width - 80,
      height: 40,
      color: rgb(0.97, 0.98, 0.99),
      borderColor: borderColor,
      borderWidth: 0.5,
    });

    if (invoice.ksef?.number) {
      page.drawText(`KSeF Numer: ${cleanText(invoice.ksef.number)} | Srodowisko: ${cleanText(invoice.ksef.environment || "test")}`, {
        x: 52,
        y: y - 16,
        size: 8,
        font: fontBold,
        color: successColor,
      });
    } else if (invoice.isOffline) {
      page.drawText(`Dokument wystawiony w trybie awaryjnym/offline. Wymaga przeslania do KSeF w terminie: ${cleanText(invoice.offlineDeadline || "następny dzień roboczy")}`, {
        x: 52,
        y: y - 16,
        size: 7.5,
        font: fontBold,
        color: warningColor,
      });
    }

    if (invoice.notes) {
      page.drawText(`Uwagi: ${cleanText(invoice.notes).substring(0, 90)}`, {
        x: 52,
        y: y - (invoice.ksef?.number || invoice.isOffline ? 28 : 20),
        size: 8,
        font: fontRegular,
        color: darkColor,
      });
    }

    y -= 50;
  }

  // ── Stopka ──
  page.drawLine({
    start: { x: 40, y: 45 },
    end: { x: width - 40, y: 45 },
    thickness: 0.5,
    color: borderColor,
  });
  page.drawText("Dokument wygenerowany elektronicznie w systemie Fakturo (zgodny z KSeF FA/3).", {
    x: 40,
    y: 32,
    size: 7.5,
    font: fontRegular,
    color: grayColor,
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
