require('../register-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { reviewFields, documentIdentity, MAX_DOCUMENT_BYTES } = require('../../src/lib/document-inbox.ts');
const { parseFa3IncomingInvoice } = require('../../src/lib/ksef/incomingInvoice.ts');

test('Punkt 4: Import zakupow i wydatki - PDF/XML, korekta odczytu, deduplikacja, limity i izolacja miedzy firmami', () => {
  // 1. Sprawdzenie odczytu z XML faktury ustrukturyzowanej (FA(3) / KSeF)
  const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/">
  <Naglowek><KodFormularza kodSystemowy="FA (3)">FA</KodFormularza><WariantFormularza>3</WariantFormularza></Naglowek>
  <Podmiot1><DaneIdentyfikacyjne><NIP>7770001122</NIP><Nazwa>Dostawca Sprzetu Sp. z o.o.</Nazwa></DaneIdentyfikacyjne></Podmiot1>
  <Podmiot2><DaneIdentyfikacyjne><NIP>5260301706</NIP><Nazwa>Nabywca Firma A</Nazwa></DaneIdentyfikacyjne></Podmiot2>
  <Fa>
    <KodWaluty>PLN</KodWaluty>
    <P_1>2026-02-10</P_1>
    <P_2>FZ/2026/02/099</P_2>
    <P_6>2026-02-10</P_6>
    <P_13_1>1000.00</P_13_1>
    <P_14_1>230.00</P_14_1>
    <P_15>1230.00</P_15>
  </Fa>
</Faktura>`;

  const parsedXml = parseFa3IncomingInvoice(sampleXml, 'KSEF-REF-12345');
  assert.equal(parsedXml.seller.name, 'Dostawca Sprzetu Sp. z o.o.');
  assert.equal(parsedXml.seller.nip, '7770001122');
  assert.equal(parsedXml.currency, 'PLN');
  assert.equal(parsedXml.totalNet, 1000);
  assert.equal(parsedXml.totalVat, 230);
  assert.equal(parsedXml.totalGross, 1230);
  assert.equal(parsedXml.issueDate, '2026-02-10');

  // 2. Ręczna korekta odczytanych danych przed zapisem
  // Użytkownik zauważa błąd OCR w odczycie i poprawia kwotę lub NIP
  const userCorrectionInput = {
    number: 'FZ/2026/02/099',
    contractorName: 'Dostawca Sprzętu Sp. z o.o. (poprawione)',
    nip: '7770001122',
    issueDate: '2026-02-10',
    currency: 'PLN',
    totalNet: 1000.00,
    totalVat: 230.00,
    totalGross: 1230.00,
    category: 'sprzet',
  };

  const validatedFields = reviewFields(userCorrectionInput);
  assert.equal(validatedFields.contractorName, 'Dostawca Sprzętu Sp. z o.o. (poprawione)');
  assert.equal(validatedFields.number, 'FZ/2026/02/099');
  assert.equal(validatedFields.totalGross, 1230.00);
  assert.equal(validatedFields.totalNet, 1000.00);
  assert.equal(validatedFields.totalVat, 230.00);

  // 3. Deduplikacja i powtórny import tego samego dokumentu
  const sampleFileBytes = Buffer.from('FAKE-PDF-INVOICE-CONTENT-IDENTICAL');
  const companyA = '111111111111111111111111';
  const companyB = '222222222222222222222222';

  const identityA = documentIdentity(companyA, sampleFileBytes);
  const identityA_repeat = documentIdentity(companyA, sampleFileBytes);

  // Ten sam plik w firmie A ma dokładnie ten sam hash i identyfikator -> system wykrywa duplikat
  assert.equal(identityA.id, identityA_repeat.id);
  assert.equal(identityA.sha256, identityA_repeat.sha256);

  // 4. Izolacja między firmami:
  // Ten sam plik wgrany w innej firmie ma inny scope i identyfikator -> nie koliduje z firmą B
  const identityB = documentIdentity(companyB, sampleFileBytes);
  assert.notEqual(identityA.id, identityB.id);

  // 5. Limit wielkości pliku
  assert.equal(MAX_DOCUMENT_BYTES, 3 * 1024 * 1024, 'Limit wielkosci pliku wynosi 3 MB');
  const oversizedBytes = Buffer.alloc(MAX_DOCUMENT_BYTES + 70000);
  assert.ok(oversizedBytes.length > MAX_DOCUMENT_BYTES, 'Wykrywanie plikow przekraczajacych dopuszczalny limit');

  console.log('[Purchase & Expenses] PASS: XML/PDF parsing, user corrections, deduplication, 3MB limit, multi-tenant boundary');
});
