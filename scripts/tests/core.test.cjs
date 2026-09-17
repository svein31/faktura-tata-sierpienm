require('../register-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildFa3Xml, validateFa3Xml } = require('../../src/lib/ksef/xmlBuilder.ts');
const { getEffectiveNbpRate } = require('../../src/lib/nbp.ts');
test('FA(3) preserves corrections and escapes text', () => {
  const invoice = { number: 'KOR/1', issueDate: '2026-09-15', saleDate: '2026-09-15', dueDate: '2026-09-29', currency: 'PLN', paymentMethod: 'transfer', isCorrection: true, correctionReason: 'Zmiana <ceny>', originalInvoiceNumber: 'FS/1', originalIssueDate: '2026-09-01', lines: [{name:'A & B',quantity:1,netPrice:100,vatRate:'23',unit:'szt.'}] };
  const xml = buildFa3Xml({ invoice, seller: { companyName: 'Firma & Co', nip: '5260301706', street: 'Test 1', city: 'Warszawa', postalCode: '00-001' }, buyer: { name: 'Klient', nip: '5250001009', address: {city:'Warszawa',street:'Test 2',postal:'00-001',country:'PL'} } });
  assert.match(xml, /<RodzajFaktury>KOR<\/RodzajFaktury>/); assert.match(xml, /Zmiana &lt;ceny&gt;/); assert.match(xml, /A &amp; B/); assert.ok(validateFa3Xml(xml).ok);
});
test('NBP uses previous published rate and rejects outage', async () => {
  const previous = global.fetch, dates = [];
  try {
    global.fetch = async url => { dates.push(url); return String(url).includes('2026-09-11') ? Response.json({ code: 'EUR', rates: [{ mid: 4.25, effectiveDate: '2026-09-11', no: '177/A/NBP/2026' }] }) : new Response('', {status:404}); };
    const result = await getEffectiveNbpRate({currency:'EUR', issueDate:'2026-09-14'});
    assert.equal(result.rate,4.25); assert.equal(result.effectiveDate,'2026-09-11'); assert.equal(dates.length,3);
    global.fetch = async () => new Response('', {status:503});
    await assert.rejects(getEffectiveNbpRate({currency:'USD',issueDate:'2026-09-14'}),/503/);
  } finally { global.fetch = previous; }
});
test('GUS BIR parses escaped SOAP data and preserves NIP', () => {
  const { parseRawGusEntities, normalizeGusCompany } = require('../../src/lib/gus/parser.ts');
  const rows = parseRawGusEntities('&lt;root&gt;&lt;dane&gt;&lt;Nip&gt;5250001009&lt;/Nip&gt;&lt;Nazwa&gt;Firma&lt;/Nazwa&gt;&lt;Regon&gt;012345678&lt;/Regon&gt;&lt;KodPocztowy&gt;00001&lt;/KodPocztowy&gt;&lt;/dane&gt;&lt;/root&gt;');
  assert.equal(rows.length, 1); assert.equal(rows[0].Nip, '5250001009');
  assert.equal(normalizeGusCompany(rows[0]).nip, '5250001009');
  assert.deepEqual(parseRawGusEntities(''), []);
});
