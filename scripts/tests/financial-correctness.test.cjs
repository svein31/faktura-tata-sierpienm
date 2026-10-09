require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict'), { spawnSync } = require('node:child_process');
const { round2, roundHalfUp } = require('../../src/lib/tax/money.ts');
const { invoiceTotals } = require('../../src/lib/format.ts');
const { normalizeInvoiceLineAmounts } = require('../../src/lib/invoice-input.ts');
const { parseInvoiceBody } = require('../../src/lib/parsers.ts');
const { convertToPln } = require('../../src/lib/nbp.ts');
const { parseInvoicePayment } = require('../../src/lib/invoice-payment.ts');
const { parseInvoiceSpreadsheet } = require('../../src/lib/invoice-spreadsheet.ts');
const { buildFa3Xml, validateFa3Xml } = require('../../src/lib/ksef/xmlBuilder.ts');
const owner = { contractorOwnedBy: async () => true, companyOwnedBy: async () => true };
const line = { id: 'one', name: 'Usługa Łódź <&> „żółć”', quantity: 1, unit: 'szt.', netPrice: 100, vatRate: '23' };
const body = { number: 'QA/1', type: 'sale', status: 'draft', contractorId: 'a'.repeat(24), sellerCompanyId: 'b'.repeat(24), issueDate: '2026-10-08', saleDate: '2026-10-08', dueDate: '2026-10-22', currency: 'PLN', paymentMethod: 'transfer', lines: [line] };
const correction = { ...body, isCorrection: true, correctionReason: 'Zwrot i korekta ceny <&>', originalInvoiceNumber: 'FV/oryginał/1', originalIssueDate: '2026-10-01' };
const seller = { companyName: 'Firma Łódź & Syn', nip: '5260301706', street: 'Test 1', city: 'Warszawa', postalCode: '00-001' };
const buyer = { name: 'Klient Żółć', nip: '5250001003', address: { country: 'PL', city: 'Warszawa', street: 'Test 2', postal: '00-001' } };

test('half-up retains cents in supported large totals and the sign of exact ties', () => {
  assert.equal(round2(100_000_000_000.01), 100_000_000_000.01);
  assert.equal(round2(999_999_999_999.99), 999_999_999_999.99);
  assert.equal(round2(1_000_000_000.005), 1_000_000_000.01);
  assert.equal(round2(-1_000_000_000.005), -1_000_000_000.01);
  assert.equal(round2(3499.5 * 0.09), 314.96);
  assert.equal(round2(1.005), 1.01); assert.equal(round2(-0.005), -0.01);
  assert.equal(roundHalfUp(-0.0000005, 6), -0.000001);
  const rows = Array.from({ length: 200 }, (_, index) => ({ ...line, quantity: 1, netPrice: 999_999_999.99 - index / 100, vatRate: '0' }));
  const cents = rows.reduce((sum, row) => sum + BigInt(Math.round(row.netPrice * 100)), 0n);
  assert.equal(invoiceTotals({ lines: rows }).gross, Number(cents) / 100);
});

test('PLN conversion uses the same signed half-up arithmetic and fails closed on overflow', () => {
  assert.equal(convertToPln(100, 0.01005), 1.01);
  assert.equal(convertToPln(-1, 0.005), -0.01);
  assert.equal(convertToPln(100, 425, 100), 425);
  assert.equal(convertToPln(0, 4.25), 0);
  for (const [amount, rate, unit] of [[NaN, 1, 1], [100, Infinity, 1], [1, 1, 0], [1, 1, NaN]]) assert.equal(Number.isNaN(convertToPln(amount, rate, unit)), true);
  assert.equal(Number.isFinite(convertToPln(100, 1e308)), false);
});

