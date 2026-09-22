require('./register-ts.cjs');
const fs = require('node:fs'), path = require('node:path');
const { generateInvoicePdfBuffer } = require('../src/lib/pdf/generate-invoice-pdf.ts');
const invoice = {
  id: 'fixture', number: 'FV/2026/VERY-LONG-DOCUMENT-NUMBER-FOR-LAYOUT-VERIFICATION', type: 'sale', status: 'issued', currency: 'PLN', language: 'PL',
  issueDate: '2026-09-20', saleDate: '2026-09-20', dueDate: '2026-10-04', paymentMethod: 'transfer',
  lines: Array.from({length:60}, (_,i)=>({id:String(i),name:`Pozycja ${i+1}: usluga geodezyjna z pelnym opisem zakresu pomiarow, dokumentacji i przekazania wynikow - KONIEC-${i+1}`,quantity:2,unit:'szt.',netPrice:100,vatRate:'23',discount:0})),
  notes: 'PELNE UWAGI: ' + 'Opis warunkow wykonania uslugi i przekazania dokumentacji. '.repeat(30) + 'KONIEC-UWAG',
};
const company = {id:'company',userId:'user',nip:'5260301706',companyName:'Geomatic - bardzo dluga nazwa firmy z pelnymi danymi do sprawdzenia zawijania tekstu',street:'Dluga Ulica Testowa',buildingNumber:'123',postalCode:'00-001',city:'Warszawa',isDefault:true,createdAt:'2026-09-20',updatedAt:'2026-09-20'};
const buyer = {id:'buyer',name:'Nabywca dokumentu testowego z nazwa przekraczajaca pojedynczy wiersz',nip:'5250001003',address:{street:'Testowa 999',postal:'00-002',city:'Warszawa',country:'PL'}};
if (require.main === module) {
  const target=path.resolve(process.argv[2] || 'tmp/pdfs/layout-fixture.pdf');
  fs.mkdirSync(path.dirname(target),{recursive:true});
  generateInvoicePdfBuffer(invoice,buyer,company).then(buffer=>{fs.writeFileSync(target,buffer);console.log(target);}).catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={invoice,company,buyer};
