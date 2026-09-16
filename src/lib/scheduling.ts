import { isIsoCalendarDate } from "@/lib/nbp";
export const recurrenceIntervals = ["weekly", "monthly", "quarterly", "yearly"] as const;
export type RecurrenceInterval = typeof recurrenceIntervals[number];
export function warsawDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function addCalendarDays(date: string, days: number): string {
  if (!isIsoCalendarDate(date) || !Number.isInteger(days)) throw new Error("Nieprawidłowa data harmonogramu.");
  const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10);
}
export function nextRecurrence(date: string, interval: string, anchorDay: number): string {
  if (!isIsoCalendarDate(date) || !recurrenceIntervals.includes(interval as RecurrenceInterval) || !Number.isInteger(anchorDay) || anchorDay < 1 || anchorDay > 31) throw new Error("Nieprawidłowy harmonogram.");
  if (interval === "weekly") return addCalendarDays(date, 7);
  const [year, month] = date.split("-").map(Number), months = interval === "monthly" ? 1 : interval === "quarterly" ? 3 : 12;
  const target = new Date(Date.UTC(year, month - 1 + months, 1, 12));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(anchorDay, lastDay)); return target.toISOString().slice(0, 10);
}
