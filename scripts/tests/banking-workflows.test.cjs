require('../register-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const {parseStatement,parseStatementCsv,parseMt940,parseCamt053,statementAmount} = require('../../src/lib/banking/statement-parser.ts');
const {reconcile} = require('../../src/lib/banking/reconciliation.ts');
const {paymentExport} = require('../../src/lib/banking/payment-export.ts');
const {zipFiles} = require('../../src/lib/zip.ts');
const {spreadsheet} = require('../../src/lib/xlsx.ts');
const {XMLValidator,XMLParser} = require('fast-xml-parser');
const iban='PL61109010140000071219812874';
test('CSV parses signed amounts, explicit currencies, quoted titles and CRLF',()=>{
 const rows=parseStatementCsv('Data;Kwota;Waluta;Tytuł;Nadawca\r\n30.09.2026;"1 234,50";EUR;"FV/1; część \"\"A\"\"";Firma\r\n2026-09-30;-123,00;PLN;KOSZT/1;Dostawca');
 assert.equal(rows.length,2);assert.equal(rows[0].amount,1234.5);assert.equal(rows[0].currency,'EUR');assert.equal(rows[0].title,'FV/1; część "A"');assert.equal(rows[1].amount,-123);
});
test('CSV preserves multiline fields and debit/credit columns',()=>{
 const rows=parseStatementCsv('Date,Credit,Debit,Currency,Description\n2026-09-30,123.45,,PLN,"first\nsecond"\n2026-09-30,,50.00,PLN,cost');
 assert.equal(rows[0].title,'first\nsecond');assert.equal(rows[1].amount,-50);
});
test('Malformed dates, amounts, headers and XML entities cannot silently produce payments',()=>{
 assert.throws(()=>parseStatementCsv('Data;Kwota\n2026-02-30;1'),/data/i);
 for(const amount of ['123abc','1,2345','NaN'])assert.throws(()=>statementAmount(amount));
 assert.throws(()=>parseStatement('text without header'));
 assert.throws(()=>parseCamt053('<!DOCTYPE Document [<!ENTITY a "text">]><Document/>'),/DTD/);
});
test('MT940 supports credits, debits, reversal signs and multiline descriptions',()=>{
 const text=':20:STATEMENT\n:25:'+iban+'\n:60F:C260930PLN1000,00\n:61:260930C123,00NTRFREF//REF1\n:86:020?20FV/2026/1\n?32Przykładowa?33Firma\n:61:260930RD10,00NTRF//REF2\n:61:260930D50,00NTRF//REF3\n:62F:C260930PLN1083,00';
 const rows=parseMt940(text);assert.equal(rows.length,3);assert.equal(rows[0].senderName,'Przykładowa Firma');assert.match(rows[0].title,/FV\/2026\/1/);assert.equal(rows[1].amount,10);assert.equal(rows[2].amount,-50);assert.equal(rows[0].currency,'PLN');
});
function camt(entries){return '<ns:Document xmlns:ns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08"><ns:BkToCstmrStmt><ns:Stmt><ns:Acct><ns:Id><ns:IBAN>'+iban+'</ns:IBAN></ns:Id></ns:Acct>'+entries+'</ns:Stmt></ns:BkToCstmrStmt></ns:Document>';}
test('camt handles namespace, booking currency and debit counterparties',()=>{
 const text=camt('<Ntry><Amt Ccy="PLN">123.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts><Cd>BOOK</Cd></Sts><BookgDt><Dt>2026-09-30</Dt></BookgDt><NtryDtls><TxDtls><AmtDtls><TxAmt><Amt Ccy="EUR">25</Amt></TxAmt></AmtDtls><RltdPties><Cdtr><Nm>Dostawca</Nm></Cdtr></RltdPties><RmtInf><Ustrd>KOSZT/1</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>');
 const [row]=parseCamt053(text);assert.equal(row.amount,-123);assert.equal(row.currency,'PLN');assert.equal(row.senderName,'Dostawca');
});
test('camt rejects aggregate entries without individual amounts',()=>{
 assert.throws(()=>parseCamt053(camt('<Ntry><Amt Ccy="PLN">100</Amt><CdtDbtInd>CRDT</CdtDbtInd><BookgDt><Dt>2026-09-30</Dt></BookgDt><NtryDtls><TxDtls/><TxDtls/></NtryDtls></Ntry>')),/kwot/);
});
const candidate={id:'a',kind:'invoice',number:'FV/1',type:'sale',currency:'PLN',totalGross:123,paidAmount:0,contractorNip:'5260301706'};
const transaction={date:'2026-09-30',amount:123,currency:'PLN',title:'Zapłata FV/1',senderName:'',raw:''};
test('matching requires direction and currency, and invoice numbers have boundaries',()=>{
 assert.equal(reconcile([transaction],[candidate])[0].matchedInvoiceId,'a');
 assert.equal(reconcile([{...transaction,currency:'EUR'}],[candidate])[0].matchedInvoiceId,undefined);
 assert.equal(reconcile([{...transaction,amount:-123}],[candidate])[0].matchedInvoiceId,undefined);
 assert.equal(reconcile([{...transaction,title:'FV/10'}],[candidate])[0].matchedInvoiceId,undefined);
});
test('ambiguous same-company invoice numbers never select first candidate',()=>{
 const [row]=reconcile([transaction],[candidate,{...candidate,id:'b'}]);assert.equal(row.ambiguous,true);assert.equal(row.matchedInvoiceId,undefined);
});
test('NIP with remaining amount identifies payment without invoice number',()=>{
 assert.equal(reconcile([{...transaction,amount:100,title:'NIP 526-030-17-06'}],[{...candidate,paidAmount:23}])[0].matchedInvoiceId,'a');
 assert.equal(reconcile([{...transaction,amount:99,title:'NIP 526-030-17-06'}],[{...candidate,paidAmount:23}])[0].matchedInvoiceId,undefined);
});
test('costs can match outgoing payments but not incoming sales',()=>{
 const expense={...candidate,kind:'expense',type:'purchase'};assert.equal(reconcile([{...transaction,amount:-123}],[expense])[0].matchedExpenseId,'a');
});
const pack={debtor:'Firma & Syn',debtorIban:iban,executionDate:'2026-10-01',format:'pain001',messageId:'MSG1',transfers:[{id:'a',recipient:'Dostawca <A>',iban,amount:123.45,currency:'PLN',title:'FV/1 & usługa'}]};
test('payment XML has valid escaped names and exact control totals',()=>{
 const result=paymentExport(structuredClone(pack));assert.equal(XMLValidator.validate(result.content),true);assert.match(result.content,/CtrlSum>123.45/);assert.match(result.content,/Dostawca &lt;A&gt;/);assert.match(result.content,/pain.001.001.03/);
 const parsed=new XMLParser().parse(result.content);assert.equal(parsed.Document.CstmrCdtTrfInitn.GrpHdr.NbOfTxs,1);
});
test('payment packs reject invalid IBAN, mixed currencies, duplicate documents and invalid dates',()=>{
 assert.throws(()=>paymentExport({...pack,debtorIban:'PL00000000000000000000000000'}),/IBAN/);
 assert.throws(()=>paymentExport({...pack,executionDate:'2026-02-30'}),/dat/);
 assert.throws(()=>paymentExport({...pack,transfers:[pack.transfers[0],pack.transfers[0]]}),/więcej/);
 assert.throws(()=>paymentExport({...pack,transfers:[pack.transfers[0],{...pack.transfers[0],id:'b',currency:'EUR'}]}),/walut/);
});
test('Elixir rejects non-domestic transfers and CSV neutralizes formula recipients',()=>{
 assert.throws(()=>paymentExport({...pack,format:'elixir',transfers:[{...pack.transfers[0],currency:'EUR'}]}),/PLN/);
 const result=paymentExport({...pack,format:'csv',transfers:[{...pack.transfers[0],recipient:'=HYPERLINK("x")'}]});assert.match(result.content,/'=HYPERLINK/);
});
function unzip(bytes){let at=0,result={};while(bytes.readUInt32LE(at)===0x04034b50){const length=bytes.readUInt32LE(at+18),nameLength=bytes.readUInt16LE(at+26),extra=bytes.readUInt16LE(at+28);const name=bytes.subarray(at+30,at+30+nameLength).toString();const start=at+30+nameLength+extra;result[name]=bytes.subarray(start,start+length).toString();at=start+length;}return result;}
test('ZIP preserves Unicode and rejects traversal and duplicate paths',()=>{
 const bytes=zipFiles([{name:'księgowość.csv',data:'Zażółć gęślą jaźń'}]);assert.equal(unzip(bytes)['księgowość.csv'],'Zażółć gęślą jaźń');assert.throws(()=>zipFiles([{name:'../token',data:'x'}]));assert.throws(()=>zipFiles([{name:'a',data:'a'},{name:'a',data:'b'}]));
});
test('XLSX encodes strings without formulas and preserves leading zero tax IDs',()=>{
 const files=unzip(spreadsheet([['NIP','Nazwa','Kwota'],['0012345678','=1+1',123.45]]));assert.equal(Object.keys(files).length,5);assert.equal(XMLValidator.validate(files['xl/worksheets/sheet1.xml']),true);assert.match(files['xl/worksheets/sheet1.xml'],/0012345678/);assert.match(files['xl/worksheets/sheet1.xml'],/=1\+1/);assert.doesNotMatch(files['xl/worksheets/sheet1.xml'],/<f>/);assert.match(files['xl/worksheets/sheet1.xml'],/<v>123.45<\/v>/);
});
