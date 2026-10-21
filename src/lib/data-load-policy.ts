export type DataMode = "shell" | "list" | "full";

/** Route reads own the dashboard/list data; catalogs are needed by other screens. */
export function dataLoadPolicy(pathname: string, companyId: string | null) {
  if (pathname === "/dashboard" || pathname === "/invoices" || /^\/invoices\/[a-f\d]{24}$/i.test(pathname)) return { mode: "shell" as const, companyId: undefined };
  const full = ["/invoices/recurring", "/advances", "/recurring", "/reminders", "/finances", "/calendar", "/settings/companies"].includes(pathname);
  return { mode: full ? "full" as const : "list" as const, companyId: pathname === "/settings/companies" ? undefined : companyId || "unassigned" };
}

export function bootstrapUrl(mode: DataMode, companyId?: string) {
  const query = new URLSearchParams();
  if (mode === "shell") query.set("mode", "shell");
  else if (mode === "list") query.set("invoiceMode", "list");
  if (companyId && mode !== "shell") query.set("companyId", companyId);
  return "/api/data" + (query.size ? "?" + query.toString() : "");
}

/** Only concurrent reads share work. Settled results are never cached. */
export function createSingleFlight<T>() {
  const pending = new Map<string, Promise<T>>();
  return {
    run(key: string, read: () => Promise<T>) {
      const current = pending.get(key);
      if (current) return current;
      const request = read().finally(() => { if (pending.get(key) === request) pending.delete(key); });
      pending.set(key, request);
      return request;
    },
    clear: () => pending.clear(),
  };
}
