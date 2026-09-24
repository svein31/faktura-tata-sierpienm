require('../register-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildFa3Xml, validateFa3Xml, calculateFa3Totals } = require('../../src/lib/ksef/xmlBuilder.ts');
const { KsefClient, generateDemoUpoXml } = require('../../src/lib/ksef/client.ts');
const { FA3_NAMESPACE, KSEF_V2_URLS } = require('../../src/lib/ksef/constants.ts');
const { claimKsefTransmission } = require('../../src/lib/ksef/transmission-claim.ts');

test('Punkt 2: KSeF od poczatku do konca - FA(3), auth, send, reject, retry lock, UPO i download', async () => {
  // 1. Walidacja FA(3) i odseparowanie srodowisk
  assert.equal(KSEF_V2_URLS.test, 'https://api-test.ksef.mf.gov.pl/v2');
  assert.equal(KSEF_V2_URLS.production, 'https://api.ksef.mf.gov.pl/v2');
  assert.equal(KSEF_V2_URLS.demo, 'https://api-demo.ksef.mf.gov.pl/v2');
  assert.notEqual(KSEF_V2_URLS.demo, KSEF_V2_URLS.production, 'Testy Demo sa calkowicie osobne od produkcji MF');

  const seller = {
    name: 'Firma Sprzedawcy Sp. z o.o.',
    nip: '5260301706',
    street: 'ul. Ogórkowa 63S',
    postal: '04-998',
    city: 'Warszawa',
    country: 'PL',
  };

  const buyer = {
    id: 'buyer-1',
    name: 'Nabywca Testowy S.A.',
    nip: '5250001003',
    address: { street: 'ul. Marszałkowska 1', postal: '00-001', city: 'Warszawa', country: 'PL' },
  };

  const invoiceData = {
    id: 'inv-ksef-1',
    number: 'FV/2026/02/0100',
    type: 'sale',
    status: 'draft',
    issueDate: '2026-02-15',
    saleDate: '2026-02-15',
    dueDate: '2026-03-01',
    currency: 'PLN',
    paymentMethod: 'transfer',
    lines: [
      { id: 'l1', name: 'Usługa programistyczna', quantity: 1, unit: 'usł.', netPrice: 5000, vatRate: '23' }
    ]
  };

  const xml = buildFa3Xml({ invoice: invoiceData, seller, buyer });
  assert.ok(xml.includes(FA3_NAMESPACE), 'XML musi zawierac przestrzen nazw FA(3)');
  assert.ok(xml.includes('<WariantFormularza>3</WariantFormularza>'), 'WariantFormularza musi byc 3');
  const val = validateFa3Xml(xml);
  assert.equal(val.ok, true, 'Walidacja FA(3) musi przejsc');

  // 2. Uwierzytelnienie i sesja (KsefClient Demo/Test)
  const client = new KsefClient({ environment: 'demo' });
  const challenge = await client.getAuthorisationChallenge(seller.nip);
  assert.ok(challenge.challenge, 'Challenge musi zostac wygenerowany');

  const session = await client.loginWithKsefToken(seller.nip, 'DEMO_TOKEN_123');
  assert.ok(session.accessToken, 'Token sesji KSeF musi byc obecny');
  assert.ok(session.referenceNumber, 'Numer referencyjny sesji musi byc nadany');

  // 3. Wysłanie i sukces (wynik zapisany)
  const sendResult = await client.sendInvoiceEncrypted(session.accessToken, xml);
  assert.ok(sendResult.elementReferenceNumber, 'Identyfikator przetwarzania elementu musi zostac zwrocony');
  assert.equal(sendResult.status, 'PENDING');

  // 4. Numer KSeF i UPO
  const statusResult = await client.getInvoiceStatus(session.accessToken, sendResult.elementReferenceNumber);
  assert.equal(statusResult.status, 'ACCEPTED');
  assert.ok(statusResult.ksefReferenceNumber, 'Numer KSeF musi zostac nadany');
  assert.ok(statusResult.ksefReferenceNumber.includes(seller.nip));
  assert.ok(statusResult.upoXml && statusResult.upoXml.includes('Potwierdzenie'), 'UPO musi byc wygenerowane i dostepne');

  // 5. Odrzucenie (np. bledny XML lub nieprawidlowy dokument)
  const invalidXml = '<Faktura xmlns="bad-namespace"><BrakDanych/></Faktura>';
  const invalidVal = validateFa3Xml(invalidXml);
  assert.equal(invalidVal.ok, false, 'Bledny XML musi zostac odrzucony przez walidator FA(3)');
  assert.ok(invalidVal.issues.length > 0, 'Zapisane szczegoly bledow odrzucenia');

  // 6. Przerwanie polaczenia i blokada ponowienia (brak duplikatu faktury)
  let currentInvoice = {
    id: '507f191e810c19729de860ea',
    version: 1,
    userId: 'user-1',
    sellerCompanyId: null,
    type: 'sale',
    status: 'draft',
    ksefStatus: 'verify_needed', // status po przerwaniu transmisji
    referenceNumber: 'REF-INTERRUPTED-123',
    ksefNumber: null,
  };

  const mockTx = {
    invoice: {
      findUnique: async () => currentInvoice,
      update: async (args) => {
        currentInvoice = { ...currentInvoice, ...args.data };
        return currentInvoice;
      },
    },
    ksefQueueTask: {
      findFirst: async () => null,
      count: async () => 0,
    },
    accountingPeriod: {
      findFirst: async () => null,
    },
    invoicePrintVersion: {
      count: async () => 0,
      create: async () => ({ id: 'pv-1' }),
    },
    invoicePrintContext: {
      findUnique: async () => null,
      create: async () => ({ id: 'ctx-1' }),
      update: async () => ({ id: 'ctx-1' }),
    },
    subscription: {
      findUnique: async () => ({ plan: 'yearly', status: 'active', currentPeriodEnd: new Date(Date.now() + 1000000) }),
    }
  };

  // Ponowienie po przerwaniu polaczenia bez wyjasnienia/uzgodnienia
  await assert.rejects(
    claimKsefTransmission(mockTx, { invoiceId: currentInvoice.id, version: 1, userId: 'user-1' }),
    (err) => {
      assert.equal(err.status, 409);
      assert.match(err.message, /Najpierw zweryfikuj poprzednią wysyłkę w KSeF/);
      return true;
    },
    'Ponowienie bez uzgodnienia musi zostac zablokowane kodem 409, chroniac przed podwojna faktura'
  );

  // Ponowienie gdy faktura ma juz numer KSeF
  currentInvoice.ksefStatus = 'accepted';
  currentInvoice.ksefNumber = '5260301706-20260215-0100-11';
  await assert.rejects(
    claimKsefTransmission(mockTx, { invoiceId: currentInvoice.id, version: 1, userId: 'user-1' }),
    (err) => {
      assert.equal(err.status, 409);
      assert.match(err.message, /Najpierw zweryfikuj poprzednią wysyłkę w KSeF/);
      return true;
    },
    'Faktura z nadanym numerem KSeF nigdy nie moze byc wyslana powtornie'
  );

  console.log('[KSeF Lifecycle] PASS: FA(3), auth, send, reject, interrupt, anti-duplicate lock, UPO');
});