test('invoice preview, preflight amounts and persisted rows agree at price/quantity precision boundaries', async () => {
  for (const input of [{ ...line, quantity: 10, netPrice: 1.005 }, { ...line, quantity: 0.1234567, netPrice: 99.995 }]) {
    const preview = invoiceTotals({ lines: [normalizeInvoiceLineAmounts(input)] });
    const parsed = await parseInvoiceBody({ ...body, lines: [input] }, owner);
    assert.equal(preview.net, parsed.totalNet); assert.equal(preview.vat, parsed.totalVat); assert.equal(preview.gross, parsed.totalGross);
  }
  assert.equal(normalizeInvoiceLineAmounts({ quantity: NaN, netPrice: Infinity }).netPrice, Infinity);
  assert.equal(Number.isNaN(normalizeInvoiceLineAmounts({ quantity: NaN, netPrice: 1 }).quantity), true);
});

test('invoice dates persist validated trim; malformed payment metadata and correction references are rejected', async () => {
  const parsed = await parseInvoiceBody({ ...body, issueDate: ' 2026-10-08 ', saleDate: ' 2026-10-08 ', dueDate: ' 2026-10-22 ' }, owner);
  assert.equal(parsed.issueDate, '2026-10-08'); assert.equal(parsed.saleDate, '2026-10-08'); assert.equal(parsed.dueDate, '2026-10-22');
  for (const patch of [{ paymentStatus: 'garbage' }, { approvalStatus: 'forged' }, { language: 'invalid' }, { paidAmount: -1 }, { paidAmount: Infinity }, { isCorrection: 'false' }, { isCorrection: true }, { ...correction, originalIssueDate: '2026-02-30' }, { ...correction, originalIssueDate: '2026-10-09' }]) await assert.rejects(parseInvoiceBody({ ...body, ...patch }, owner), error => error.status === 400);
});

