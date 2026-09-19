// Indexes only: legacy records are never reassigned to a guessed company.
export const id = '007-document-workspace';
const definitions = [
 ['Offer',{companyId:1,createdAt:1},'Offer_companyId_createdAt_idx'],
 ['Order',{companyId:1,createdAt:1},'Order_companyId_createdAt_idx'],
 ['Expense',{companyId:1,issueDate:1},'Expense_companyId_issueDate_idx'],
 ['ExpenseScan',{companyId:1,createdAt:1},'ExpenseScan_companyId_createdAt_idx'],
];
export async function plan(db) {
  const indexes=[];
  for(const [collection,key,name] of definitions){
    let current=[];try{current=await db.collection(collection).listIndexes().toArray();}catch(e){if(e.code!==26)throw e;}
    if(!current.some(i=>JSON.stringify(i.key)===JSON.stringify(key)))indexes.push({collection,key,name});
  }
  return {indexes};
}
export async function up(db, checkpoint){for(const i of checkpoint.indexes)await db.collection(i.collection).createIndex(i.key,{name:i.name});}
export async function down(db, checkpoint){for(const i of checkpoint.indexes){try{await db.collection(i.collection).dropIndex(i.name);}catch(e){if(![26,27].includes(e.code))throw e;}}}
