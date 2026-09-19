"use client";
import { Select } from "@/components/ui/input";
export function SummaryCurrency({ value, currencies, onChange }: { value: string; currencies: string[]; onChange: (value: string) => void }) {
  return <label className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">Waluta podsumowania<Select aria-label="Waluta podsumowania" value={value} onChange={e => onChange(e.target.value)}>{[...new Set(["PLN", value, ...currencies])].sort().map(c => <option key={c}>{c}</option>)}</Select><span>Kwoty w różnych walutach nie są sumowane.</span></label>;
}
