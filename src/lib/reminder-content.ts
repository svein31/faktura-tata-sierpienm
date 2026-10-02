import { round2, formatMoney } from "./format";
import {financialAmounts} from "./accountant-summary";
import { addCalendarDays } from "./scheduling";
import { isIsoCalendarDate } from "./nbp";
import type { Invoice } from "./types";
export function dueReminderContent(invoice: Invoice, today: string, seller: string) {
  if (invoice.type !== "sale" || invoice.isProforma || invoice.isCorrection || invoice.status === "draft" || invoice.status === "paid" || invoice.documentStatus === "draft" || invoice.documentStatus === "cancelled" || invoice.paymentStatus === "paid" || !isIsoCalendarDate(invoice.dueDate)) return null;
  const remaining = round2(financialAmounts(invoice).totalGross - (invoice.paidAmount || 0));
  if (remaining <= 0 || today < addCalendarDays(invoice.dueDate,-3)) return null;
  const stage = today < invoice.dueDate ? "before" : today < addCalendarDays(invoice.dueDate,7) ? "due" : "overdue";
  return { stage, remaining, subject: `Przypomnienie o terminie faktury ${invoice.number}`,
    text: `Szanowni Państwo,\n\nPrzypominamy o fakturze ${invoice.number}.\nTermin: ${invoice.dueDate}.\nPozostała kwota według naszych zapisów: ${formatMoney(remaining,invoice.currency)}.\n\nJeżeli należność została już uregulowana, prosimy pominąć tę wiadomość.\n\n${seller}` };
}
