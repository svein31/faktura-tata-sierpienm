require('../register-ts.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {buildAdvanceLines,buildFinalLines}=require('../../src/lib/advance-lines.ts'),{invoiceTotals}=require('../../src/lib/format.ts'),{buildFa3Xml,validateFa3Xml}=require('../../src/lib/ksef/xmlBuilder.ts'),{parseInvoiceBody}=require('../../src/lib/parsers.ts');
const order=[{id:'a',name:'A',quantity:1,unit:'szt.',netPrice:100,vatRate:'23'},{id:'b',name:'B',quantity:1,unit:'szt.',netPrice:100,vatRate:'8'}];
const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
function validate(xml){const r=spawnSync(pythonCmd,['scripts/validate-jpk.py','fa3.xsd'],{input:xml,encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.equal(validateFa3Xml(xml).ok,true);}
test('advances allocate net cents across VAT groups and final totals reconcile exactly',()=>{
 const a=buildAdvanceLines(order,[],60),b=buildAdvanceLines(order,[a],40),final=buildFinalLines(order,[{number:'Z/1',lines:a},{number:'Z/2',lines:b}]);
 assert.equal(invoiceTotals({lines:a}).net,60);assert.equal(invoiceTotals({lines:b}).net,40);assert.equal(invoiceTotals({lines:final}).net,100);
 assert.equal(invoiceTotals({lines:a}).gross+invoiceTotals({lines:b}).gross+invoiceTotals({lines:final}).gross,231);
 assert.throws(()=>buildAdvanceLines(order,[a,b],101),/przekracza/);
 const small=[{...order[0],netPrice:0.1,vatRate:'5'}],full=buildAdvanceLines(small,[],0.1);assert.equal(invoiceTotals({lines:buildFinalLines(small,[{number:'Z',lines:full}])}).gross,0);
});
test('only the settlement parser mode accepts signed settlement lines',async()=>{
 const advance=buildAdvanceLines(order,[],60), finalLines=buildFinalLines(order,[{number:'Z/1',lines:advance}]);
 const body={number:'FK/1',type:'sale',status:'issued',contractorId:'buyer',issueDate:'2026-09-15',saleDate:'2026-09-15',dueDate:'2026-09-29',currency:'PLN',paymentMethod:'transfer',lines:finalLines};
 const owner={contractorOwnedBy:async()=>true};
 await assert.rejects(parseInvoiceBody(body,owner),/cena netto/);
 const parsed=await parseInvoiceBody(body,{...owner,allowSettlementLines:true});
 assert.equal(parsed.lines.some(line=>line.settlementNet<0),true);
 assert.equal(invoiceTotals({lines:parsed.lines}).gross,invoiceTotals({lines:finalLines}).gross);
});
test('FA3 advance and final invoices validate with payment date, order and advance references',()=>{
 const lines=buildAdvanceLines(order,[],60),base={number:'Z/1',status:'paid',documentKind:'advance',advanceReceivedDate:'2026-09-15',issueDate:'2026-09-15',saleDate:'2026-09-15',dueDate:'2026-09-29',currency:'PLN',paymentMethod:'transfer',lines,settlementMetadata:{sourceId:'s',sourceNumber:'PF/1',orderLines:order,advances:[]}};
 const seller={companyName:'Firma',nip:'5260301706',street:'Test 1',city:'Warszawa',postal:'00-001'},buyer={name:'Klient',nip:'5250001003',address:{country:'PL',city:'Warszawa',street:'Test 2',postal:'00-001'}};
 const xml=buildFa3Xml({invoice:base,seller,buyer});validate(xml);assert.match(xml,/<RodzajFaktury>ZAL/);assert.match(xml,/<DataZaplaty>2026-09-15/);
 const final={...base,number:'FV/1',status:'issued',documentKind:'final',advanceReceivedDate:undefined,lines:buildFinalLines(order,[{number:'Z/1',lines}]),settlementMetadata:{...base.settlementMetadata,advances:[{id:'z',number:'Z/1',gross:invoiceTotals({lines}).gross}]}};
 const finalXml=buildFa3Xml({invoice:final,seller,buyer});validate(finalXml);assert.match(finalXml,/<RodzajFaktury>ROZ/);assert.match(finalXml,/<NrFaZaliczkowej>Z\/1/);
 assert.throws(()=>buildFa3Xml({invoice:{...base,advanceReceivedDate:undefined},seller,buyer}),/rzeczywistej daty/);
});
