"use client";

import * as React from "react";
import type { SessionUser } from "@/lib/types";
import { SessionProvider } from "@/lib/session-context";
import { DataBootstrap } from "./data-bootstrap";
import { Sidebar, MobileSidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { WorkspaceNavigation } from "./workspace-navigation";
import { BottomNav } from "./bottom-nav";
import { CommandPalette } from "./command-palette";
import { TermsUpdateModal } from "@/components/legal/terms-update-modal";
import { OnboardingTour } from "@/components/onboarding/onboarding-tour";

/**
 * Powłoka aplikacji (tylko dla zalogowanych — strona (app) przechodzi
 * serwerową weryfikację sesji w (app)/layout.tsx).
 */
export function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const closeMobile = React.useCallback(() => setMobileOpen(false), []);

  return (
    <SessionProvider user={user}>
      <div className="min-h-dvh min-w-0 bg-background text-foreground antialiased selection:bg-primary/20 selection:text-primary">
        <CommandPalette />
        <TermsUpdateModal />
        <OnboardingTour />
        <Sidebar />
        <MobileSidebar open={mobileOpen} onClose={closeMobile} />
        <div className="lg:pl-64 flex min-h-dvh min-w-0 flex-col">
          <Topbar onMenu={() => setMobileOpen(true)} />
          <main id="main-content" className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 lg:px-8 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-8 min-w-0">
            <DataBootstrap><WorkspaceNavigation />{children}</DataBootstrap>
          </main>
          <BottomNav />
        </div>
      </div>
    </SessionProvider>
  );
}
