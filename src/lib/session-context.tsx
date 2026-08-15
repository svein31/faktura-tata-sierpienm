"use client";

import * as React from "react";
import type { SessionUser } from "./types";

/**
 * Kontekst zalogowanego użytkownika (ustawiany przez AppShell w (app)/layout).
 * Poza tym kontekstem dane użytkownika nigdy nie są przechowywane po stronie
 * klienta (brak localStorage).
 */
const SessionContext = React.createContext<{ user: SessionUser } | null>(null);

export function SessionProvider({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  return <SessionContext.Provider value={{ user }}>{children}</SessionContext.Provider>;
}

export function useSessionUser(): SessionUser {
  const ctx = React.useContext(SessionContext);
  if (!ctx) throw new Error("useSessionUser musi być użyty wewnątrz SessionProvider (strony (app)).");
  return ctx.user;
}
