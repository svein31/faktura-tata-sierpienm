import { createHash, randomUUID } from "node:crypto";
import { ApiError, cleanStr } from "@/lib/api";

export type AccountingTask = { id: string; title: string; kind: "check" | "missing"; done: boolean; note: string; assigneeId: string | null; changedBy: string; changedAt: string };
export function accountingWorkspaceId(companyId: string, month: unknown) {
  if (typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new ApiError(400, "Wybierz miesiąc w formacie RRRR-MM.");
  return createHash("sha256").update(`${companyId}:${month}`).digest("hex").slice(0, 24);
}
export function changeAccountingTask(items: AccountingTask[], body: Record<string, unknown>, userId: string, now = new Date()) {
  const action = body.action;
  if (action === "add") {
    if (items.length >= 100) throw new ApiError(400, "Lista miesiąca może mieć do 100 zadań.");
    const title = cleanStr(body.title, 200, "zadanie");
    if (!title || !["check", "missing"].includes(String(body.kind))) throw new ApiError(400, "Wpisz zadanie lub brakujący dokument.");
    return [...items, { id: randomUUID(), title, kind: body.kind as "check" | "missing", done: false, note: "", assigneeId: null, changedBy: userId, changedAt: now.toISOString() }];
  }
  const item = items.find(i => i.id === body.itemId);
  if (!item) throw new ApiError(404, "Nie znaleziono zadania.");
  if (action === "remove") return items.filter(i => i.id !== item.id);
  let update: Partial<AccountingTask>;
  if (action === "done" && typeof body.done === "boolean") update = { done: body.done };
  else if (action === "note") update = { note: cleanStr(body.note, 1000, "notatka") };
  else if (action === "assign" && (body.assigneeId === null || typeof body.assigneeId === "string")) update = { assigneeId: body.assigneeId };
  else throw new ApiError(400, "Nieprawidłowa zmiana zadania.");
  return items.map(i => i.id === item.id ? { ...i, ...update, changedBy: userId, changedAt: now.toISOString() } : i);
}
