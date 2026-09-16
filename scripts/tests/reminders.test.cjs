require('../register-ts.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {dueReminderContent}=require('../../src/lib/reminder-content.ts');
const inv={number:'FV/1',type:'sale',status:'issued',currency:'PLN',dueDate:'2026-09-20',lines:[{quantity:1,netPrice:100,vatRate:'23'}],paidAmount:23};
test('reminders select current stage, skip closed/non-tax documents and preserve payments',()=>{
 assert.equal(dueReminderContent(inv,'2026-09-16','Seller'),null);
 assert.equal(dueReminderContent(inv,'2026-09-17','Seller').stage,'before');
 assert.equal(dueReminderContent(inv,'2026-09-20','Seller').stage,'due');
 assert.equal(dueReminderContent(inv,'2026-09-27','Seller').stage,'overdue');
 assert.equal(dueReminderContent(inv,'2026-09-27','Seller').remaining,100);
 for(const patch of [{isProforma:true},{isCorrection:true},{status:'draft'},{paymentStatus:'paid'},{paidAmount:123},{documentStatus:'cancelled'},{dueDate:'2026-02-30'}])assert.equal(dueReminderContent({...inv,...patch},'2026-09-27','Seller'),null);
 assert.equal(inv.paidAmount,23);
});