test('signed correction deltas are accepted only as explicit corrections and validate against official FA3 XSD', async () => {
  const cases = [[{ ...line, quantity: -0.5 }], [{ ...line, quantity: -1, netPrice: 100 }, { ...line, id: 'two', quantity: 1, netPrice: 80 }], [{ ...line, quantity: 1, netPrice: 20, vatRate: '8' }, { ...line, id: 'two', quantity: -1, netPrice: 100 }]];
  for (const lines of cases) {
    await assert.rejects(parseInvoiceBody({ ...body, lines }, owner), error => error.status === 400);
    const parsed = await parseInvoiceBody({ ...correction, lines }, owner);
    const xml = buildFa3Xml({ invoice: parsed, seller, buyer });
    assert.equal(validateFa3Xml(xml).ok, true);
    assert.match(xml, /<P_13_1>-/); assert.match(xml, /<P_14_1>-/);
    assert.match(xml, /Usługa Łódź &lt;&amp;&gt;/);
    const result = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['scripts/validate-jpk.py', 'fa3.xsd'], { input: xml, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
  const exempt = await parseInvoiceBody({ ...correction, exemptionBasis: 'art. 113 ust. 1', lines: [{ ...line, quantity: -1, vatRate: 'zw' }] }, owner);
  const xml = buildFa3Xml({ invoice: exempt, seller, buyer }); assert.match(xml, /<P_13_7>-100.00/); assert.match(xml, /<P_19>1/);
  assert.throws(() => buildFa3Xml({ invoice: { ...exempt, originalInvoiceNumber: '' }, seller, buyer }), /Korekta wymaga/);
});

test('generated correction PDF contains actual signed totals, source reference and Polish text', async () => {
  const { generateInvoicePdfBuffer } = require('../../src/lib/pdf/generate-invoice-pdf.ts');
  const { PDFDocument, PDFName, PDFDict, PDFArray, PDFRawStream, decodePDFRawStream } = require('pdf-lib');
  const parsed = await parseInvoiceBody({ ...correction, number: 'KOR/QA/1', lines: [{ ...line, quantity: -0.5 }] }, owner);
  const pdf = await generateInvoicePdfBuffer(parsed, buyer, seller);
  // Read the actual PDF text operators through their embedded ToUnicode maps.
  // This verifies the generated artifact without an additional system/Python dependency.
  const document = await PDFDocument.load(pdf), output = [];
  const decode = stream => Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1');
  for (const page of document.getPages()) {
    const fonts = page.node.Resources().lookup(PDFName.of('Font'), PDFDict), maps = new Map();
    for (const name of fonts.keys()) {
      const font = fonts.lookup(name, PDFDict), unicode = font.lookupMaybe(PDFName.of('ToUnicode'), PDFRawStream), map = new Map();
      if (unicode) for (const block of decode(unicode).matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
        for (const pair of block[1].matchAll(/<([A-Fa-f0-9]+)>\s*<([A-Fa-f0-9]+)>/g)) {
          const points = pair[2].match(/.{4}/g).map(code => parseInt(code, 16));
          map.set(pair[1].toUpperCase(), String.fromCharCode(...points));
        }
      }
      maps.set(name.toString().slice(1), map);
    }
    const contents = page.node.Contents(), streams = contents instanceof PDFArray ? contents.asArray().map(value => document.context.lookup(value)) : [contents];
    let active;
    for (const stream of streams) for (const operator of decode(stream).matchAll(/\/(\S+)\s+[\d.]+\s+Tf|<([A-Fa-f0-9]+)>\s*Tj/g)) {
      if (operator[1]) active = maps.get(operator[1]);
      else if (active?.size) output.push((operator[2].match(/.{4}/g) || []).map(code => active.get(code.toUpperCase()) || '').join(''));
      else output.push(Buffer.from(operator[2], 'hex').toString('latin1'));
    }
  }
  const text = output.join('\n').replace(/\u2212/g, '-');
  assert.match(text, /KOR\/QA\/1/); assert.match(text, /FV\/oryginał\/1/); assert.match(text, /Łódź/);
  assert.match(text, /-50,00/); assert.match(text, /-11,50/); assert.match(text, /-61,50/);
});

test('payment inputs reject impossible/rollover dates, invalid methods and non-finite or out-of-range amounts', () => {
  const valid = { amount: 1.005, paidAt: '2024-02-29T23:59:59+01:00', method: 'transfer', note: 'Żółć <&>' };
  assert.equal(parseInvoicePayment(valid).amount, 1.01); assert.equal(parseInvoicePayment(valid).note, valid.note);
  for (const patch of [{ amount: Infinity }, { amount: 1e100 }, { amount: 0.004 }, { amount: -1 }, { amount: true }, { method: 'invalid' }, { paidAt: '2026-02-30' }, { paidAt: '2026-02-30T10:00:00Z' }, { paidAt: '2026-02-28T24:00:00Z' }, { paidAt: 'bad' }, { note: 'x'.repeat(1001) }]) assert.throws(() => parseInvoicePayment({ ...valid, ...patch }), error => error.status === 400);
});

test('spreadsheet import keeps Polish decimal/quoted names and rejects silent financial coercion', () => {
  const parsed = parseInvoiceSpreadsheet('Nazwa\tIlość\tJ.m.\tCena netto\tVAT\n"Żółć; usługa, Łódź"\t0,004\tkg\t1000,005\t23%');
  assert.equal(parsed[0].name, 'Żółć; usługa, Łódź'); assert.equal(parsed[0].quantity, 0.004); assert.equal(parsed[0].netPrice, 1000.01);
  const quoted = parseInvoiceSpreadsheet('"Usługa, \"\"Łódź\"\"";1;10;8'); assert.equal(quoted[0].name, 'Usługa, "Łódź"');
  for (const text of ['A;0;10', 'A;abc;10', 'A;1;10abc', 'A;1;szt.;10;99', 'A;-1;10', 'A;1;-1', 'A;0,0000001;10', 'A;1;1e100', '"niezamknięte;1;10']) assert.throws(() => parseInvoiceSpreadsheet(text));
  assert.equal(parseInvoiceSpreadsheet('Zwrot;-1;10', true)[0].quantity, -1);
  assert.equal(parseInvoiceSpreadsheet('Gratis;1;0')[0].netPrice, 0);
});
