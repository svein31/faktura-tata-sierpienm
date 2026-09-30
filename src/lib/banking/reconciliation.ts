import type { StatementTransaction } from "./statement-parser";
export type ReconciliationCandidate = { id: string; kind: "invoice" | "expense"; number: string; type: "sale" | "purchase"; currency: string; totalGross: number; paidAmount: number; contractorName?: string; contractorNip?: string };
const cents = (value: number) => Math.round(value * 100);
function includesNumber(text: string, number: string) {
  if (!number.trim()) return false;
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("(^|[^\\p{L}\\p{N}])" + escape(number.trim()) + "(?=$|[^\\p{L}\\p{N}])", "iu").test(text);
}
export function reconcile(transactions: StatementTransaction[], candidates: ReconciliationCandidate[]) {
  return transactions.map((tx, index) => {
    const amount = cents(Math.abs(tx.amount)), text = tx.title + " " + tx.senderName;
    const matches = candidates.filter(c => c.currency === tx.currency && c.type === (tx.amount > 0 ? "sale" : "purchase") && c.totalGross > c.paidAmount).map(c => {
      const remaining = cents(c.totalGross) - cents(c.paidAmount);
      const number = includesNumber(tx.title, c.number);
      const nip = !!c.contractorNip && c.contractorNip.replace(/\D/g, "").length === 10 && text.replace(/[ -]/g, "").includes(c.contractorNip.replace(/\D/g, ""));
      const signals = [number && "number", nip && "nip", amount === remaining && "amount"].filter(Boolean) as string[];
      // An invoice number can identify a partial payment. NIP alone needs an exact amount.
      const score = number ? (amount === remaining ? 100 : 90) : nip && amount === remaining ? 80 : 0;
      return { ...c, score, signals };
    }).filter(c => c.score > 0).sort((a, b) => b.score - a.score);
    const best = matches[0], ambiguous = matches.length > 1 && matches[1].score === best.score;
    const matched = best && !ambiguous ? best : undefined;
    return { ...tx, id: "tx-" + index, matchedInvoiceId: matched?.kind === "invoice" ? matched.id : undefined, matchedExpenseId: matched?.kind === "expense" ? matched.id : undefined, matchedInvoiceNumber: matched?.number, matchedContractorName: matched?.contractorName, confidence: matched ? (matched.score === 100 ? "exact" : "high") : "none", ambiguous, candidates: matches.slice(0, 5).map(c => ({ id: c.id, kind: c.kind, number: c.number, score: c.score, signals: c.signals })) };
  });
}
