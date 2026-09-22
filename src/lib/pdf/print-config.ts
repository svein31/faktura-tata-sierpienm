import { ApiError, cleanStr } from "@/lib/api";
export type PrintConfig = { accentColor: string; footerText: string; layout: "classic" | "compact" };
export const DEFAULT_PRINT_CONFIG: PrintConfig = { accentColor: "#1e70fa", footerText: "Dokument wygenerowany elektronicznie w systemie FakturaProsto.", layout: "classic" };
export function printConfig(body: Record<string, unknown>): PrintConfig {
  const accentColor = cleanStr(body.accentColor, 7, "kolor"), footerText = cleanStr(body.footerText, 150, "stopka"), layout = body.layout;
  if (!/^#[0-9a-fA-F]{6}$/.test(accentColor) || !["classic", "compact"].includes(String(layout))) throw new ApiError(400, "Wybierz kolor HEX i układ klasyczny lub kompaktowy.");
  return { accentColor, footerText, layout: layout as PrintConfig["layout"] };
}
