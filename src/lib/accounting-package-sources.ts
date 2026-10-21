import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api";
import { csvCell } from "@/lib/accountant-summary";
import { documentMime } from "@/lib/document-inbox";

type Cost = { id: string; number: string; scanId: string | null; ksefRefNumber: string | null; attachmentUrl: string | null };
type File = { name: string; data: Uint8Array | string };
/** Include only company-owned, linked originals with a clean scanner verdict. Never fetch attachment URLs. */
export async function appendAccountingCostSources(db: Prisma.TransactionClient, companyId: string, costs: Cost[], files: File[]) {
  const scans = await db.expenseScan.findMany({ where: { companyId, OR: [{ expenseId: { in: costs.map(cost => cost.id) } }, { id: { in: costs.map(cost => cost.scanId).filter((id): id is string => Boolean(id)) } }] }, select: { id: true, expenseId: true, sizeBytes: true, safetyStatus: true }, orderBy: { id: "asc" } });
  const clean = scans.filter(scan => scan.safetyStatus === "clean");
  if (clean.reduce((sum, scan) => sum + Math.max(0, scan.sizeBytes), 0) > 20_000_000) throw new ApiError(413, "Oryginały kosztów przekraczają limit paczki 20 MB. Pobierz je osobno ze skrzynki dokumentów.");
  const report: unknown[][] = [["ID kosztu", "Numer", "Plik w paczce", "Informacja"]], added = new Set<string>();
  let totalBytes = 0;
  for (const cost of costs) {
    const candidates = scans.filter(scan => (scan.id === cost.scanId || scan.expenseId === cost.id) && (!scan.expenseId || scan.expenseId === cost.id));
    const scan = candidates.find(candidate => candidate.safetyStatus === "clean");
    let fileName = "", information = cost.ksefRefNumber ? "Źródło KSeF: " + cost.ksefRefNumber : cost.attachmentUrl ? "Załącznik wskazany w kartotece; pobierz osobno. Zewnętrzne adresy nie są pobierane do paczki." : "Brak dostępnego oryginału w skrzynce; uzupełnij dokument.";
    if (scan) {
      const current = await db.expenseScan.findFirst({ where: { id: scan.id, companyId, safetyStatus: "clean" }, select: { imageData: true, sha256: true, sizeBytes: true, mimeType: true, expenseId: true } });
      if (current?.imageData && (!current.expenseId || current.expenseId === cost.id)) {
        const match = current.imageData.match(/^data:[^;,]+;base64,([a-zA-Z0-9+/=]+)$/);
        const bytes = match ? Buffer.from(match[1], "base64") : Buffer.alloc(0);
        let mime = "";
        try { mime = documentMime(bytes); } catch { /* Invalid originals remain visible in the manifest. */ }
        if (mime === current.mimeType && bytes.length === current.sizeBytes && (!current.sha256 || createHash("sha256").update(bytes).digest("hex") === current.sha256)) {
          fileName = `koszty/${scan.id}.${mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : "jpg"}`;
          if (!added.has(fileName)) {
            totalBytes += bytes.length;
            if (totalBytes > 20_000_000) throw new ApiError(413, "Oryginały kosztów przekraczają limit paczki 20 MB. Pobierz je osobno ze skrzynki dokumentów.");
            files.push({ name: fileName, data: bytes }); added.add(fileName);
          }
          information = "Oryginał kosztu ze skrzynki; pozytywny wynik skanera.";
        } else information = "Oryginał wymaga ponownej kontroli integralności w skrzynce dokumentów.";
      }
    } else if (candidates.length) information = "Plik pominięty: brak pozytywnego wyniku skanera lub kwarantanna. Sprawdź dokument w skrzynce.";
    report.push([cost.id, cost.number, fileName, information]);
  }
  files.push({ name: "oryginaly-kosztow.csv", data: "\uFEFF" + report.map(row => row.map(csvCell).join(";")).join("\r\n") });
  return added.size;
}
