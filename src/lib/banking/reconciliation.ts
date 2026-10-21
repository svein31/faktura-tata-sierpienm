import type { StatementTransaction } from "./statement-parser";
export type ReconciliationCandidate = { id: string; kind: "invoice" | "expense"; number: string; type: "sale" | "purchase"; currency: string; totalGross: number; paidAmount: number; contractorName?: string; contractorNip?: string; documentRevision?: string };
const cents = (value: number) => Math.round(value * 100);
function includesNumber(text: string, number: string) {
  if (!number.trim()) return false;
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("(^|[^\\p{L}\\p{N}/_.-])" + escape(number.trim()) + "(?=$|[^\\p{L}\\p{N}/_.-])", "iu").test(text);
}
export function reconcile(transactions: StatementTransaction[], candidates: ReconciliationCandidate[], reserve = false) {
  const reserved = new Map<string, number>();
  return transactions.map((tx, index) => {
    const amount = cents(Math.abs(tx.amount)), text = tx.title + " " + tx.senderName;
    const availableCandidates = candidates.map(c => ({ ...c, paidAmount: c.paidAmount + (reserved.get(c.kind + ":" + c.id) || 0) / 100 }));
    const matches = availableCandidates.filter(c => !tx.reversal && amount > 0 && (c.kind !== "expense" || amount >= cents(c.totalGross) - cents(c.paidAmount)) && c.currency === tx.currency && c.type === (tx.amount > 0 ? "sale" : "purchase") && c.totalGross > c.paidAmount).map(c => {
      const remaining = cents(c.totalGross) - cents(c.paidAmount);
      const number = includesNumber(tx.title, c.number);
      const nip = !!c.contractorNip && c.contractorNip.replace(/\D/g, "").length === 10 && new RegExp("(^|\\D)" + c.contractorNip.replace(/\D/g, "") + "(?=$|\\D)").test(text.replace(/[ -]/g, ""));
      const signals = [number && "number", nip && "nip", amount === remaining && "amount", amount > remaining && "overpayment"].filter(Boolean) as string[];
      // An invoice number can identify a partial payment. NIP alone needs an exact amount.
      const score = number ? (amount === remaining ? 100 : amount > remaining ? 95 : 90) : nip && amount === remaining ? 80 : 0;
      return { ...c, score, signals, remaining, automatic: amount <= remaining && (c.kind !== "expense" || amount === remaining) };
    }).filter(c => c.score > 0).sort((a, b) => b.score - a.score);
    const best = matches[0], ambiguous = matches.length > 1 && matches[1].score === best.score;
    const matched = best && !ambiguous && best.automatic ? best : undefined;
    if (reserve && matched) reserved.set(matched.kind + ":" + matched.id, (reserved.get(matched.kind + ":" + matched.id) || 0) + amount);
    return { ...tx, id: "tx-" + index, matchedInvoiceId: matched?.kind === "invoice" ? matched.id : undefined, matchedExpenseId: matched?.kind === "expense" ? matched.id : undefined, matchedInvoiceNumber: matched?.number, matchedDocumentRevision: matched?.documentRevision, matchedContractorName: matched?.contractorName, confidence: matched ? (matched.score === 100 ? "exact" : "high") : "none", ambiguous, candidates: matches.slice(0, 5).map(c => ({ id: c.id, kind: c.kind, number: c.number, score: c.score, signals: c.signals })) };
  });
}
