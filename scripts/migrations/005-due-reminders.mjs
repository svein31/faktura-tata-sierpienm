export const id = '005-due-reminders';
const definitions = [
 ['DueReminderSetting',{invoiceId:1},'DueReminderSetting_invoiceId_key',true],
 ['DueReminderSetting',{companyId:1},'DueReminderSetting_companyId_idx',false],
 ['DueReminderDelivery',{eventKey:1},'DueReminderDelivery_eventKey_key',true],
 ['DueReminderDelivery',{companyId:1},'DueReminderDelivery_companyId_idx',false],
 ['DueReminderDelivery',{status:1,createdAt:1},'DueReminderDelivery_status_createdAt_idx',false],
];
export async function plan(db) {
  const indexes = [];
  for (const [collection,key,name,unique] of definitions) {
    let current=[]; try {current=await db.collection(collection).listIndexes().toArray();} catch(e) {if(e.code!==26) throw e;}
    if (!current.some(i=>JSON.stringify(i.key)===JSON.stringify(key) && Boolean(i.unique)===unique)) indexes.push({collection,key,name,unique});
  }
  return {indexes};
}
export async function up(db, checkpoint) { for (const i of checkpoint.indexes) await db.collection(i.collection).createIndex(i.key,{name:i.name,unique:i.unique}); }
export async function down(db, checkpoint) { for (const i of checkpoint.indexes) {try {await db.collection(i.collection).dropIndex(i.name);}catch(e){if(![26,27].includes(e.code))throw e;}} }
