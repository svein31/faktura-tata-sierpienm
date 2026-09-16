export const id = '004-integrations';
const definitions = [
  ['PublicApiKey', {tokenHash:1}, 'PublicApiKey_tokenHash_key', true],
  ['PublicApiKey', {companyId:1}, 'PublicApiKey_companyId_idx', false],
  ['StatusWebhook', {companyId:1}, 'StatusWebhook_companyId_idx', false],
  ['WebhookDelivery', {eventKey:1}, 'WebhookDelivery_eventKey_key', true],
  ['WebhookDelivery', {status:1,nextAttemptAt:1}, 'WebhookDelivery_status_nextAttemptAt_idx', false],
  ['WebhookDelivery', {webhookId:1}, 'WebhookDelivery_webhookId_idx', false],
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
