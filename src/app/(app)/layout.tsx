import type { Metadata } from "next";
export const metadata: Metadata = { robots: { index: false, follow: false } };
import { toPublicUser } from "@/lib/auth";
import { getInitialAppData } from "@/lib/server/app-initial-data";
import { AppShell } from "@/components/layout/app-shell";
import { LEGAL_VERSIONS } from "@/lib/legal/config";

/**
 * Serwerowa brama dla wszystkich stron biznesowych:
 * weryfikacja sesji w bazie (hash tokena + expiry) → redirect na /login.
 * Właściwa izolacja danych odbywa się w API (każde zapytanie filtruje po userId).
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, bootstrap } = await getInitialAppData();
  return <AppShell user={toPublicUser(user)} initialBootstrap={bootstrap ? { ...bootstrap, invoices: [] } : null} needsTermsAcceptance={user.termsAcceptedVersion !== LEGAL_VERSIONS.terms}>{children}</AppShell>;
}
