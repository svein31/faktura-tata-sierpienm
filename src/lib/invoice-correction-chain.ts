import type { InvoiceLine } from "./types";
import { normalizeInvoiceLineAmounts } from "./invoice-input";
import { roundHalfUp } from "./tax/money";
import { invoiceTotals } from "./format";
import { correctionOriginalKsefNumber } from "./invoice-correction-eligibility";

/**
 * Łańcuch korekt („kolejna korekta”).
 *
 * Każda korekta przechowuje wyłącznie różnicę względem stanu przed nią:
 * wiersze „przed korektą” (ujemna ilość, stara cena) i „po korekcie”
 * (dodatnia ilość, nowa cena) albo podpisane różnice ilości. Zsumowanie
 * ilości identycznych pozycji (nazwa, j.m., cena, VAT) z faktury pierwotnej
 * i wszystkich wcześniejszych korekt daje dokładny stan bieżący — bez
 * zdublowanych par przed/po (2 pozycje pozostają 2 pozycjami, nie 4).
 */

type ChainLine = Pick<InvoiceLine, "name" | "unit" | "netPrice" | "vatRate" | "quantity"> & Partial<InvoiceLine>;

const lineKey = (line: ChainLine) => JSON.stringify([
  String(line.name ?? "").trim(), String(line.unit ?? "szt.").trim() || "szt.", Number(line.netPrice), String(line.vatRate),
  line.settlementNet ?? null, line.settlementVat ?? null,
]);

/** Apply signed correction rows onto a base state and return the resulting positions. */
export function applyCorrectionLines(base: ChainLine[], ...corrections: ChainLine[][]): InvoiceLine[] {
  const order: string[] = [];
  const merged = new Map<string, InvoiceLine>();
  const add = (raw: ChainLine, sourceId?: string) => {
    const line = normalizeInvoiceLineAmounts({ ...raw, unit: raw.unit || "szt." } as InvoiceLine);
    const key = lineKey(line);
    const current = merged.get(key);
    if (current) {
      current.quantity = roundHalfUp(current.quantity + line.quantity, 6);
      return;
    }
    order.push(key);
    merged.set(key, { ...line, id: sourceId ?? line.id, quantity: roundHalfUp(line.quantity, 6) });
  };
  base.forEach((line, index) => add(line, line.id || `source-${index}`));
  for (const rows of corrections) for (const line of rows) add(line);
  const usedIds = new Set<string>();
  return order
    .map(key => merged.get(key)!)
    .filter(line => line.quantity !== 0 && !(Number(line.netPrice) === 0 && !line.settlementNet && !line.settlementVat))
    .map((line, index) => {
      const candidate = line.id && !line.id.startsWith("correction-") ? line.id : "";
      let id = candidate && !usedIds.has(candidate) ? candidate : `source-${index}`;
      let suffix = index;
      while (usedIds.has(id)) {
        suffix += 1;
        id = `source-${suffix}`;
      }
      usedIds.add(id);
      return { ...line, id };
    });
}

export interface ChainCorrection {
  id: string;
  isCorrection?: boolean | null;
  status?: string | null;
  documentStatus?: string | null;
  ksefStatus?: string | null;
  ksefNumber?: unknown;
  ksef?: unknown;
  lines: unknown;
}

/** Saved (non-draft) and non-cancelled/non-rejected corrections change the state of the corrected invoice. */
export function isActiveCorrection(correction: ChainCorrection): boolean {
  if (correction.isCorrection === false) return false;
  if (correction.status === "cancelled" || correction.documentStatus === "cancelled") return false;
  if (correctionOriginalKsefNumber(correction)) return true;
  const ksefObj = correction.ksef && typeof correction.ksef === "object" ? (correction.ksef as { status?: unknown }) : null;
  if (correction.ksefStatus === "rejected" || correction.status === "ksef_rejected" || ksefObj?.status === "REJECTED") {
    return false;
  }
  return correction.status !== "draft";
}

/** State of the root invoice after all active prior corrections (chronological order). */
export function effectiveCorrectionLines(rootLines: unknown, priorCorrections: ChainCorrection[]): InvoiceLine[] {
  const base = (Array.isArray(rootLines) ? rootLines : []) as ChainLine[];
  const active = priorCorrections.filter(isActiveCorrection).map(c => (Array.isArray(c.lines) ? c.lines : []) as ChainLine[]);
  return applyCorrectionLines(base, ...active);
}

