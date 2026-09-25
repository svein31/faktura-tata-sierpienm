require('../register-ts.cjs');
const test=require('node:test'), assert=require('node:assert/strict');
const {PDFDocument,PDFName,PDFDict}=require('pdf-lib');
const {generateInvoicePdfBuffer}=require('../../src/lib/pdf/generate-invoice-pdf.ts');
const {ksefAcceptanceDateFromUpo}=require('../../src/lib/pdf/ksef-acceptance-date.ts');
const {invoice,company,buyer}=require('../pdf-layout-fixture.cjs');
const shortInvoice={...invoice,number:'FV/01/09/2026',lines:invoice.lines.slice(0,2),notes:''};
function imageCount(pdf){
  const resources=pdf.getPage(0).node.Resources();
  const images=resources.lookup(PDFName.of('XObject'),PDFDict);
  return images ? images.keys().length : 0;
}
test('ordinary accepted KSeF invoice fits one A4 page with its verification image in the header',async()=>{
  const buffer=await generateInvoicePdfBuffer({...shortInvoice,ksefNumber:'5260301706-20260920-AAAAAA-BBBBBB-CC',ksefAcceptedAt:'2026-09-21',qrCodeI:'https://qr.ksef.mf.gov.pl/invoice/test'},buyer,company);
  const pdf=await PDFDocument.load(buffer);
  assert.equal(pdf.getPageCount(),1);
  assert.equal(imageCount(pdf),1);
});
test('offline invoice retains both required verification images on one page',async()=>{
  const buffer=await generateInvoicePdfBuffer({...shortInvoice,isOffline:true,qrCodeI:'https://qr.ksef.mf.gov.pl/offline/test',qrCodeII:'https://qr.ksef.mf.gov.pl/certificate/test'},buyer,company);
  const pdf=await PDFDocument.load(buffer);
  assert.equal(pdf.getPageCount(),1);
  assert.equal(imageCount(pdf),2);
});
test('UPO date is selected for the matching KSeF number and converted to Polish time',()=>{
  const upo='<UPO><Dokument><NumerKSeFDokumentu>OTHER</NumerKSeFDokumentu><DataNadaniaNumeruKSeF>2026-09-20T10:00:00Z</DataNadaniaNumeruKSeF></Dokument><Dokument><NumerKSeFDokumentu>EXPECTED</NumerKSeFDokumentu><DataNadaniaNumeruKSeF>2026-09-25T22:30:00Z</DataNadaniaNumeruKSeF></Dokument></UPO>';
  assert.equal(ksefAcceptanceDateFromUpo(upo,'EXPECTED'),'2026-09-26');
  assert.equal(ksefAcceptanceDateFromUpo(upo,'MISSING'),null);
});
test('invoice PDF paginates long rows and notes instead of drawing beyond a single page',async()=>{
  const buffer=await generateInvoicePdfBuffer(invoice,buyer,company);
  const pdf=await PDFDocument.load(buffer);
  assert.ok(pdf.getPageCount()>=4);
  assert.equal(pdf.getTitle(),`Faktura ${invoice.number}`);
  for(const page of pdf.getPages()) {assert.equal(page.getWidth(),595.28);assert.equal(page.getHeight(),841.89);}
});
