require('../register-ts.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {printInvoiceData}=require('../../src/lib/pdf/invoice-print.ts');
const {printConfig}=require('../../src/lib/pdf/print-config.ts');
const {invoice}=require('../pdf-layout-fixture.cjs');
test('PDF snapshots contain rendering fields but exclude credentials and operational metadata',()=>{
 const base=printInvoiceData({...invoice,ksef:{number:'KSEF',environment:'test',token:'secret'},ksefToken:'secret',ksefXml:'secret',payments:[{amount:99}],paidAmount:99});
 assert.equal(base.number,invoice.number);assert.deepEqual(base.lines,invoice.lines);
 assert.deepEqual(base.ksef,{number:'KSEF',environment:'test'});
 assert.equal(JSON.stringify(base).includes('secret'),false);
 assert.equal('payments' in base,false);assert.equal('paidAmount' in base,false);
 assert.deepEqual(printInvoiceData({...invoice,approvalStatus:'approved',version:44}),printInvoiceData(invoice));
});
test('PDF template config accepts bounded plain text and approved layout values',()=>{
 const value={accentColor:'#123456',footerText:'Firma',layout:'compact'};
 assert.deepEqual(printConfig(value),value);
 for(const patch of [{accentColor:'red'},{accentColor:'#12GG34'},{layout:'script'},{footerText:'x'.repeat(151)}]) assert.throws(()=>printConfig({...value,...patch}));
});
