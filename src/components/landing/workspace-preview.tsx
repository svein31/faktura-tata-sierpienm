"use client";
import { useState } from "react";
import Link from "next/link";
const views = [
  { label: "Dokumenty", heading: "Dokumenty sprzedaży w jednym miejscu", items: ["FV/2026/09/001 · 1 230,00 zł · opłacona", "FV/2026/09/002 · 615,00 zł · do zapłaty", "Oferta OF/09/003 · oczekuje na decyzję"] },
  { label: "Wydatki", heading: "Od skanu do zweryfikowanego kosztu", items: ["Hosting · 123,00 zł · do weryfikacji", "Oprogramowanie · 246,00 zł · zaakceptowano", "Wyciąg bankowy · dopasowanie płatności"] },
  { label: "Księgowość", heading: "Dokumenty i współpraca z biurem", items: ["Wrzesień 2026 · weryfikacja miesiąca", "Uwagi księgowej · przy dokumentach", "Paczka ZIP · zestawienie, PDF, XML"] },
];
export function WorkspacePreview() {
  const [active, setActive] = useState(0), view = views[active];
  return <div className="mt-8 rounded-2xl border bg-card p-4 shadow-lg sm:p-6"><p className="mb-3 text-xs text-muted-foreground">Interaktywny podgląd · dane demonstracyjne</p><div role="group" aria-label="Wybierz podgląd modułu" className="flex flex-wrap gap-2">{views.map((v, i) => <button key={v.label} aria-pressed={active === i} onClick={() => setActive(i)} className={"min-h-11 rounded-xl border px-4 text-sm font-medium transition-colors " + (active === i ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>{v.label}</button>)}</div><div aria-live="polite" className="mt-4"><h2 className="font-semibold">{view.heading}</h2><div className="mt-3 grid gap-3 sm:grid-cols-3">{view.items.map(item => <div key={item} className="rounded-xl border bg-background p-4 text-sm leading-relaxed">{item}</div>)}</div></div><Link prefetch={false} href="/demo" className="mt-5 inline-block text-sm font-semibold text-primary underline">Wypróbuj pełne demo bez rejestracji →</Link></div>;
}
