"use client";

import * as React from "react";
import type { SessionUser } from "@/lib/types";
import { SessionProvider } from "@/lib/session-context";
import { DataBootstrap } from "./data-bootstrap";
import { Sidebar, MobileSidebar } from "./sidebar";
import { Topbar } from "./topbar";

/**
 * Powłoka aplikacji (tylko dla zalogowanych — strona (app) przechodzi
 * serwerową weryfikację sesji w (app)/layout.tsx).
 */
export function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <SessionProvider user={user}>
      <div className="min-h-screen bg-background">
        <Sidebar />
        <MobileSidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />
        <div className="lg:pl-64">
          <Topbar onMenu={() => setMobileOpen(true)} />
          <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <DataBootstrap>{children}</DataBootstrap>
          </main>
        </div>
      </div>
    </SessionProvider>
  );
}
