"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import type { SessionUser } from "./types";

interface SessionContextValue {
  user: SessionUser | null;
  status: "loading" | "authenticated" | "unauthenticated";
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = React.createContext<SessionContextValue | null>(null);

export function SessionProvider({
  user: initialUser,
  children,
  deferPublicCheck = false,
}: {
  user?: SessionUser | null;
  deferPublicCheck?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const needsPublicSession = !deferPublicCheck || pathname === "/" || pathname === "/login" || pathname === "/register";
  const deferUntilIdle = deferPublicCheck && pathname === "/";
  const [user, setUser] = React.useState<SessionUser | null>(initialUser ?? null);
  const [status, setStatus] = React.useState<"loading" | "authenticated" | "unauthenticated">(
    initialUser ? "authenticated" : "loading"
  );

  const fetchSession = React.useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { user: SessionUser };
        setUser(data.user);
        setStatus("authenticated");
      } else {
        setUser(null);
        setStatus("unauthenticated");
      }
    } catch {
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  React.useEffect(() => {
    if (initialUser) {
      setUser(initialUser);
      setStatus("authenticated");
      return;
    }
    // Public guides and pricing never need a database-backed session lookup.
    // The authenticated app has its own provider with the server-verified user.
    if (!needsPublicSession) return;
    if (!deferUntilIdle) {
      void fetchSession();
      return;
    }
    // Keep the anonymous homepage render independent of auth and network latency.
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(() => void fetchSession(), { timeout: 2000 });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = window.setTimeout(() => void fetchSession(), 1000);
    return () => window.clearTimeout(timer);
  }, [initialUser, fetchSession, needsPublicSession, deferUntilIdle]);

  const logout = React.useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
      setStatus("unauthenticated");
      window.location.href = "/login";
    }
  }, []);

  return (
    <SessionContext.Provider
      value={{
        user,
        status,
        refresh: fetchSession,
        logout,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = React.useContext(SessionContext);
  if (!ctx) {
    return {
      user: null,
      status: "unauthenticated",
      refresh: async () => {},
      logout: async () => {
        window.location.href = "/login";
      },
    };
  }
  return ctx;
}

export function useSessionUser(): SessionUser {
  const ctx = useSession();
  return (
    ctx.user ?? {
      id: "",
      email: "",
      name: "",
      createdAt: "",
    }
  );
}
