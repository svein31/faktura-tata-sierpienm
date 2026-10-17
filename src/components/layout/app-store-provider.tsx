"use client";

import { useRef, type ReactNode } from "react";
import type { StoreApi } from "zustand";
import { AppStoreContext } from "@/lib/app-store-context";
import { browserAppStore, createAppStore, type AppBootstrapData, type AppState } from "@/lib/store";

/** The server creates a separate store for every render; no user data is global. */
export function AppStoreProvider({ ownerId, initialBootstrap, children }: {
  ownerId: string;
  initialBootstrap: AppBootstrapData | null;
  children: ReactNode;
}) {
  const store = useRef<StoreApi<AppState> | null>(null);
  if (!store.current) {
    store.current = typeof window === "undefined"
      ? createAppStore(initialBootstrap)
      : browserAppStore(ownerId, initialBootstrap);
  }
  return <AppStoreContext.Provider value={store.current}>{children}</AppStoreContext.Provider>;
}
