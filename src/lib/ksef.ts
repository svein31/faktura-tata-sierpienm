/**
 * FA(2) — walidacja strukturalna dokumentu e-Faktury (uproszczona, demo).
 * Pełna walidacja XSD względem schematu MF (eD) wymaga backendu/XML Schema.
 */

import type { Fa2Issue, Fa2ValidationResult } from "./types";
export type { KsefEnvironment } from "./ksef/constants";

export function validateFa2(xml: string): Fa2ValidationResult {
  const issues: Fa2Issue[] = [];
  const trimmed = xml.trim();

  if (!trimmed) {
    return { ok: false, issues: [{ severity: "error", path: "/", message: "Dokument XML jest pusty." }] };
  }

  if (typeof DOMParser === "undefined") {
    return {
      ok: false,
      issues: [{ severity: "error", path: "/", message: "Środowisko nie wspiera parsowania XML." }],
    };
  }

  let doc: Document | null = null;
  try {
    doc = new DOMParser().parseFromString(trimmed, "application/xml");
    const parseError = doc.querySelector("parsererror");
    if (parseError) {
      issues.push({
        severity: "error",
        path: "/",
        message: `Błąd składni XML: ${parseError.textContent?.slice(0, 200)}`,
      });
    }
  } catch (e) {
    issues.push({
      severity: "error",
      path: "/",
      message: `Błąd parsowania XML: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
  if (!doc) return { ok: false, issues };
  if (issues.some((i) => i.severity === "error")) return { ok: false, issues };

  const root = doc.documentElement;
  const localName = root?.localName ?? root?.nodeName ?? "";

  if (localName !== "Faktura") {
    issues.push({
      severity: "error",
      path: "/",
      message: `Elementem głównym musi być <Faktura> (FA(2)), znaleziono <${localName}>.`,
    });
    return { ok: false, issues };
  }

  const text = (name: string) =>
    (root.getElementsByTagName(name)[0]?.textContent ?? "").trim();

  const kod = text("KodFormularza");
  if (kod && !/FA\s*\(2\)/.test(kod)) {
    issues.push({
      severity: "error",
      path: "/KodFormularza",
      message: `KodFormularza powinien zawierać „FA (2)”, znaleziono: „${kod}”.`,
    });
  } else if (!kod) {
    issues.push({ severity: "error", path: "/KodFormularza", message: "Brak elementu KodFormularza." });
  }

  const p2 = text("P_2");
  if (p2) {
    const allowed = ["1", "2", "3", "4", "5", "6"];
    if (!allowed.includes(p2)) {
      issues.push({
        severity: "warning",
        path: "/P_2",
        message: `P_2 (typ faktury) = „${p2}” — poza typowym zakresem 1–6.`,
      });
    }
  } else {
    issues.push({ severity: "warning", path: "/P_2", message: "Brak P_2 (typ faktury)." });
  }

  const required: Array<[string, string]> = [
    ["DataWystawienia", "Data wystawienia"],
    ["NazwaSprzedawcy", "Nazwa sprzedawcy"],
    ["NIPSprzedawcy", "NIP sprzedawcy"],
    ["NazwaNabywcy", "Nazwa nabywcy"],
    ["DowodSprzedazy", "Numer faktury (DowódSprzedaży)"],
    ["P_13", "P_13 (waluta)"],
    ["P_14", "P_14 (suma netto)"],
    ["P_15", "P_15 (suma podatku)"],
    ["P_16", "P_16 (suma brutto)"],
  ];
  for (const [el, label] of required) {
    if (!text(el)) {
      issues.push({ severity: "error", path: `/${el}`, message: `Brak wymaganego elementu: ${label}.` });
    }
  }

  const faItems = Array.from(root.getElementsByTagName("Fa"));
  if (faItems.length === 0) {
    issues.push({
      severity: "error",
      path: "/Fa",
      message: "Dokument nie zawiera żadnej pozycji <Fa> (wiersza faktury).",
    });
  } else {
    faItems.forEach((fa, i) => {
      const p = (n: string) => (fa.getElementsByTagName(n)[0]?.textContent ?? "").trim();
      for (const n of ["P_9A", "P_9C", "P_10", "P_11", "P_12"]) {
        if (!p(n)) {
          issues.push({
            severity: "error",
            path: `/Fa[${i + 1}]/${n}`,
            message: `Brak ${n} w pozycji ${i + 1}.`,
          });
        }
      }
      const stawka = p("P_9G");
      if (stawka && !/^(0|5|8|23)$/.test(stawka)) {
        issues.push({
          severity: "warning",
          path: `/Fa[${i + 1}]/P_9G`,
          message: `P_9G (stawka) = „${stawka}” — typowe wartości: 23, 8, 5, 0.`,
        });
      }
    });
  }

  const ctrl = root.getElementsByTagName("FaRwCtrl")[0];
  if (ctrl) {
    const count = faItems.length;
    const liczba = Number(text("LiczbaWierszy")) || 0;
    if (liczba !== count) {
      issues.push({
        severity: "warning",
        path: "/FaRwCtrl/LiczbaWierszy",
        message: `LiczbaWierszy (${liczba}) różni się od liczby pozycji <Fa> (${count}).`,
      });
    }
  }

  const errors = issues.filter((i) => i.severity === "error");
  return { ok: errors.length === 0, issues };
}

export const FA2_TEMPLATE = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2024/01/17/eD/DefinicjeTypy/"
         xmlns:ksef="http://ksef.mf.gov.pl/schema/gtw/schematy/2024/01/17/0001/Faktura"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <KodFormularza kodSystemowy="FA (2)" wersjaSchemy="1-0E">FA (2)</KodFormularza>
  <WariantFormularza>1</WariantFormularza>
  <CelZlozenia>1</CelZlozenia>
  <DataWystawienia>2026-08-15</DataWystawienia>
  <NazwaSprzedawcy>Fakturowa Sp. z o.o.</NazwaSprzedawcy>
  <AdresSprzedawcy>ul. Testowa 10, 00-950 Warszawa, PL</AdresSprzedawcy>
  <NIPSprzedawcy>5260301706</NIPSprzedawcy>
  <NazwaNabywcy>DemoIT Solutions Sp. z o.o.</NazwaNabywcy>
  <AdresNabywcy>ul. Przykładowa 1, 00-001 Warszawa, PL</AdresNabywcy>
  <NIPNabywcy>5270000024</NIPNabywcy>
  <DowodSprzedazy>FV/2026/0001</DowodSprzedazy>
  <P_1>2026-08-15</P_1>
  <P_2>1</P_2>
  <P_13>PLN</P_13>
  <P_14>100.00</P_14>
  <P_15>23.00</P_15>
  <P_16>123.00</P_16>
  <Fa>
    <P_9A>Usługa programistyczna</P_9A>
    <P_9B>szt.</P_9B>
    <P_9C>1</P_9C>
    <P_9D>100.00</P_9D>
    <P_9E>23</P_9E>
    <P_9G>23</P_9G>
    <P_10>100.00</P_10>
    <P_11>23.00</P_11>
    <P_12>123.00</P_12>
  </Fa>
  <FaRwCtrl>
    <LiczbaWierszy>1</LiczbaWierszy>
    <PodatekNalezny>23.00</PodatekNalezny>
    <WartoscBrutto>123.00</WartoscBrutto>
    <WartoscNetto>100.00</WartoscNetto>
  </FaRwCtrl>
  <Stopka>Wygenerowano w aplikacji Fakturo (demo).</Stopka>
</Faktura>`;
