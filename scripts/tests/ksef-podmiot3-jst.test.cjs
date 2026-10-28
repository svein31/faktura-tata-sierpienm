require('../register-ts.cjs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { PDFDocument } = require('pdf-lib');

const { buildFa3Xml, validateFa3Xml } = require('../../src/lib/ksef/xmlBuilder.ts');
const { parseInvoiceBody } = require('../../src/lib/parsers.ts');
const { FieldError } = require('../../src/lib/api.ts');
const { isValidIdWewFormat } = require('../../src/lib/validation.ts');
const { assessInvoice } = require('../../src/lib/invoice-preflight.ts');
const { changedAcceptedInvoiceFields } = require('../../src/lib/invoice-policy.ts');
const { invoiceToDto } = require('../../src/lib/dto.ts');
const { printInvoiceData } = require('../../src/lib/pdf/invoice-print.ts');
const { buildInvoiceHtmlString } = require('../../src/lib/invoice-html.ts');
const { generateInvoicePdfBuffer } = require('../../src/lib/pdf/generate-invoice-pdf.ts');

const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
const validateScript = path.join(__dirname, '..', 'validate-jpk.py');

function assertFa3XsdValid(xml) {
  const res = spawnSync(pythonCmd, [validateScript, 'fa3.xsd'], {
    input: xml,
    encoding: 'utf8',
  });
  assert.equal(res.status, 0, res.stderr || res.stdout || 'fa3.xsd validation failed');
}

const seller = {
  id: 'comp-1',
  name: 'Usługi Geodezyjne Jan Kowalski',
  companyName: 'Usługi Geodezyjne Jan Kowalski',
  nip: '5260301706',
  street: 'ul. Geodetów 12',
  postal: '60-101',
  city: 'Poznań',
  country: 'PL',
  iban: '12105000996711111111111111',
  bankAccount: '12 1050 0099 6711 1111 1111 1111',
  bankName: 'ING Bank Śląski',
};

const powiatPoznanskiBuyer = {
  id: 'buyer-powiat',
  name: 'Powiat Poznański',
  nip: '7811840766',
  taxIdType: 'nip',
  taxId: '7811840766',
  country: 'PL',
  address: {
    street: 'ul. Jackowskiego 18',
    postal: '60-509',
    city: 'Poznań',
    country: 'PL',
  },
};

const podgikRecipient = {
  name: 'Powiatowy Ośrodek Dokumentacji Geodezyjnej i Kartograficznej',
  nip: '7811857850',
  taxIdType: 'nip',
  taxId: '7811857850',
  role: '8',
  address: {
    street: 'ul. Franowo 26',
    postal: '61-302',
    city: 'Poznań',
    country: 'PL',
  },
};

const baseInvoice = {
  id: 'inv-jst-1',
  number: 'FV/2026/10/0001',
  type: 'sale',
  status: 'issued',
  contractorId: powiatPoznanskiBuyer.id,
  recipient: podgikRecipient,
  issueDate: '2026-10-28',
  saleDate: '2026-10-28',
  dueDate: '2026-11-11',
  paymentMethod: 'transfer',
  paymentTermDays: 14,
  currency: 'PLN',
  language: 'PL',
  lines: [
    {
      id: 'line-1',
      name: 'Opracowanie dokumentacji geodezyjno-kartograficznej',
      quantity: 1,
      unit: 'usł.',
      netPrice: 2500,
      vatRate: '23',
    },
  ],
  totalNet: 2500,
  totalVat: 575,
  totalGross: 3075,
};

test('FA(3) XML for Powiat Poznański (Podmiot2) + PODGiK (Podmiot3, Rola 8 = JST – odbiorca) passes XSD', () => {
  const xml = buildFa3Xml({
    invoice: baseInvoice,
    seller,
    buyer: powiatPoznanskiBuyer,
  });

  // Podmiot2: Powiat Poznański + <JST>1</JST> + <GV>2</GV>
  assert.match(xml, /<Podmiot2>[\s\S]*?<NIP>7811840766<\/NIP>[\s\S]*?<Nazwa>Powiat Poznański<\/Nazwa>[\s\S]*?<AdresL1>ul\. Jackowskiego 18<\/AdresL1>[\s\S]*?<AdresL2>60-509 Poznań<\/AdresL2>[\s\S]*?<JST>1<\/JST>[\s\S]*?<GV>2<\/GV>[\s\S]*?<\/Podmiot2>/);

  // Podmiot3: PODGiK + <NIP>7811857850</NIP> + <Rola>8</Rola>
  assert.match(xml, /<Podmiot3>[\s\S]*?<NIP>7811857850<\/NIP>[\s\S]*?<Nazwa>Powiatowy Ośrodek Dokumentacji Geodezyjnej i Kartograficznej<\/Nazwa>[\s\S]*?<AdresL1>ul\. Franowo 26<\/AdresL1>[\s\S]*?<AdresL2>61-302 Poznań<\/AdresL2>[\s\S]*?<Rola>8<\/Rola>[\s\S]*?<\/Podmiot3>/);

  const check = validateFa3Xml(xml);
  assert.equal(check.ok, true, JSON.stringify(check.issues));

  assertFa3XsdValid(xml);
});

test('FA(3) XML supports IDWew, BrakID, VAT UE, standard Odbiorca (Rola 2) and Grupa VAT (Rola 10) under official XSD', () => {
  // 1. IDWew + Rola 8 (JST)
  const xmlIdWew = buildFa3Xml({
    invoice: {
      ...baseInvoice,
      recipient: {
        ...podgikRecipient,
        nip: undefined,
        taxIdType: 'id_wew',
        taxId: '7811840766-00001',
        role: '8',
      },
    },
    seller,
    buyer: powiatPoznanskiBuyer,
  });
  assert.match(xmlIdWew, /<IDWew>7811840766-00001<\/IDWew>/);
  assert.match(xmlIdWew, /<JST>1<\/JST>/);
  assert.equal(validateFa3Xml(xmlIdWew).ok, true);
  assertFa3XsdValid(xmlIdWew);

  // 2. BrakID + Rola 8 (JST) + DaneKontaktowe
  const xmlBrakId = buildFa3Xml({
    invoice: {
      ...baseInvoice,
      recipient: {
        ...podgikRecipient,
        nip: undefined,
        taxIdType: 'none',
        taxId: undefined,
        email: 'podgik@powiat.poznan.pl',
        phone: '+48618410540',
        role: '8',
      },
    },
    seller,
    buyer: powiatPoznanskiBuyer,
  });
  assert.match(xmlBrakId, /<Podmiot3>[\s\S]*?<BrakID>1<\/BrakID>[\s\S]*?<Email>podgik@powiat\.poznan\.pl<\/Email>[\s\S]*?<Telefon>\+48618410540<\/Telefon>[\s\S]*?<Rola>8<\/Rola>[\s\S]*?<\/Podmiot3>/);
  assert.equal(validateFa3Xml(xmlBrakId).ok, true);
  assertFa3XsdValid(xmlBrakId);

  // 3. Standardowy Odbiorca (Rola 2) z VAT UE -> JST=2, GV=2
  const xmlRola2 = buildFa3Xml({
    invoice: {
      ...baseInvoice,
      recipient: {
        name: 'Oddział Zagraniczny GmbH',
        taxIdType: 'vat_eu',
        taxId: 'DE123456789',
        role: '2',
        address: { street: 'Hauptstrasse 1', postal: '10115', city: 'Berlin', country: 'DE' },
      },
    },
    seller,
    buyer: powiatPoznanskiBuyer,
  });
  assert.match(xmlRola2, /<JST>2<\/JST>[\s\S]*?<GV>2<\/GV>/);
  assert.match(xmlRola2, /<KodUE>DE<\/KodUE>\s*<NrVatUE>123456789<\/NrVatUE>/);
  assert.match(xmlRola2, /<Rola>2<\/Rola>/);
  assert.equal(validateFa3Xml(xmlRola2).ok, true);
  assertFa3XsdValid(xmlRola2);

  // 4. Członek grupy VAT – odbiorca (Rola 10) -> JST=2, GV=1
  const xmlRola10 = buildFa3Xml({
    invoice: {
      ...baseInvoice,
      recipient: {
        ...podgikRecipient,
        role: '10',
      },
    },
    seller,
    buyer: powiatPoznanskiBuyer,
  });
  assert.match(xmlRola10, /<JST>2<\/JST>[\s\S]*?<GV>1<\/GV>/);
  assert.match(xmlRola10, /<Rola>10<\/Rola>/);
  assert.equal(validateFa3Xml(xmlRola10).ok, true);
  assertFa3XsdValid(xmlRola10);

  // 5. Brak odbiorcy -> brak Podmiot3, JST=2, GV=2
  const xmlNoRecipient = buildFa3Xml({
    invoice: { ...baseInvoice, recipient: undefined },
    seller,
    buyer: powiatPoznanskiBuyer,
  });
  assert.equal(xmlNoRecipient.includes('<Podmiot3>'), false);
  assert.match(xmlNoRecipient, /<JST>2<\/JST>[\s\S]*?<GV>2<\/GV>/);
  assertFa3XsdValid(xmlNoRecipient);

  // 6. Walidator odrzuca niespójne znaczniki JST/GV oraz brak Rola
  assert.equal(validateFa3Xml(xmlIdWew.replace('<JST>1</JST>', '<JST>2</JST>')).ok, false);
  assert.equal(validateFa3Xml(xmlRola10.replace('<GV>1</GV>', '<GV>2</GV>')).ok, false);
  assert.equal(validateFa3Xml(xmlIdWew.replace('<Rola>8</Rola>', '')).ok, false);
});

test('Parser, IDWew validator, preflight, KSeF immutability, DTO, HTML and PDF handle Podmiot3 cleanly', async () => {
  assert.equal(isValidIdWewFormat('7811840766-00001'), true);
  assert.equal(isValidIdWewFormat('7811840767-00001'), false); // zła suma kontrolna NIP
  assert.equal(isValidIdWewFormat('7811840766-123'), false); // wymagane 5 cyfr po myślniku

  const ownerOpts = {
    contractorOwnedBy: async () => true,
    companyOwnedBy: async () => true,
  };

  const parsed = await parseInvoiceBody({
    number: 'FV/2026/10/0001',
    type: 'sale',
    status: 'issued',
    contractorId: '507f1f77bcf86cd799439011',
    recipient: {
      name: 'Powiatowy Ośrodek Dokumentacji Geodezyjnej i Kartograficznej',
      taxIdType: 'nip',
      taxId: '781-185-78-50',
      role: '8',
      address: {
        street: 'ul. Franowo 26',
        postal: '61-302',
        city: 'Poznań',
        country: 'PL',
      },
    },
    issueDate: '2026-10-28',
    saleDate: '2026-10-28',
    dueDate: '2026-11-11',
    paymentMethod: 'transfer',
    currency: 'PLN',
    language: 'PL',
    lines: [{ name: 'Usługa geodezyjna', quantity: 1, unit: 'usł.', netPrice: 1000, vatRate: '23' }],
  }, ownerOpts);

  assert.equal(parsed.recipient.nip, '7811857850');
  assert.equal(parsed.recipient.taxId, '7811857850');
  assert.equal(parsed.recipient.role, '8');

  // Wyczyszczenie odbiorcy przez null
  const cleared = await parseInvoiceBody({
    number: 'FV/2026/10/0002',
    type: 'sale',
    status: 'draft',
    contractorId: '507f1f77bcf86cd799439011',
    recipient: null,
    issueDate: '2026-10-28',
    saleDate: '2026-10-28',
    dueDate: '2026-11-11',
    paymentMethod: 'transfer',
    currency: 'PLN',
    language: 'PL',
    lines: [{ name: 'Usługa', quantity: 1, unit: 'usł.', netPrice: 100, vatRate: '23' }],
  }, ownerOpts);
  assert.equal(cleared.recipient, null);

  // Błędny NIP odbiorcy blokuje zapis z FieldError
  await assert.rejects(
    () =>
      parseInvoiceBody({
        number: 'FV/2026/10/0003',
        type: 'sale',
        status: 'issued',
        contractorId: '507f1f77bcf86cd799439011',
        recipient: {
          name: 'PODGiK',
          taxIdType: 'nip',
          taxId: '7811857851',
          role: '8',
          address: { street: 'ul. Franowo 26', postal: '61-302', city: 'Poznań', country: 'PL' },
        },
        issueDate: '2026-10-28',
        saleDate: '2026-10-28',
        dueDate: '2026-11-11',
        paymentMethod: 'transfer',
        currency: 'PLN',
        language: 'PL',
        lines: [{ name: 'Usługa', quantity: 1, unit: 'usł.', netPrice: 100, vatRate: '23' }],
      }, ownerOpts),
    (err) => err instanceof FieldError && Boolean(err.fieldErrors['recipient.taxId'])
  );

  // Preflight wykrywa poprawny oraz błędny Podmiot3
  const preflightOk = assessInvoice({
    number: baseInvoice.number,
    issueDate: baseInvoice.issueDate,
    saleDate: baseInvoice.saleDate,
    dueDate: baseInvoice.dueDate,
    currency: baseInvoice.currency,
    lines: baseInvoice.lines,
    gross: baseInvoice.totalGross,
    seller: { companyName: seller.companyName, nip: seller.nip, street: seller.street, city: seller.city, postalCode: seller.postal },
    buyer: { name: powiatPoznanskiBuyer.name, nip: powiatPoznanskiBuyer.nip, country: 'PL', taxIdType: 'nip', street: powiatPoznanskiBuyer.address.street, city: powiatPoznanskiBuyer.address.city, postal: powiatPoznanskiBuyer.address.postal },
    recipient: { name: podgikRecipient.name, nip: podgikRecipient.nip, taxId: podgikRecipient.taxId, country: 'PL', taxIdType: 'nip', street: podgikRecipient.address.street, city: podgikRecipient.address.city, postal: podgikRecipient.address.postal, role: '8' },
  });
  assert.equal(preflightOk.filter((i) => i.severity === 'error').length, 0, JSON.stringify(preflightOk));

  const preflightBad = assessInvoice({
    number: baseInvoice.number,
    issueDate: baseInvoice.issueDate,
    saleDate: baseInvoice.saleDate,
    dueDate: baseInvoice.dueDate,
    currency: baseInvoice.currency,
    lines: baseInvoice.lines,
    gross: baseInvoice.totalGross,
    seller: { companyName: seller.companyName, nip: seller.nip, street: seller.street, city: seller.city, postalCode: seller.postal },
    buyer: { name: powiatPoznanskiBuyer.name, nip: powiatPoznanskiBuyer.nip, country: 'PL', taxIdType: 'nip', street: powiatPoznanskiBuyer.address.street, city: powiatPoznanskiBuyer.address.city, postal: powiatPoznanskiBuyer.address.postal },
    recipient: { name: podgikRecipient.name, nip: '123', taxId: '123', taxIdType: 'nip', street: '', city: '', postal: '', role: '8' },
  });
  assert.ok(preflightBad.filter((i) => i.severity === 'error').length >= 2);

  // KSeF immutability chroni pole recipient po akceptacji w KSeF
  const diff = changedAcceptedInvoiceFields(
    { ...baseInvoice, ksefStatus: 'accepted', recipient: podgikRecipient },
    { ...baseInvoice, recipient: { ...podgikRecipient, name: 'Zmieniony Odbiorca' } }
  );
  assert.ok(diff.includes('recipient'));

  // DTO i printInvoiceData: brak recipient nie zmienia istniejących snapshotów
  const dtoWithout = invoiceToDto({ ...baseInvoice, recipient: null, createdAt: new Date() });
  assert.equal('recipient' in printInvoiceData(dtoWithout), false);
  const dtoWith = invoiceToDto({ ...baseInvoice, recipient: podgikRecipient, createdAt: new Date() });
  assert.deepEqual(printInvoiceData(dtoWith).recipient, podgikRecipient);

  // HTML oraz PDF renderują sekcję Odbiorcy (Podmiot3)
  const html = buildInvoiceHtmlString(baseInvoice, powiatPoznanskiBuyer, seller);
  assert.ok(html.includes('Powiatowy Ośrodek Dokumentacji Geodezyjnej i Kartograficznej'));
  assert.ok(html.includes('7811857850'));
  assert.ok(html.includes('JST – odbiorca'));

  const pdfBuffer = await generateInvoicePdfBuffer(baseInvoice, powiatPoznanskiBuyer, seller);
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  assert.equal(pdfDoc.getPageCount(), 1);
});
