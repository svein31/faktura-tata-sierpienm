"use client";
import * as React from "react";
import { Check, Monitor, Moon, RotateCcw, Search, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { COLOR_GROUPS, COLOR_SCOPES, DEFAULT_COLORS, contrastRatio, paletteStyle, themePalette, validHex, type ColorScope } from "@/lib/theme-colors";

function ColorField({ label, value, inherited, adjusted, onChange, onReset }: { label: string; value: string; inherited: boolean; adjusted: boolean; onChange: (value: string) => void; onReset: () => void }) {
  const [text, setText] = React.useState(value);
  React.useEffect(() => setText(value), [value]);
  const id = React.useId();
  return <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-border/60 py-3 last:border-0">
    <label htmlFor={id} className="min-w-0 flex-1 text-sm"><span className="block font-medium">{label}</span><span className="mt-0.5 block text-xs text-muted-foreground">{adjusted ? "Dopasowany do czytelnego kontrastu" : inherited ? "Odziedziczony" : "Własny kolor"}</span></label>
    <div className="flex items-center gap-2">
      <input type="color" aria-label={`${label} — paleta`} value={value} onChange={e => onChange(e.target.value)} className="h-10 w-10 cursor-pointer rounded-md border border-input bg-card p-1" />
      <Input id={id} aria-label={`${label} — HEX`} value={text} maxLength={7} spellCheck={false} className="w-24 font-mono text-xs" onChange={e => { setText(e.target.value); if (validHex(e.target.value)) onChange(e.target.value); }} onBlur={() => setText(value)} />
      <Button variant="ghost" size="icon" aria-label={`Przywróć: ${label}`} title="Przywróć odziedziczony kolor" disabled={inherited} onClick={onReset}><RotateCcw aria-hidden="true" className="size-4" /></Button>
    </div>
  </div>;
}
export default function AppearancePage() {
  const { theme, resolved, colors, setTheme, setColors } = useTheme();
  const [scope, setScope] = React.useState<ColorScope>("global"), [search, setSearch] = React.useState("");
  const palette = themePalette(resolved, colors, scope);
  const overrides = (scope === "global" ? colors.modes : colors.sections?.[scope])?.[resolved] || {};
  const update = (key: string, value?: string) => {
    const next = { ...overrides }; if (value) next[key] = value; else delete next[key];
    if (scope === "global") setColors({ ...colors, modes: { ...colors.modes, [resolved]: next } });
    else setColors({ ...colors, sections: { ...colors.sections, [scope]: { ...colors.sections?.[scope], [resolved]: next } } });
  };
  const resetScope = () => {
    if (scope === "global") setColors({ ...colors, accent: "", backgrounds: { ...colors.backgrounds, [resolved]: undefined }, modes: { ...colors.modes, [resolved]: {} } });
    else setColors({ ...colors, sections: { ...colors.sections, [scope]: { ...colors.sections?.[scope], [resolved]: {} } } });
  };
  return <div className="space-y-6">
    <PageHeader title="Wygląd" description="Dopasuj powierzchnie, tekst, przyciski, statusy i wykresy — dla całej aplikacji lub wybranej sekcji." />
    <Card className="p-5 sm:p-6"><h2 className="text-base font-semibold">Motyw aplikacji</h2><div className="mt-4 flex flex-wrap gap-2">{([["light", "Jasny", Sun], ["dark", "Ciemny", Moon], ["system", "Systemowy", Monitor]] as const).map(([mode, label, Icon]) => <Button key={mode} aria-pressed={theme === mode} variant={theme === mode ? "primary" : "outline"} onClick={() => setTheme(mode)} className="gap-2"><Icon aria-hidden="true" className="size-4" />{label}</Button>)}</div><p className="mt-3 text-sm text-muted-foreground">Ustawienia zapisują się w tej przeglądarce. Kolory jasnego i ciemnego motywu są niezależne. Wygląd PDF zmienisz w szablonach dokumentów.</p></Card>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-4">
        <Card className="space-y-4 p-5"><div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="color-scope">Gdzie zastosować kolory</Label><Select id="color-scope" value={scope} onChange={e => setScope(e.target.value as ColorScope)}>{Object.entries(COLOR_SCOPES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></div><div><Label htmlFor="color-search">Znajdź ustawienie</Label><div className="relative"><Search aria-hidden="true" className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input id="color-search" className="pl-9" placeholder="Np. wpływy, tekst, seria…" value={search} onChange={e => setSearch(e.target.value)} /></div></div></div><p className="text-xs leading-relaxed text-muted-foreground">Edytujesz: <strong>{resolved === "dark" ? "motyw ciemny" : "motyw jasny"} · {COLOR_SCOPES[scope]}</strong>. Ustawienia sekcji mają pierwszeństwo przed kolorami całej strony. Tekst i powierzchnie dopasowują kontrast automatycznie; podgląd pokazuje wynik.</p><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={resetScope}>Przywróć kolory tego zakresu</Button><Button variant="ghost" size="sm" onClick={() => setColors(DEFAULT_COLORS)}>Przywróć wszystkie domyślne</Button></div></Card>
        {COLOR_GROUPS.map((group, index) => {
          const entries = Object.entries(group.tokens).filter(([, label]) => `${group.label} ${label}`.toLocaleLowerCase("pl").includes(search.toLocaleLowerCase("pl")));
          return entries.length ? <details key={`${group.label}:${Boolean(search)}`} open={search ? true : index === 0 ? true : undefined} className="surface-card px-5"><summary className="cursor-pointer py-4 font-semibold">{group.label}<span className="ml-2 text-xs font-normal text-muted-foreground">{entries.length}</span></summary><div className="border-t border-border/60 pb-2">{entries.map(([key, label]) => <ColorField key={`${scope}:${resolved}:${key}`} label={label} value={overrides[key] || palette[key]} inherited={!overrides[key]} adjusted={Boolean(overrides[key] && overrides[key] !== palette[key])} onChange={value => update(key, value)} onReset={() => update(key)} />)}</div></details> : null;
        })}
      </div>
      <Card className="overflow-hidden xl:sticky xl:top-24"><div className="border-b p-5"><h2 className="font-semibold">Podgląd · {COLOR_SCOPES[scope]}</h2><p className="mt-1 text-xs text-muted-foreground">Kontrast tekstu {contrastRatio(palette.background, palette.foreground).toFixed(2)}:1</p></div><div style={paletteStyle(palette) as React.CSSProperties} className="space-y-4 bg-background p-5 text-foreground"><div className="rounded-lg border bg-card p-4 text-card-foreground"><p className="text-xs text-muted-foreground">Przykładowy dokument</p><p className="mt-2 font-semibold">FV/2026/001</p><p className="mt-1 text-2xl font-semibold tabular-nums">1 230,00 zł</p><span className="mt-3 inline-flex items-center gap-1.5 text-sm text-success"><Check aria-hidden="true" className="size-4" />Opłacona</span></div><div className="flex flex-wrap gap-2"><Button>Akcja główna</Button><Button variant="outline">Podgląd</Button></div><Input aria-label="Przykładowe pole w podglądzie" placeholder="Przykładowe pole" readOnly /><div role="img" className="flex h-20 items-end gap-2" aria-label="Kolory wykresu">{[1, 2, 3, 4, 5, 6, 7].map((series, i) => <span key={series} className="flex-1 rounded-t-sm" style={{ height: `${30 + (i * 17) % 65}%`, background: `hsl(var(--chart-${series}))` }} />)}</div><p className="text-xs leading-relaxed text-muted-foreground">To podgląd wyglądu. Dane dokumentów, uprawnienia i obliczenia pozostają takie same.</p></div></Card>
    </div>
  </div>;
}
