"use client";

import { useState } from "react";

const money = (cents: number) => new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(cents / 100);
function parseGrosz(value: string) {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fractional = ""] = normalized.split(".");
  const amount = Number(whole) * 100 + Number(fractional.padEnd(2, "0"));
  return Number.isSafeInteger(amount) ? amount : null;
}

const field = "w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary";

export function VatCalculator() {
  const [amount, setAmount] = useState("100");
  const [direction, setDirection] = useState<"net" | "gross">("net");
  const [rate, setRate] = useState(23);
  const cents = parseGrosz(amount);
  const net = cents === null ? null : direction === "net" ? cents : Math.round((cents * 100) / (100 + rate));
  const gross = cents === null || net === null ? null : direction === "gross" ? cents : cents + Math.round((cents * rate) / 100);
  const vat = net === null || gross === null ? null : gross - net;

  return <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
    <h2 className="text-xl font-semibold">Oblicz kwoty</h2>
    <p className="mt-2 text-sm text-muted-foreground">Wybierz stawkę dopiero po sprawdzeniu, czy dotyczy Twojej transakcji. Kalkulator liczy jedną pozycję i zaokrągla do grosza.</p>
    <div className="mt-5 grid gap-4 sm:grid-cols-3">
      <label className="text-sm font-medium">Kwota w PLN<input className={`mt-2 ${field}`} inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} aria-describedby="vat-input-help" /></label>
      <label className="text-sm font-medium">Rodzaj kwoty<select className={`mt-2 ${field}`} value={direction} onChange={event => setDirection(event.target.value as "net" | "gross")}><option value="net">Netto</option><option value="gross">Brutto</option></select></label>
      <label className="text-sm font-medium">Stawka VAT<select className={`mt-2 ${field}`} value={rate} onChange={event => setRate(Number(event.target.value))}>{[23, 8, 5, 0].map(value => <option key={value} value={value}>{value}%</option>)}</select></label>
    </div>
    <p id="vat-input-help" className="mt-2 text-xs text-muted-foreground">Wpisz kwotę nieujemną z najwyżej dwoma miejscami po przecinku.</p>
    {net === null || vat === null || gross === null ? <p role="alert" className="mt-4 text-sm text-amber-600">Popraw format kwoty.</p> : <div role="status" aria-live="polite" className="mt-5 grid gap-3 sm:grid-cols-3">{[["Netto", net], ["VAT", vat], ["Brutto", gross]].map(([label, value]) => <div className="rounded-xl border border-primary/20 bg-primary/5 p-4" key={label}><span className="text-xs text-muted-foreground">{label}</span><p className="mt-1 text-xl font-semibold tabular-nums">{money(Number(value))}</p></div>)}</div>}
  </div>;
}

export function KsefThresholdCalculator() {
  const [previous, setPrevious] = useState("8000");
  const [invoice, setInvoice] = useState("2500");
  const [crossed, setCrossed] = useState("");
  const before = parseGrosz(previous);
  const current = parseGrosz(invoice);
  const total = before === null || current === null ? null : before + current;
  const valid = total !== null && Number.isSafeInteger(total) && current !== null && current > 0 && crossed !== "";
  const archival = new Date() >= new Date("2027-01-01T00:00:00+01:00");
  const result = crossed === "yes" || (total !== null && total > 1_000_000);

  return <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
    <h2 className="text-xl font-semibold">Która faktura przekracza 10 000 zł?</h2>
    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Dotyczy przejściowej zasady w 2026 r. Podaj wyłącznie faktury wchodzące do limitu według zasad MF; kalkulator nie rozpoznaje rodzaju transakcji.</p>
    <div className="mt-5 grid gap-4 sm:grid-cols-3">
      <label className="text-sm font-medium">Suma wcześniejszych faktur brutto w tym miesiącu<input className={`mt-2 ${field}`} inputMode="decimal" value={previous} onChange={event => setPrevious(event.target.value)} /></label>
      <label className="text-sm font-medium">Nowa faktura brutto<input className={`mt-2 ${field}`} inputMode="decimal" value={invoice} onChange={event => setInvoice(event.target.value)} /></label>
      <label className="text-sm font-medium">Próg przekroczono już wcześniej?<select className={`mt-2 ${field}`} value={crossed} onChange={event => setCrossed(event.target.value)}><option value="">Wybierz</option><option value="no">Nie</option><option value="yes">Tak, w tym lub wcześniejszym miesiącu</option></select></label>
    </div>
    {archival ? <p role="status" className="mt-5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">Ta przejściowa zasada dotyczyła 2026 r. Kalkulator ma charakter archiwalny i nie służy do ustalania obowiązku po 2026 r.</p> : !valid ? <p className="mt-5 text-sm text-muted-foreground">Wpisz poprawne kwoty i odpowiedz na pytanie o wcześniejsze przekroczenie progu.</p> : <div role="status" aria-live="polite" className="mt-5 rounded-xl border border-primary/30 bg-primary/5 p-5"><p className="text-sm text-muted-foreground">Suma po wystawieniu: <strong className="text-foreground">{money(total!)}</strong></p><p className="mt-2 font-semibold">{result ? "Ta faktura wymaga KSeF w opisanym przypadku." : "Ta faktura nie przekracza jeszcze progu w opisanym przypadku."}</p><p className="mt-2 text-sm text-muted-foreground">{crossed === "yes" ? "Po wcześniejszym przekroczeniu progu niższa suma w kolejnym miesiącu nie przywraca wyjątku." : result ? "Próg przekracza właśnie ta faktura; dalsze faktury objęte obowiązkiem również trafiają do KSeF." : "Dokładnie 10 000 zł nie oznacza przekroczenia; sprawdź kolejną fakturę."}</p></div>}
    <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Nie wliczaj faktur konsumenckich. Jeśli nie wiesz, czy transakcja należy do limitu, sprawdź wyjaśnienia Ministerstwa Finansów poniżej przed użyciem wyniku.</p>
  </div>;
}
