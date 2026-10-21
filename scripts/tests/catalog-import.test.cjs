require('../register-ts.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {spreadsheet}=require('../../src/lib/xlsx.ts');
const {zipFiles}=require('../../src/lib/zip.ts');
const {parseCatalogXlsx}=require('../../src/lib/catalog-xlsx.ts');
const {validateProductImportRows,excludeExistingProducts}=require('../../src/lib/product-import.ts');
const {suggestCatalogMapping}=require('../../src/lib/catalog-import-config.ts');
const {readImportRequest}=require('../../src/lib/import-request.ts');
const {catalogWorkbook}=require('../fixtures/catalog-workbook.cjs');
const row=(patch={})=>({name:'Konsultacja',sku:'K-1',unit:'godz.',netPrice:'1 250,50',vatRate:'23%',currency:'PLN',description:'Opis',...patch});
function parts(buffer){let at=0,files=[];while(buffer.readUInt32LE(at)===0x04034b50){const n=buffer.readUInt16LE(at+26),length=buffer.readUInt32LE(at+18),start=at+30+n;files.push({name:buffer.subarray(at+30,start).toString(),data:buffer.subarray(start,start+length).toString()});at=start+length;}return files;}
const mutate=(files,name,transform)=>zipFiles(files.map(file=>file.name===name?{...file,data:transform(file.data)}:file));
test('catalog mapping recognizes exported Polish headers and assigns each source once',()=>{
 const mapping=suggestCatalogMapping('products',['Nazwa','SKU','Jednostka','Cena netto (PLN)','Stawka VAT','Waluta','Opis']);assert.deepEqual(mapping,{name:'0',sku:'1',unit:'2',netPrice:'3',vatRate:'4',currency:'5',description:'6'});
 assert.equal(suggestCatalogMapping('contractors',['Nazwa firmy','NIP','E-mail']).name,'0');
});
test('product import parses Polish amounts and VAT without mutating or coercing bad prices',()=>{
 const source=row(),result=validateProductImportRows([source]);assert.equal(result.values[0].netPrice,1250.5);assert.equal(result.values[0].vatRate,'23');assert.equal(source.netPrice,'1 250,50');
 for(const netPrice of ['', '-1','1.234','1,234.56','12abc','1e3','Infinity','1000000000'])assert.equal(validateProductImportRows([row({netPrice})]).results[0].status,'invalid',netPrice);
 for(const vatRate of ['','22','0.23','25%'])assert.equal(validateProductImportRows([row({vatRate})]).results[0].status,'invalid');
 assert.equal(validateProductImportRows([row({currency:'EUR'})]).results[0].status,'invalid');assert.equal(validateProductImportRows([row({netPrice:'0',vatRate:'zw'})]).values[0].netPrice,0);
});
test('product duplicates normalize SKU/name and never replace an existing product',()=>{
 const result=validateProductImportRows([row(),row({name:'Different label',sku:'k-1'}),row({sku:'',name:' Bez SKU '}),row({sku:'',name:'bez sku'})]);
 assert.deepEqual(result.results.map(r=>r.status),['ready','duplicate','ready','duplicate']);
 const existing=[{name:'Existing',sku:'k-1'}],pending=excludeExistingProducts(result.values,result.results,existing);assert.equal(pending.length,1);assert.equal(pending[0].name,'Bez SKU');assert.equal(result.results[0].status,'duplicate');assert.equal(existing[0].name,'Existing');
});
test('product import rejects structural/field/batch overflow',()=>{
 for(const input of [null,[],Array(201).fill(row()),[null],[row({name:15})],[row({description:'x'.repeat(1001)})]])assert.throws(()=>validateProductImportRows(input));
});
test('Excel reads numeric prices and text NIP/leading zero without interpreting strings as formulas',()=>{
 const table=parseCatalogXlsx(spreadsheet([['Nazwa','NIP','Cena'],['Zażółć','0012345678',125.5],['=1+1','5250001003',0]]));
 assert.deepEqual(table.headers,['Nazwa','NIP','Cena']);assert.deepEqual(table.rows,[['Zażółć','0012345678','125.5'],['=1+1','5250001003','0']]);assert.deepEqual(table.sheets,['Faktury']);
});
test('Excel reads compressed OOXML archives and rejects tampered compressed data',()=>{
 const bytes=catalogWorkbook([['Nazwa','NIP'],['Żółta firma','0012345678']]);assert.deepEqual(parseCatalogXlsx(bytes).rows,[['Żółta firma','0012345678']]);
 const damaged=Buffer.from(bytes);damaged[45]^=1;assert.throws(()=>parseCatalogXlsx(damaged));
});
test('Excel supports shared/rich strings and selecting a second sheet after an empty first',()=>{
 const files=parts(spreadsheet([['name'],['value']]));
 files.find(f=>f.name==='xl/workbook.xml').data=files.find(f=>f.name==='xl/workbook.xml').data.replace('</sheets>','<sheet name="Drugi" sheetId="2" r:id="rId2"/></sheets>');
 files.find(f=>f.name==='xl/_rels/workbook.xml.rels').data=files.find(f=>f.name==='xl/_rels/workbook.xml.rels').data.replace('</Relationships>','<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>');
 files.find(f=>f.name==='xl/worksheets/sheet1.xml').data='<worksheet><sheetData/></worksheet>';
 files.push({name:'xl/sharedStrings.xml',data:'<sst><si><t>Nazwa</t></si><si><r><t>Zażółć </t></r><r><t>gęślą</t></r></si></sst>'},{name:'xl/worksheets/sheet2.xml',data:'<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c></row></sheetData></worksheet>'});
 const bytes=zipFiles(files);assert.equal(parseCatalogXlsx(bytes).rows.length,0);assert.deepEqual(parseCatalogXlsx(bytes,1).rows,[['Zażółć gęślą']]);assert.throws(()=>parseCatalogXlsx(bytes,2));
});
test('Excel rejects formulas, entities, cell errors, invalid CRC and row/column overflow',()=>{
 const files=parts(spreadsheet([['name'],['value']]));
 assert.throws(()=>parseCatalogXlsx(spreadsheet([['name'],['value']]).subarray(0,10)));
 assert.throws(()=>parseCatalogXlsx(mutate(files,'xl/worksheets/sheet1.xml',text=>text.replace('<is><t xml:space="preserve">value</t></is>','<f>1+1</f><v>2</v>'))),/formuły/);
 assert.throws(()=>parseCatalogXlsx(mutate(files,'xl/workbook.xml',text=>'<!DOCTYPE workbook [<!ENTITY a "b">]>'+text)));
 assert.throws(()=>parseCatalogXlsx(mutate(files,'xl/worksheets/sheet1.xml',()=>'<worksheet><sheetData><row><c r="A1" t="e"><v>#VALUE!</v></c></row></sheetData></worksheet>')),/błąd komórki/);
 const damaged=Buffer.from(spreadsheet([['name'],['value']]));damaged[55]^=1;assert.throws(()=>parseCatalogXlsx(damaged));
 assert.throws(()=>parseCatalogXlsx(spreadsheet([['name'],...Array.from({length:201},()=>['x'])])),/200/);
 assert.throws(()=>parseCatalogXlsx(spreadsheet([Array(31).fill('header'),Array(31).fill('x')])),/30 kolumn/);
});
test('Excel rejects macros and archive expansion claims before decompression',()=>{
 const files=parts(spreadsheet([['name'],['value']]));assert.throws(()=>parseCatalogXlsx(zipFiles([...files,{name:'xl/vbaProject.bin',data:'macro'}])),/makr/);
 const bytes=Buffer.from(zipFiles(files));let at=bytes.readUInt32LE(bytes.length-6);bytes.writeUInt32LE(5_000_000,at+24);assert.throws(()=>parseCatalogXlsx(bytes),/rozpakowaniu/);
});
test('Excel never converts a boolean cell into a financial amount',()=>{
 const files=parts(spreadsheet([['name'],['value']]));assert.throws(()=>parseCatalogXlsx(mutate(files,'xl/worksheets/sheet1.xml',()=>'<worksheet><sheetData><row><c r="A1" t="b"><v>1</v></c></row></sheetData></worksheet>')),/logiczną/);
});
test('Excel never treats a date serial as a product price',()=>{
 const files=parts(spreadsheet([['Cena netto'],[45950]]));files.push({name:'xl/styles.xml',data:'<styleSheet><cellXfs><xf numFmtId="14"/></cellXfs></styleSheet>'});assert.throws(()=>parseCatalogXlsx(zipFiles(files)),/daty nie są przeliczane/);
});
test('stream body limits apply without Content-Length and cancel oversized streams',async()=>{
 const request=new Request('http://localhost',{method:'POST',body:'abcdef'});await assert.rejects(readImportRequest(request,3),e=>e.status===413);
 assert.equal((await readImportRequest(new Request('http://localhost',{method:'POST',body:'abc'}),3)).toString(),'abc');
});
