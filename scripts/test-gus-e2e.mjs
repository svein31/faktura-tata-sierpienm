/**
 * Test weryfikacyjny integracji z API GUS BIR 1.1 (SOAP 1.2) oraz parsera danych
 */
import { extractTagContent, normalizeGusCompany, parseRawGusEntities, unescapeXml, formatFullAddress } from "../src/lib/gus/parser.ts";
import { isValidNipFormat, normalizeNip } from "../src/lib/validation.ts";
import { GusClient } from "../src/lib/gus/client.ts";
import { strict as assert } from "node:assert";

console.log("=========================================================");
console.log("1. TEST WALIDACJI SUMY KONTROLNEJ NIP (MODULO 11)");
console.log("=========================================================");

const validNips = [
  "5260301706", // Ministerstwo Finansów
  "5261040828", // Prawidłowy NIP
  "5270000024", // Prawidłowy NIP
  "123-456-32-18", // Prawidłowy NIP z kreskami
];

const invalidNips = [
  "1234567890", // Zła suma
  "5260301700", // Zła suma
  "12345",      // Za krótki
  "abcdefghij", // Niecyfrowy
];

for (const nip of validNips) {
  const norm = normalizeNip(nip);
  assert.equal(isValidNipFormat(norm), true, `NIP ${nip} powinien być prawidłowy`);
  console.log(`✓ Poprawny NIP: ${nip} (znormalizowany: ${norm})`);
}

for (const nip of invalidNips) {
  const norm = normalizeNip(nip);
  assert.equal(isValidNipFormat(norm), false, `NIP ${nip} powinien być nieprawidłowy`);
  console.log(`✓ Odrzucono niepoprawny NIP: ${nip}`);
}

console.log("\n=========================================================");
console.log("2. TEST PARSERA ODPOWIEDZI SOAP I XML Z BAZY REGON");
console.log("=========================================================");

const mockSoapSearchResponse = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://www.w3.org/2005/08/addressing">
  <s:Header>
    <a:Action s:mustUnderstand="1">http://CIS/BIR/PUBL/2014/07/IUslugiBIRzewn/DaneSzukajPodmiotyResponse</a:Action>
  </s:Header>
  <s:Body>
    <DaneSzukajPodmiotyResponse xmlns="http://CIS/BIR/PUBL/2014/07">
      <DaneSzukajPodmiotyResult>&lt;root&gt;
  &lt;dane&gt;
    &lt;Regon&gt;012345678&lt;/Regon&gt;
    &lt;Nip&gt;5261040828&lt;/Nip&gt;
    &lt;StatusNip /&gt;
    &lt;Nazwa&gt;PRZYKŁADOWA FIRMA SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ&lt;/Nazwa&gt;
    &lt;Wojewodztwo&gt;MAZOWIECKIE&lt;/Wojewodztwo&gt;
    &lt;Powiat&gt;Warszawa&lt;/Powiat&gt;
    &lt;Gmina&gt;Śródmieście&lt;/Gmina&gt;
    &lt;Miejscowosc&gt;Warszawa&lt;/Miejscowosc&gt;
    &lt;KodPocztowy&gt;00001&lt;/KodPocztowy&gt;
    &lt;Ulica&gt;ul. Aleje Jerozolimskie&lt;/Ulica&gt;
    &lt;NrNieruchomosci&gt;100&lt;/NrNieruchomosci&gt;
    &lt;NrLokalu&gt;5&lt;/NrLokalu&gt;
    &lt;Typ&gt;P&lt;/Typ&gt;
    &lt;SilosID&gt;6&lt;/SilosID&gt;
    &lt;DataZakonczeniaDzialalnosci /&gt;
  &lt;/dane&gt;
&lt;/root&gt;</DaneSzukajPodmiotyResult>
    </DaneSzukajPodmiotyResponse>
  </s:Body>
</s:Envelope>`;

const searchResultXml = extractTagContent(mockSoapSearchResponse, "DaneSzukajPodmiotyResult");
assert.ok(searchResultXml, "Wynik DaneSzukajPodmiotyResult powinien zostać wyciągnięty");

const entities = parseRawGusEntities(searchResultXml);
assert.equal(entities.length, 1, "Powinien zostać sparsowany 1 podmiot");

const normalized = normalizeGusCompany(entities[0]);
console.log("✓ Sparsowane i znormalizowane dane podmiotu:");
console.log(`  - Nazwa: ${normalized.name}`);
console.log(`  - NIP: ${normalized.nip}`);
console.log(`  - REGON: ${normalized.regon}`);
console.log(`  - Ulica: ${normalized.street}`);
console.log(`  - Nr: ${normalized.buildingNumber}/${normalized.flatNumber}`);
console.log(`  - Miasto: ${normalized.city} (${normalized.postalCode})`);
console.log(`  - Pełny adres: ${normalized.fullAddress}`);
console.log(`  - Aktywna: ${normalized.isActive}`);

assert.equal(normalized.nip, "5261040828");
assert.equal(normalized.name, "PRZYKŁADOWA FIRMA SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ");
assert.equal(normalized.street, "Aleje Jerozolimskie");
assert.equal(normalized.buildingNumber, "100");
assert.equal(normalized.flatNumber, "5");
assert.equal(normalized.city, "Warszawa");
assert.equal(normalized.postalCode, "00-001");
assert.equal(normalized.fullAddress, "Aleje Jerozolimskie 100/5, 00-001 Warszawa");
assert.equal(normalized.isActive, true);

console.log("\n=========================================================");
console.log("3. TEST OBSŁUGI BŁĘDÓW I KODÓW SPECJALNYCH GUS");
console.log("=========================================================");

const mockNotFoundResponse = `&lt;root&gt;&lt;dane&gt;&lt;ErrorCode&gt;4&lt;/ErrorCode&gt;&lt;ErrorMessagePl&gt;Nie znaleziono podmiotow&lt;/ErrorMessagePl&gt;&lt;/dane&gt;&lt;/root&gt;`;
const notFoundEntities = parseRawGusEntities(mockNotFoundResponse);
assert.equal(notFoundEntities[0].ErrorCode, "4");
console.log("✓ Wykryto kod błędu 4 (Nie znaleziono podmiotów)");

console.log("\n=========================================================");
console.log("🎉 WSZYSTKIE TESTY MODUŁU GUS BIR 1.1 PRZESZŁY W 100%!");
console.log("=========================================================");