/** Human readable label of a before/after correction row (printouts, preview, PDF). */
export function correctionLineLabel(line: Pick<InvoiceLine, "id"> & { quantity?: number }): string | null {
  const id = String(line.id || "");
  if (id.startsWith("correction-before-")) {
    return typeof line.quantity === "number" && line.quantity > 0 ? "korekta wyrównująca" : "stan przed korektą";
  }
  if (id.startsWith("correction-after-")) return "stan po korekcie";
  if (id.startsWith("correction-new-")) return "nowa pozycja po korekcie";
  return null;
}

/**
 * Build editable „Pozycje po korekcie” for the correction creator:
 * - keeps every position from the root invoice visible (zeroed positions remain at quantity 0),
 * - when cumulative balance is <= 0 (already zeroed or over-corrected below zero in KSeF),
 *   initializes target quantities to 0 so targeting 0,00 zł automatically generates
 *   the exact balancing correction (+kwota nadkorekty),
 * - when editing an unsent correction (`savedDeltaLines`), reconstructs its target state.
 */
export function editableCorrectionTargetLines(
  effectiveLines: InvoiceLine[],
  rootLines?: unknown,
  savedDeltaLines?: InvoiceLine[],
): InvoiceLine[] {
  const rootList = (Array.isArray(rootLines) ? rootLines : []).map((raw, index) => {
    const r = raw as InvoiceLine;
    return normalizeInvoiceLineAmounts({
      ...r,
      id: r.id && !String(r.id).startsWith("correction-") ? String(r.id) : `root-${index}`,
      unit: r.unit || "szt.",
    });
  });

  if (savedDeltaLines && savedDeltaLines.length > 0) {
    const remappedDelta = savedDeltaLines.map(row => {
      const m = /^correction-after-(\d+)$/.exec(String(row.id || ""));
      if (m) {
        const src = effectiveLines[Number(m[1])];
        if (src?.id) return { ...row, id: src.id };
      }
      return row;
    });
    const afterAll = applyCorrectionLines(effectiveLines, remappedDelta);
    const positive = afterAll.filter(line => line.quantity > 0);
    if (positive.length > 0) {
      return appendMissingRootPositions(positive, rootList);
    }
    return zeroedCatalogue(effectiveLines, rootList);
  }

  const effectiveGross = invoiceTotals({ lines: effectiveLines }).gross;
  if (effectiveLines.length === 0 || effectiveGross <= 0) {
    return zeroedCatalogue(effectiveLines, rootList);
  }

  const positiveEffective = effectiveLines.filter(line => line.quantity > 0).map(line => ({ ...line }));
  if (positiveEffective.length === 0) {
    return zeroedCatalogue(effectiveLines, rootList);
  }
  return appendMissingRootPositions(positiveEffective, rootList);
}

function zeroedCatalogue(effectiveLines: InvoiceLine[], rootList: InvoiceLine[]): InvoiceLine[] {
  const base = rootList.length > 0 ? rootList : effectiveLines;
  const usedIds = new Set<string>();
  return base.map((line, index) => {
    const matchedEffective = effectiveLines[index];
    const candidate = matchedEffective?.id && !usedIds.has(matchedEffective.id)
      ? matchedEffective.id
      : line.id && !usedIds.has(line.id)
        ? line.id
        : `target-zero-${index}`;
    usedIds.add(candidate);
    return { ...line, id: candidate, quantity: 0 };
  });
}

function appendMissingRootPositions(target: InvoiceLine[], rootList: InvoiceLine[]): InvoiceLine[] {
  const result = target.map(line => ({ ...line }));
  const presentNames = new Set(result.map(l => `${l.name.trim().toLowerCase()}::${(l.unit || "szt.").trim().toLowerCase()}`));
  const usedIds = new Set(result.map(l => l.id).filter(Boolean) as string[]);
  rootList.forEach((rootLine, idx) => {
    const sig = `${rootLine.name.trim().toLowerCase()}::${(rootLine.unit || "szt.").trim().toLowerCase()}`;
    if (presentNames.has(sig)) return;
    presentNames.add(sig);
    let id = `zeroed-root-${idx}`;
    while (usedIds.has(id)) id = `${id}-x`;
    usedIds.add(id);
    result.push({ ...rootLine, id, quantity: 0 });
  });
  return result;
}

/**
 * Rebuild the editable „Pozycje po korekcie” of a saved correction from its
 * stored state-before snapshot and delta rows. Positions matching the snapshot
 * keep its identifiers, so an unchanged edit reproduces the same document.
 */
export function correctionAfterLines(originalLines: InvoiceLine[], deltaLines: InvoiceLine[]): InvoiceLine[] {
  return editableCorrectionTargetLines(originalLines, originalLines, deltaLines);
}
