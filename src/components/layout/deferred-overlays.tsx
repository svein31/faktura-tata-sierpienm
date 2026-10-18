"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { hasCompletedOnboarding, OPEN_ONBOARDING_EVENT } from "@/components/onboarding/events";
import { useSessionUser } from "@/lib/session-context";
import { useAppStore } from "@/lib/store";

const CommandPalette = dynamic(() => import("./command-palette").then(module => module.CommandPalette), { ssr: false });
const OnboardingTour = dynamic(() => import("@/components/onboarding/onboarding-tour").then(module => module.OnboardingTour), { ssr: false });
const TermsUpdateModal = dynamic(() => import("@/components/legal/terms-update-modal").then(module => module.TermsUpdateModal), {
  ssr: false,
  loading: () => <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"><p role="status" className="rounded-xl border bg-card p-6 text-sm">Wczytywanie aktualnego regulaminu…</p></div>,
});

/** Capture the first open intent before downloading an overlay's implementation. */
export function DeferredOverlays({ needsTermsAcceptance }: { needsTermsAcceptance: boolean }) {
  const user = useSessionUser();
  const pathname = usePathname();
  const companyId = useAppStore(state => state.selectedCompanyId);
  const hydrated = useAppStore(state => state.hydrated);
  const [commandOpen, setCommandOpen] = React.useState(false);
  const [tourOpen, setTourOpen] = React.useState(false);
  React.useEffect(() => {
    if (needsTermsAcceptance) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); setTourOpen(false); setCommandOpen(open => !open);
      } else if (event.key === "Escape") setCommandOpen(false);
    };
    const openCommand = () => { setTourOpen(false); setCommandOpen(true); };
    const openTour = () => { setCommandOpen(false); setTourOpen(true); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-command-palette", openCommand);
    window.addEventListener(OPEN_ONBOARDING_EVENT, openTour);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-command-palette", openCommand);
      window.removeEventListener(OPEN_ONBOARDING_EVENT, openTour);
    };
  }, [needsTermsAcceptance]);
  React.useEffect(() => {
    // Opening the invoice editor must never interrupt ongoing work with a tour.
    if (needsTermsAcceptance || !hydrated || !user.id || pathname !== "/dashboard" || hasCompletedOnboarding(user.id, companyId)) return;
    const timer = window.setTimeout(() => { setCommandOpen(false); setTourOpen(true); }, 800);
    return () => window.clearTimeout(timer);
  }, [needsTermsAcceptance, hydrated, user.id, companyId, pathname]);
  if (needsTermsAcceptance) return <TermsUpdateModal />;
  return <>
    {commandOpen && <CommandPalette open onOpenChange={setCommandOpen} />}
    {tourOpen && <OnboardingTour open onClose={() => setTourOpen(false)} />}
  </>;
}
