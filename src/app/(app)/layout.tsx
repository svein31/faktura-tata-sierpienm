import type { Metadata } from "next";
export const metadata: Metadata = { robots: { index: false, follow: false } };
import { redirect } from "next/navigation";
import { getSessionUser, toPublicUser } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";

/**
 * Serwerowa brama dla wszystkich stron biznesowych:
 * weryfikacja sesji w bazie (hash tokena + expiry) → redirect na /login.
 * Właściwa izolacja danych odbywa się w API (każde zapytanie filtruje po userId).
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <AppShell user={toPublicUser(user)}>{children}</AppShell>;
}
