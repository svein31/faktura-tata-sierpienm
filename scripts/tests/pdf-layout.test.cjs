require('../register-ts.cjs');
const test=require('node:test'), assert=require('node:assert/strict');
const {PDFDocument}=require('pdf-lib');
const {generateInvoicePdfBuffer}=require('../../src/lib/pdf/generate-invoice-pdf.ts');
const {invoice,company,buyer}=require('../pdf-layout-fixture.cjs');
test('invoice PDF paginates long rows and notes instead of drawing beyond a single page',async()=>{
  const buffer=await generateInvoicePdfBuffer(invoice,buyer,company);
  const pdf=await PDFDocument.load(buffer);
  assert.ok(pdf.getPageCount()>=4);
  assert.equal(pdf.getTitle(),`Faktura ${invoice.number}`);
  for(const page of pdf.getPages()) {assert.equal(page.getWidth(),595.28);assert.equal(page.getHeight(),841.89);}
});
