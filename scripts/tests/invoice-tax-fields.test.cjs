require('../register-ts.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {parseInvoiceBody}=require('../../src/lib/parsers.ts');
const {parseInvoiceTaxFields}=require('../../src/lib/invoice-tax-fields.ts');
const {buildFa3Xml,validateFa3Xml}=require('../../src/lib/ksef/xmlBuilder.ts');
const {printInvoiceData}=require('../../src/lib/pdf/invoice-print.ts');
const {themePalette,contrastRatio,sanitizeColors}=require('../../src/lib/theme-colors.ts');
const seller={id:'a',nip:'5260301706',companyName:'Sprzedawca & Syn',street:'Testowa 1',city:'Warszawa',postalCode:'00-001'};
const buyer={id:'b',nip:'5250001003',name:'Nabywca',address:{country:'PL',street:'Testowa 2',postal:'00-001',city:'Warszawa'}};
const invoice={id:'i',number:'FV/1',type:'sale',status:'issued',documentStatus:'issued',currency:'PLN',issueDate:'2026-09-30',saleDate:'2026-09-30',dueDate:'2026-10-14',paymentMethod:'transfer',lines:[{id:'line',name:'Usługa',quantity:1,unit:'szt.',netPrice:100,vatRate:'23'}]};
function schema(xml){const r=spawnSync(process.platform==='win32'?'python':'python3',['scripts/validate-jpk.py','fa3.xsd'],{input:xml,encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
test('tax fields preserve omitted values and accept only legal codes and boolean MPP',()=>{
 assert.deepEqual(parseInvoiceTaxFields({}),{});
 assert.deepEqual(parseInvoiceTaxFields({exemptionBasis:null}),{exemptionBasis:null});
 assert.deepEqual(parseInvoiceTaxFields({gtuCodes:['GTU_01','GTU_01'],jpkProcedures:['TP'],isSplitPayment:true,vatRegisterPeriod:'2026-09'}),{gtuCodes:['GTU_01'],jpkProcedures:['TP'],isSplitPayment:true,vatRegisterPeriod:'2026-09'});
 for(const payload of [{gtuCodes:['GTU_99']},{jpkProcedures:['MPP']},{jpkProcedures:['MPU']},{isSplitPayment:'false'},{jpkDocumentType:'invalid'},{vatRegisterPeriod:'2026-13'}])assert.throws(()=>parseInvoiceTaxFields(payload));
});
test('FA3 serializes MPP and VAT exemption basis and validates against official XSD',()=>{
 const mpp=buildFa3Xml({invoice:{...invoice,isSplitPayment:true},seller,buyer});assert.match(mpp,/<P_18A>1<\/P_18A>/);schema(mpp);
 const exempt=buildFa3Xml({invoice:{...invoice,exemptionBasis:'art. 113 ust. 1 ustawy o VAT',lines:[{...invoice.lines[0],vatRate:'zw'}]},seller,buyer});assert.match(exempt,/<P_19A>art. 113/);assert.equal(validateFa3Xml(exempt).ok,true);schema(exempt);
 const missing=buildFa3Xml({invoice:{...invoice,lines:[{...invoice.lines[0],vatRate:'zw'}]},seller,buyer});assert.equal(validateFa3Xml(missing).ok,false);
});
test('immutable PDF source includes MPP and exemption but excludes operational secrets',()=>{
 const data=printInvoiceData({...invoice,isSplitPayment:true,exemptionBasis:'art. 113',ksefXml:'not archived'});assert.equal(data.isSplitPayment,true);assert.equal(data.exemptionBasis,'art. 113');assert.equal(data.ksefXml,undefined);
});
test('generated theme text tokens meet 4.5:1 on background, card and muted surfaces',()=>{
 for(const mode of ['light','dark'])for(const background of ['#000000','#ffffff','#808080','#ff0000','#00ff00','#0000ff','#ffff00','#4f46e5'])for(const accent of ['#ffffff','#000000','#a5a0ff','#08ff90']){
   const palette=themePalette(mode,sanitizeColors({accent,backgrounds:{[mode]:background}}));
   for(const surface of ['background','card','muted'])for(const foreground of ['foreground','muted-foreground','primary'])assert.ok(contrastRatio(palette[surface],palette[foreground])>=4.5,mode+' '+background+' '+foreground);
   assert.ok(contrastRatio(palette.primary,palette['primary-foreground'])>=4.5);
 }
});

test('invoice body persists VAT fields and refuses issued exempt invoice without a basis',async()=>{
 const body={...invoice,contractorId:'buyer',paymentTermDays:14,gtuCodes:['GTU_12'],jpkProcedures:['TP'],isSplitPayment:true};
 const result=await parseInvoiceBody({...body,exemptionBasis:null},{contractorOwnedBy:async()=>true});
 assert.equal(result.exemptionBasis,null);
 assert.equal(result.isSplitPayment,true);assert.deepEqual(result.gtuCodes,['GTU_12']);assert.deepEqual(result.jpkProcedures,['TP']);
 await assert.rejects(parseInvoiceBody({...body,lines:[{...invoice.lines[0],vatRate:'zw'}]},{contractorOwnedBy:async()=>true}),/zwolnienia/);
});
