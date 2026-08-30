"use client";

import * as React from "react";
import type { SessionUser } from "@/lib/types";
import { SessionProvider } from "@/lib/session-context";
import { DataBootstrap } from "./data-bootstrap";
import { Sidebar, MobileSidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { BottomNav } from "./bottom-nav";

/**
 * Powłoka aplikacji (tylko dla zalogowanych — strona (app) przechodzi
 * serwerową weryfikację sesji w (app)/layout.tsx).
 */
export function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <SessionProvider user={user}>
      <div className="min-h-screen bg-background text-foreground overflow-x-hidden antialiased selection:bg-primary/20 selection:text-primary">
        <Sidebar />
        <MobileSidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />
        <div className="lg:pl-64 flex min-h-screen flex-col">
          <Topbar onMenu={() => setMobileOpen(true)} />
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 lg:px-8 pb-24 md:pb-8 overflow-x-hidden">
            <DataBootstrap>{children}</DataBootstrap>
          </main>
          <BottomNav />
        </div>
      </div>
    </SessionProvider>
  );
}
