require('../register-ts.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {buildEmailHtml}=require('../../src/lib/email/invoice-template.ts');
test('invoice emails preserve Polish text and line breaks while escaping all user-controlled HTML',()=>{
  const injected='<img src=x onerror=alert(1)>';
  const invoice={number:injected,issueDate:'2026-09-30',dueDate:'2026-10-14',currency:'PLN',lines:[{quantity:1,netPrice:100,vatRate:'23'}],ksef:{number:injected}};
  const html=buildEmailHtml('Zażółć gęślą jaźń\n'+injected,invoice,{companyName:injected,bankAccount:injected},{name:injected,nip:injected});
  assert.ok(html.includes('Zażółć gęślą jaźń<br/>'));assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes(injected));assert.ok(html.includes('123'));
});
