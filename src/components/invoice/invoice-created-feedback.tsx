"use client";

import * as React from "react";

type Created = { id: string; companyId: string; at: number };
const Context = React.createContext<{
  recent: Created | null; markCreated: (id: string, companyId: string) => void; consume: (id: string) => void;
} | null>(null);

/** Ephemeral UI feedback only; never persisted or inferred from list refreshes. */
export function InvoiceCreatedFeedback({ children }: { children: React.ReactNode }) {
  const [recent, setRecent] = React.useState<Created | null>(null);
  const markCreated = React.useCallback((id: string, companyId: string) => setRecent({ id, companyId, at: Date.now() }), []);
  const consume = React.useCallback((id: string) => setRecent(value => value?.id === id ? null : value), []);
  const value = React.useMemo(() => ({ recent, markCreated, consume }), [recent, markCreated, consume]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useInvoiceCreatedFeedback() {
  const value = React.useContext(Context);
  if (!value) throw new Error("InvoiceCreatedFeedback is required");
  return value;
}

export function useCreatedInvoiceHighlight(companyId: string | null, ids: string[]) {
  const { recent, consume } = useInvoiceCreatedFeedback();
  const [active, setActive] = React.useState<Created | null>(null);
  const visible = !!recent && ids.includes(recent.id);
  React.useEffect(() => {
    if (!recent || !visible || recent.companyId !== companyId) return;
    const reveal = () => {
      if (Date.now() - recent.at < 60000) setActive(recent);
      consume(recent.id);
    };
    if (typeof IntersectionObserver === "undefined") { reveal(); return; }
    // Both responsive layouts exist in the DOM. Start only when the actual row
    // enters the viewport, rather than spending the feedback above/below the fold.
    const targets = [...document.querySelectorAll<HTMLElement>("[data-invoice-id]")]
      .filter(element => element.dataset.invoiceId === recent.id);
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.25)) {
        reveal();
        observer.disconnect();
      }
    }, { threshold: [0, 0.25] });
    targets.forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, [recent, visible, companyId, consume]);
  React.useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => setActive(null), 900);
    return () => window.clearTimeout(timer);
  }, [active]);
  return active?.companyId === companyId ? active.id : null;
}
