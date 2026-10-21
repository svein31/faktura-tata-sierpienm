"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { OPEN_ONBOARDING_EVENT } from "@/components/onboarding/events";

const SupportReport = dynamic(() => import("@/components/support/support-report").then(module => module.SupportReport), { ssr: false });
const CommandPalette = dynamic(() => import("./command-palette").then(module => module.CommandPalette), { ssr: false });
const OnboardingTour = dynamic(() => import("@/components/onboarding/onboarding-tour").then(module => module.OnboardingTour), { ssr: false });
const TermsUpdateModal = dynamic(() => import("@/components/legal/terms-update-modal").then(module => module.TermsUpdateModal), {
  ssr: false,
  loading: () => <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"><p role="status" className="rounded-xl border bg-card p-6 text-sm">Wczytywanie aktualnego regulaminu…</p></div>,
});

/** Capture the first open intent before downloading an overlay's implementation. */
export function DeferredOverlays({ needsTermsAcceptance }: { needsTermsAcceptance: boolean }) {
  const [commandOpen, setCommandOpen] = React.useState(false);
  const [tourOpen, setTourOpen] = React.useState(false);
  const [supportOpen, setSupportOpen] = React.useState(false);
  React.useEffect(() => {
    if (needsTermsAcceptance) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); setSupportOpen(false); setTourOpen(false); setCommandOpen(open => !open);
      } else if (event.key === "Escape") setCommandOpen(false);
    };
    const openCommand = () => { setSupportOpen(false); setTourOpen(false); setCommandOpen(true); };
    const openSupport = () => { setCommandOpen(false); setTourOpen(false); setSupportOpen(true); };
    const openTour = () => { setSupportOpen(false); setCommandOpen(false); setTourOpen(true); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-command-palette", openCommand);
    window.addEventListener(OPEN_ONBOARDING_EVENT, openTour);
    window.addEventListener("fakturaprosto:open-support", openSupport);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-command-palette", openCommand);
      window.removeEventListener(OPEN_ONBOARDING_EVENT, openTour);
      window.removeEventListener("fakturaprosto:open-support", openSupport);
    };
  }, [needsTermsAcceptance]);
  if (needsTermsAcceptance) return <TermsUpdateModal />;
  return <>
    {supportOpen && <SupportReport onClose={() => setSupportOpen(false)} />}
    {commandOpen && <CommandPalette open onOpenChange={setCommandOpen} />}
    {tourOpen && <OnboardingTour open onClose={() => setTourOpen(false)} />}
  </>;
}
