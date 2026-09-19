require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const { offerAmounts, offerCanBeDecided, assertOfferVersion } = require('../../src/lib/offer-validation.ts');
const { isAccountingInvoice, monthlySummary, csvCell } = require('../../src/lib/accountant-summary.ts');
const { documentMime, documentIdentity, reviewFields } = require('../../src/lib/document-inbox.ts');
test('offers preserve zero/exempt VAT and round each line consistently', () => {
  const lines = ['0','zw','np','23'].map(vatRate => ({name:'Usługa',quantity:1,netPrice:100,vatRate}));
  const result = offerAmounts(lines);
  assert.equal(result.totalNet,400); assert.equal(result.totalVat,23); assert.equal(result.totalGross,423);
  assert.throws(() => offerAmounts([{...lines[0], quantity:0}]), /ilość/);
  assert.throws(() => offerAmounts([{...lines[0], vatRate:'99'}]), /VAT/);
  assert.throws(() => offerAmounts([{...lines[0], netPrice:Infinity}]), /cenę/);
});
test('offer decisions reject drafts, stale versions and expiry in Warsaw', () => {
  assert.equal(offerCanBeDecided({status:'sent',validUntil:'2026-09-19'}, new Date('2026-09-19T21:59:59Z')),true);
  assert.equal(offerCanBeDecided({status:'sent',validUntil:'2026-09-19'}, new Date('2026-09-19T22:00:00Z')),false);
  assert.equal(offerCanBeDecided({status:'draft',validUntil:'2099-01-01'}),false);
  assert.throws(() => assertOfferVersion(2,1), /zmieniła/);
});
test('monthly amounts never mix currencies or include draft/proforma invoices', () => {
  assert.equal(isAccountingInvoice({type:'sale',status:'draft'}),false);
  assert.equal(isAccountingInvoice({type:'sale',status:'issued',isProforma:true}),false);
  assert.equal(isAccountingInvoice({type:'purchase',status:'issued'}),true);
  const s = monthlySummary([{currency:'PLN',totalNet:100,totalVat:23,totalGross:123},{currency:'EUR',totalNet:999}], [{currency:'PLN',totalNet:20,totalVat:4.6,totalGross:24.6}], 'PLN');
  assert.equal(s.salesNet,100); assert.equal(s.expenseNet,20); assert.equal(s.vatBalance,18.4); assert.equal(s.incomeBeforeTax,80);
});
test('CSV escapes quoted multiline data and prevents spreadsheet formulas', () => {
  assert.equal(csvCell('=HYPERLINK("x")'),'"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('A;B\n"C"'),'"A;B\n""C"""');
  assert.equal(csvCell(-1),'"-1"');
  assert.equal(csvCell('\t+cmd'),'"\'\t+cmd"');
});
test('document identities deduplicate only within the same company and reject unsupported files', () => {
  const png = Buffer.from([137,80,78,71,13,10,26,10]);
  assert.equal(documentMime(png),'image/png');
  assert.deepEqual(documentIdentity('A',png),documentIdentity('A',png));
  assert.notEqual(documentIdentity('A',png).id,documentIdentity('B',png).id);
  assert.throws(()=>documentMime(Buffer.from('<svg onload="alert(1)">')),/PDF/);
  assert.throws(()=>documentMime(Buffer.alloc(4*1024*1024)),/3 MB/);
});
test('review requires valid dates and explicit reconciled amounts, never guesses VAT', () => {
  const fields = {number:'FV/1',contractorName:'Firma',issueDate:'2026-09-19',currency:'PLN',totalNet:100,totalVat:0,totalGross:100};
  assert.equal(reviewFields(fields).totalVat,0);
  assert.throws(()=>reviewFields({...fields,totalVat:23}),/Netto/);
  assert.throws(()=>reviewFields({...fields,totalNet:null}),/kwoty/);
  assert.throws(()=>reviewFields({...fields,issueDate:'2026-02-30'}),/datę/);
});
test('public portal excludes credentials and internal accounting metadata', () => {
  const { portalDocument } = require('../../src/lib/portal-document.ts');
  const dto = portalDocument({ number:'OF/1',totalGross:123,lines:[],version:2,userId:'secret-user',companyId:'secret-company',ksefXml:'private',publicToken:'secret-token',settlementMetadata:{internal:true} });
  assert.deepEqual(dto,{number:'OF/1',version:2,totalGross:123,lines:[]});
});
