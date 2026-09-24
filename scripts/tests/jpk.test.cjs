require('../register-ts.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {buildJpk,parseJpkOptions}=require('../../src/lib/jpk.ts');
const company={id:'a',nip:'5260301706',companyName:'Sprzedawca & Syn'},buyer={id:'b',nip:'5250001003',name:'Nabywca <Test>',address:{country:'PL',street:'Testowa 1',postal:'00-001',city:'Warszawa'}};
const inv={id:'i',number:'FV/1',type:'sale',status:'issued',contractorId:'b',currency:'EUR',exchangeRate:4.25,issueDate:'2026-09-15',saleDate:'2026-09-15',lines:[{name:'Usługa & test',quantity:1,unit:'szt.',netPrice:100,vatRate:'23'},{name:'Usługa',quantity:1,unit:'szt.',netPrice:50,vatRate:'8'}]};
const options={format:'fa',dateFrom:'2026-09-01',dateTo:'2026-09-30',office:'1471',currency:'EUR',email:'test@example.com',normalDomestic:true,fullDeduction:true,noSpecialCodes:true,nonKsefCode:'BFK',address:{Wojewodztwo:'mazowieckie',Powiat:'Warszawa',Gmina:'Warszawa',NrDomu:'1',Miejscowosc:'Warszawa',KodPocztowy:'00-001'}};
const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
function validate(xml,schema){const r=spawnSync(pythonCmd,['scripts/validate-jpk.py',schema],{input:xml,encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
test('JPK_FA4 and VAT3 exports validate against official XSD and escape taxpayer data',()=>{
 const fa=buildJpk([inv],[buyer],company,parseJpkOptions(options));validate(fa,'jpk-fa4.xsd');assert.match(fa,/<P_14_1W>97.75/);assert.match(fa,/Sprzedawca &amp; Syn/);
 const vat=buildJpk([inv,{...inv,id:'p',type:'purchase',number:'FZ/1'}],[buyer],company,parseJpkOptions({...options,format:'vat'}));validate(vat,'jpk-v7m3.xsd');assert.match(vat,/<K_19>425.00/);assert.match(vat,/<PodatekNalezny>114.75/);assert.ok(!vat.includes('<Deklaracja>'));
 const individual=buildJpk([],[],company,parseJpkOptions({...options,format:'vat',individual:true,firstName:'Jan',lastName:'Nowak',birthDate:'1990-01-02'}));validate(individual,'jpk-v7m3.xsd');
 const correction=buildJpk([{...inv,isCorrection:true,originalInvoiceNumber:'FV/0',lines:[{...inv.lines[0],quantity:-1}]}],[buyer],company,parseJpkOptions(options));validate(correction,'jpk-fa4.xsd');assert.match(correction,/<WartoscFaktur>-123.00/);
});
test('JPK refuses unclassified tax cases, missing FX and invalid periods',()=>{
 assert.throws(()=>parseJpkOptions({...options,normalDomestic:false}));assert.throws(()=>parseJpkOptions({...options,format:'vat',dateFrom:'2026-09-02'}));
 assert.throws(()=>buildJpk([{...inv,exchangeRate:null}],[buyer],company,parseJpkOptions({...options,format:'vat'})),/kursu/);
 assert.throws(()=>buildJpk([{...inv,lines:[{...inv.lines[0],vatRate:'np'}]}],[buyer],company,parseJpkOptions(options)),/stawka/);
 assert.throws(()=>buildJpk([{...inv,isProforma:true}],[buyer],company,parseJpkOptions(options)),/Brak/);
});
