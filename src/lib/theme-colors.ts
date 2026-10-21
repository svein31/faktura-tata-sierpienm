export type ThemeMode = "light" | "dark";
export const COLOR_GROUPS = [
  { label: "Powierzchnie i tekst", tokens: { background: "Tło strony", foreground: "Tekst główny", card: "Karty i tabele", "card-foreground": "Tekst na kartach", popover: "Menu i okna", "popover-foreground": "Tekst w menu", muted: "Powierzchnie pomocnicze", "muted-foreground": "Tekst pomocniczy", border: "Separatory i obramowania", input: "Obramowania pól", ring: "Obramowanie aktywnego pola" } },
  { label: "Przyciski i nawigacja", tokens: { primary: "Akcja główna i aktywna zakładka", "primary-foreground": "Tekst akcji głównej", secondary: "Akcja drugorzędna", "secondary-foreground": "Tekst akcji drugorzędnej", accent: "Wyróżnienia", "accent-foreground": "Tekst wyróżnień" } },
  { label: "Statusy i komunikaty", tokens: { success: "Powodzenie", "success-foreground": "Tekst na tle powodzenia", warning: "Ostrzeżenie", "warning-foreground": "Tekst na tle ostrzeżenia", destructive: "Błąd i usuwanie", "destructive-foreground": "Tekst na tle błędu", info: "Informacja", "info-foreground": "Tekst na tle informacji", "status-paid": "Faktura opłacona", "status-pending": "Płatność oczekiwana", "status-overdue": "Płatność po terminie", "status-draft": "Szkic" } },
  { label: "Finanse", tokens: { "finance-income": "Wpływy", "finance-expense": "Wydatki", "finance-balance": "Bilans", "finance-office": "Urzędy i KSeF", "finance-warning": "Termin płatności" } },
  { label: "Wykresy", tokens: { "chart-1": "Seria 1 · netto", "chart-2": "Seria 2 · brutto", "chart-3": "Seria 3", "chart-4": "Seria 4", "chart-5": "Seria 5", "chart-6": "Seria 6", "chart-7": "Seria 7" } },
] as const;
export const COLOR_TOKENS = COLOR_GROUPS.flatMap(group => Object.keys(group.tokens));
export const COLOR_SCOPES = { global: "Cała strona", dashboard: "Pulpit", invoices: "Faktury", advances: "Zaliczki", offers: "Oferty", recurring: "Faktury cykliczne", reminders: "Przypomnienia", ksef: "KSeF", expenses: "Wydatki", documents: "Dokumenty", contractors: "Kontrahenci", products: "Produkty i usługi", warehouse: "Magazyn", orders: "Zlecenia", projects: "Projekty", analytics: "Analityka", finances: "Finanse", calendar: "Terminarz", accountant: "Księgowość", "cost-reviews": "Akceptacje kosztów", jpk: "JPK", "tax-estimate": "Podatki", audit: "Historia zmian", settings: "Ustawienia", help: "Pomoc" } as const;
export type ColorScope = keyof typeof COLOR_SCOPES;
type Overrides = Partial<Record<ThemeMode, Record<string, string>>>;
export type CustomColors = { accent: string; backgrounds: Partial<Record<ThemeMode, string>>; modes?: Overrides; sections?: Partial<Record<ColorScope, Overrides>> };
export const DEFAULT_COLORS: CustomColors = { accent: "", backgrounds: {} };
export const validHex = (value: unknown): value is string => typeof value === "string" && /^#[a-f0-9]{6}$/i.test(value);
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
function sanitizeModes(value: unknown): Overrides {
  const input = object(value), result: Overrides = {};
  for (const mode of ["light", "dark"] as const) {
    const tokens = object(input[mode]);
    const entries = COLOR_TOKENS.filter(key => validHex(tokens[key])).map(key => [key, String(tokens[key]).toLowerCase()]);
    if (entries.length) result[mode] = Object.fromEntries(entries);
  }
  return result;
}
export function sanitizeColors(value: unknown): CustomColors {
  const input = object(value), backgrounds = object(input.backgrounds), modes = sanitizeModes(input.modes);
  const result: CustomColors = { accent: validHex(input.accent) ? input.accent : "", backgrounds: {} };
  for (const mode of ["light", "dark"] as const) if (validHex(backgrounds[mode])) result.backgrounds[mode] = backgrounds[mode];
  if (Object.keys(modes).length) result.modes = modes;
  const sections: NonNullable<CustomColors["sections"]> = {};
  for (const key of Object.keys(COLOR_SCOPES) as ColorScope[]) {
    if (key === "global") continue;
    const overrides = sanitizeModes(object(input.sections)[key]);
    if (Object.keys(overrides).length) sections[key] = overrides;
  }
  if (Object.keys(sections).length) result.sections = sections;
  return result;
}
export function colorScope(pathname: string): ColorScope {
  const first = pathname.split("/")[1];
  return Object.hasOwn(COLOR_SCOPES, first) ? first as ColorScope : "global";
}
const channels = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
const luminance = (hex: string) => channels(hex).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
export function contrastRatio(a: string, b: string) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
function blend(a: string, b: string, t: number) { const c = channels(a), d = channels(b); return "#" + c.map((v, i) => Math.round((v + (d[i] - v) * t) * 255).toString(16).padStart(2, "0")).join(""); }
function readable(color: string, surfaces: string[], ratio: number, fallback: string) {
  if (surfaces.every(s => contrastRatio(color, s) >= ratio)) return color;
  for (let i = 1; i <= 100; i++) { const next = blend(color, fallback, i / 100); if (surfaces.every(s => contrastRatio(next, s) >= ratio)) return next; }
  return fallback;
}
const on = (color: string) => contrastRatio(color, "#000000") > contrastRatio(color, "#ffffff") ? "#000000" : "#ffffff";
/** Bounded tokens, never arbitrary CSS. Related text follows its surface. */
export function themePalette(mode: ThemeMode, colors: CustomColors, scope: ColorScope = "global") {
  const custom = { ...colors.modes?.[mode], ...(scope !== "global" ? colors.sections?.[scope]?.[mode] : {}) };
  const requestedBackground = custom.background || colors.backgrounds[mode] || (mode === "dark" ? "#151618" : "#f6f7f8");
  const reference = on(requestedBackground);
  const background = readable(requestedBackground, [reference], 8, reference === "#000000" ? "#ffffff" : "#000000");
  const minimum = 8;
  const surface = (candidate: string) => readable(candidate, [reference], minimum, background);
  const toward = reference === "#000000" ? "#ffffff" : "#000000";
  const card = surface(custom.card || blend(background, toward, .04)), muted = surface(custom.muted || blend(background, toward, .09));
  const popover = surface(custom.popover || card), secondary = surface(custom.secondary || muted);
  const surfaces = [background, card, muted, popover, secondary];
  const text = (value: string, ratio = 4.5) => readable(value, surfaces, ratio, reference);
  const foreground = text(custom.foreground || reference, 7), primary = text(custom.primary || colors.accent || (mode === "dark" ? "#95b1db" : "#4669a8"), 7);
  const success = text(custom.success || (mode === "dark" ? "#8dc0a7" : "#2d6c4e"), 7), warning = text(custom.warning || (mode === "dark" ? "#d9bb7e" : "#8c5b17"), 7);
  const destructive = text(custom.destructive || (mode === "dark" ? "#db8c86" : "#a94237"), 7), info = text(custom.info || primary, 7), accent = text(custom.accent || primary, 7);
  const onColor = (key: string, color: string) => readable(custom[key] || on(color), [color], 4.5, on(color));
  const palette: Record<string, string> = {
    background, foreground, card, "card-foreground": text(custom["card-foreground"] || foreground), popover, "popover-foreground": text(custom["popover-foreground"] || foreground),
    primary, "primary-foreground": onColor("primary-foreground", primary), secondary, "secondary-foreground": text(custom["secondary-foreground"] || foreground), muted, "muted-foreground": text(custom["muted-foreground"] || blend(reference, background, .3)),
    accent, "accent-foreground": onColor("accent-foreground", accent), success, "success-foreground": onColor("success-foreground", success), warning, "warning-foreground": onColor("warning-foreground", warning), destructive, "destructive-foreground": onColor("destructive-foreground", destructive), info, "info-foreground": onColor("info-foreground", info),
    border: text(custom.border || blend(reference, background, .65), 3), input: text(custom.input || custom.border || blend(reference, background, .5), 3), ring: text(custom.ring || primary, 3),
    "status-paid": text(custom["status-paid"] || success), "status-pending": text(custom["status-pending"] || warning), "status-overdue": text(custom["status-overdue"] || destructive), "status-draft": text(custom["status-draft"] || foreground),
    "finance-income": text(custom["finance-income"] || success), "finance-expense": text(custom["finance-expense"] || foreground), "finance-balance": text(custom["finance-balance"] || foreground), "finance-office": text(custom["finance-office"] || foreground), "finance-warning": text(custom["finance-warning"] || warning),
  };
  const chartDefaults = mode === "dark" ? [primary, "#95a9bf", "#7b8495", "#b6becb", "#647c99", "#9da1ac", "#cbd0da"] : [primary, "#697e98", "#8d929c", "#555f71", "#aebbcf", "#777b85", "#c4c9d2"];
  for (let i = 1; i <= 7; i++) palette[`chart-${i}`] = text(custom[`chart-${i}`] || chartDefaults[i - 1], 3);
  return palette;
}
function hsl(hex: string) {
  const [r, g, b] = channels(hex), max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min, l = (max + min) / 2;
  let h = 0; if (delta) h = (max === r ? (g - b) / delta + (g < b ? 6 : 0) : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) * 60;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1)); return `${h.toFixed(2)} ${(s * 100).toFixed(2)}% ${(l * 100).toFixed(2)}%`;
}
export function paletteStyle(palette: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(palette).map(([key, value]) => ["--" + key, hsl(value)]));
}
export function applyCustomColors(mode: ThemeMode, colors: CustomColors, scope: ColorScope = "global") {
  const root = document.documentElement;
  const customized = Boolean(colors.accent || colors.backgrounds[mode] || Object.keys(colors.modes?.[mode] || {}).length || Object.keys(colors.sections?.[scope]?.[mode] || {}).length);
  if (!customized) { for (const key of COLOR_TOKENS) root.style.removeProperty("--" + key); return; }
  for (const [key, value] of Object.entries(themePalette(mode, colors, scope))) root.style.setProperty("--" + key, hsl(value));
}
