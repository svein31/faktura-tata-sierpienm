require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const { parseInvoiceBody } = require('../../src/lib/parsers.ts');
const { getEffectiveNbpRate, isIsoCalendarDate } = require('../../src/lib/nbp.ts');
const body = { number: 'FX/1', type: 'sale', status: 'draft', contractorId: 'contact', issueDate: '2026-09-14', saleDate: '2026-09-14', dueDate: '2026-09-28', currency: 'EUR', language: 'PL', paymentMethod: 'transfer', lines: [{name:'Service',quantity:2,netPrice:50,vatRate:'23'}] };
const opts = { contractorOwnedBy: async()=>true };
test('EUR and USD invoices ignore spoofed client rate and PLN totals', async () => {
  const previous = global.fetch;
  try {
    for (const currency of ['EUR','USD']) {
      global.fetch = async url => String(url).includes('2026-09-11') ? Response.json({code:currency,rates:[{mid:4.25,effectiveDate:'2026-09-11',no:'177/A/NBP/2026'}]}) : new Response('',{status:404});
      const data = await parseInvoiceBody({...body,currency,exchangeRate:999,totalGrossPln:1},opts);
      assert.equal(data.exchangeRate,4.25); assert.equal(data.exchangeRateDate,'2026-09-11');
      assert.equal(data.totalNet,100); assert.equal(data.totalVat,23); assert.equal(data.totalGross,123);
      assert.equal(data.totalNetPln,425); assert.equal(data.totalVatPln,97.75); assert.equal(data.totalGrossPln,522.75);
    }
  } finally { global.fetch = previous; }
});
test('manual rate requires justification, PLN resets old currency metadata',async()=>{
  await assert.rejects(parseInvoiceBody({...body,exchangeRateRule:'manual',exchangeRate:4.2},opts),/uzasadnienia/);
  const manual=await parseInvoiceBody({...body,exchangeRateRule:'manual',exchangeRate:4.2,exchangeRateJustification:'Weryfikacja dokumentu źródłowego'},opts);
  assert.equal(manual.totalGrossPln,516.6);
  const pln=await parseInvoiceBody({...body,currency:'PLN',exchangeRate:4.2,exchangeRateTable:'forged'},opts);
  assert.equal(pln.exchangeRate,null); assert.equal(pln.exchangeRateTable,null); assert.equal(pln.totalGrossPln,123);
});
test('invalid calendar dates and unexpected NBP responses fail closed',async()=>{
  assert.equal(isIsoCalendarDate('2026-02-30'),false); assert.equal(isIsoCalendarDate('2024-02-29'),true);
  await assert.rejects(parseInvoiceBody({...body,issueDate:'2026-02-30'},opts),/data/);
  const previous=global.fetch;
  try {
    global.fetch=async()=>Response.json({code:'USD',rates:[{mid:4,effectiveDate:'2026-09-13',no:'x'}]});
    await assert.rejects(getEffectiveNbpRate({currency:'EUR',issueDate:'2026-09-14'}),/nieprawidłowy/);
    global.fetch=async()=>new Response('',{status:429});
    await assert.rejects(parseInvoiceBody(body,opts),error=>error.status===502);
  } finally {global.fetch=previous;}
});
