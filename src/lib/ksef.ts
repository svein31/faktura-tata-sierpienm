/**
 * Walidacja i narzędzia strukturalne e-Faktury KSeF (FA(3) & FA(2))
 */

import type { Fa2Issue, Fa2ValidationResult } from "./types";
export type { KsefEnvironment } from "./ksef/constants";
export { buildFa3Xml, validateFa3Xml, FA3_TEMPLATE } from "./ksef/xmlBuilder";

export function validateFa2(xml: string): Fa2ValidationResult {
  const trimmed = xml.trim();

  if (!trimmed) {
    return { ok: false, issues: [{ severity: "error", path: "/", message: "Dokument XML jest pusty." }] };
  }

  // Jeśli dokument zawiera schemat FA(3), waliduj FA(3)
  if (trimmed.includes("2025/06/25/13775") || trimmed.includes('FA (3)')) {
    const { validateFa3Xml } = require("./ksef/xmlBuilder");
    const res = validateFa3Xml(trimmed);
    return {
      ok: res.ok,
      issues: res.issues.map((i: any) => ({
        severity: i.severity,
        path: i.path,
        message: i.message,
      })),
    };
  }

  const issues: Fa2Issue[] = [];
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
      message: `Elementem głównym musi być <Faktura>, znaleziono <${localName}>.`,
    });
    return { ok: false, issues };
  }

  const errors = issues.filter((i) => i.severity === "error");
  return { ok: errors.length === 0, issues };
}

export const FA2_TEMPLATE = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Naglowek>
    <KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>
    <WariantFormularza>3</WariantFormularza>
    <DataWytworzeniaFa>2026-09-09T09:00:00Z</DataWytworzeniaFa>
  </Naglowek>
  <Podmiot1>
    <PrefiksPodatnika>PL</PrefiksPodatnika>
    <DaneIdentyfikacyjne>
      <NIP>5260301706</NIP>
      <Nazwa>Fakturowa Sp. z o.o.</Nazwa>
    </DaneIdentyfikacyjne>
    <Adres>
      <KodKraju>PL</KodKraju>
      <AdresL1>ul. Testowa 10</AdresL1>
      <AdresL2>00-950 Warszawa</AdresL2>
    </Adres>
  </Podmiot1>
  <Podmiot2>
    <DaneIdentyfikacyjne>
      <NIP>5270000024</NIP>
      <Nazwa>DemoIT Solutions Sp. z o.o.</Nazwa>
    </DaneIdentyfikacyjne>
    <Adres>
      <KodKraju>PL</KodKraju>
      <AdresL1>ul. Przykładowa 1</AdresL1>
      <AdresL2>00-001 Warszawa</AdresL2>
    </Adres>
  </Podmiot2>
  <Fa>
    <KodWaluty>PLN</KodWaluty>
    <P_1>2026-09-09</P_1>
    <P_2>FV/2026/0001</P_2>
    <P_6>2026-09-09</P_6>
    <P_13_1>100.00</P_13_1>
    <P_14_1>23.00</P_14_1>
    <P_15>123.00</P_15>
    <Adnotacje>
      <P_16>2</P_16><P_17>2</P_17><P_18>2</P_18><P_18A>2</P_18A>
      <Zwolnienie><P_19N>1</P_19N></Zwolnienie>
      <NoweSrodkiTransportu><P_22N>1</P_22N></NoweSrodkiTransportu>
      <P_23>2</P_23>
      <P_PMarzy><P_PMarzyN>1</P_PMarzyN></P_PMarzy>
    </Adnotacje>
    <RodzajFaktury>VAT</RodzajFaktury>
    <FaWiersz>
      <NrWierszaFa>1</NrWierszaFa>
      <P_7>Usługa programistyczna</P_7>
      <P_8A>szt.</P_8A>
      <P_8B>1</P_8B>
      <P_9A>100.00</P_9A>
      <P_11>100.00</P_11>
      <P_12>23</P_12>
    </FaWiersz>
    <Platnosc>
      <DoZaplaty>123.00</DoZaplaty>
      <FormaPlatnosci>6</FormaPlatnosci>
    </Platnosc>
  </Fa>
</Faktura>`;
