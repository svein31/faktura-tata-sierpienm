import { ObjectId } from 'mongodb';
export const id = '001-company-catalog';
const collections = ['Contractor', 'Product'];
export async function plan(db) {
  const companies = await db.collection('CompanyProfile').find({}, { projection: { userId: 1 } }).toArray();
  const owners = new Map();
  for (const company of companies) {
    const key = String(company.userId);
    owners.set(key, [...(owners.get(key) || []), company._id]);
  }
  const records = [], indexes = [];
  for (const collection of collections) {
    let existing = [];
    try { existing = await db.collection(collection).listIndexes().toArray(); } catch (e) { if (e.code !== 26) throw e; }
    if (!existing.some(i => i.key.companyId === 1 && Object.keys(i.key).length === 1)) indexes.push(collection);
    for await (const record of db.collection(collection).find({ companyId: null }, { projection: { userId: 1, companyId: 1 } })) {
      const owned = owners.get(String(record.userId)) || [];
      if (owned.length !== 1) continue;
      if (collection === 'Contractor' && await db.collection('Invoice').countDocuments({ contractorId: record._id, sellerCompanyId: { $nin: [owned[0], null] } })) continue;
      records.push({ collection, id: String(record._id), companyId: String(owned[0]), wasNull: Object.hasOwn(record, 'companyId') });
      // Keep the durable checkpoint below MongoDB's document limit. No mutation has run yet.
      if (records.length > 20000) throw new Error('Catalog migration exceeds 20,000 records: split the data migration before applying it.');
    }
  }
  return { records, indexes };
}
export async function up(db, checkpoint) {
  for (const collection of checkpoint.indexes) await db.collection(collection).createIndex({ companyId: 1 }, { name: `${collection}_companyId_idx` });
  for (const record of checkpoint.records) await db.collection(record.collection).updateOne(
    { _id: new ObjectId(record.id), companyId: record.wasNull ? { $type: 'null' } : { $exists: false } },
    { $set: { companyId: new ObjectId(record.companyId) } },
  );
}
export async function down(db, checkpoint) {
  for (const record of checkpoint.records) await db.collection(record.collection).updateOne(
    { _id: new ObjectId(record.id), companyId: new ObjectId(record.companyId) },
    record.wasNull ? { $set: { companyId: null } } : { $unset: { companyId: '' } },
  );
  for (const collection of checkpoint.indexes) {
    try { await db.collection(collection).dropIndex(`${collection}_companyId_idx`); } catch (e) { if (![26, 27].includes(e.code)) throw e; }
  }
}
