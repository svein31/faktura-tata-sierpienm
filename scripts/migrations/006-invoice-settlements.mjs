export const id = '006-invoice-settlements';
const definitions = [
 ['InvoiceSettlement',{invoiceId:1},'InvoiceSettlement_invoiceId_key',true],
 ['InvoiceSettlement',{requestKey:1},'InvoiceSettlement_requestKey_key',true],
 ['InvoiceSettlement',{finalKey:1},'InvoiceSettlement_finalKey_key',true],
 ['InvoiceSettlement',{sourceId:1},'InvoiceSettlement_sourceId_idx',false],
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
