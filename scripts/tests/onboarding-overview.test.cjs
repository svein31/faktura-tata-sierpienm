const test = require('node:test');
const assert = require('node:assert/strict');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { MongoClient, ObjectId, BSON } = require('mongodb');
require('../register-ts.cjs');
const { overviewPipeline } = require('../../src/lib/overview-aggregate.ts');

// Execute the real Mongo aggregation: purchases must not mark the first sales
// document as ready, and company B must never supply company A's preview link.
test('overview onboarding selects only a saved sales document from the authorized company', { timeout: 60000 }, async t => {
  const mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', ...(process.platform !== 'win32' ? { args: ['--nounixsocket'] } : {}) } });
  const client = new MongoClient(mongo.getUri());
  t.after(async () => { await client.close(); await mongo.stop(); });
  await client.connect();
  const collection = client.db('onboarding-isolated').collection('Invoice');
  const companyA = new ObjectId('a'.repeat(24));
  const companyB = new ObjectId('b'.repeat(24));
  const oid = number => new ObjectId(number.toString(16).padStart(24, '0'));
  const invoice = (number, patch = {}) => ({
    _id: oid(number), sellerCompanyId: companyA, type: 'sale', status: 'draft', documentStatus: 'draft',
    number: `FV/${number}`, currency: 'PLN', issueDate: '2026-10-18', dueDate: '2026-10-25',
    lines: [{ quantity: 1, netPrice: 100, vatRate: '23' }], ...patch,
  });
  await collection.insertMany([
    invoice(1),
    invoice(2, { status: 'issued', documentStatus: 'issued' }),
    invoice(3, { type: 'purchase' }),
    invoice(4, { isProforma: true }),
    invoice(5, { isCorrection: true }),
    invoice(6, { status: 'cancelled' }),
    invoice(7, { documentStatus: 'cancelled' }),
    invoice(8, { sellerCompanyId: companyB }),
    invoice(9, { sellerCompanyId: null }),
  ]);
  const read = async companyId => (await collection.aggregate(BSON.EJSON.deserialize(overviewPipeline(companyId.toHexString(), '2026-10-18', ['2026-10']))).toArray())[0];
  const resultA = await read(companyA);
  assert.deepEqual(resultA.onboarding, [{ id: oid(2).toHexString(), number: 'FV/2' }]);
  assert.ok(resultA.recent.some(row => row.id === oid(5).toHexString()), 'the new facet does not change the recent-documents list');
  assert.deepEqual((await read(companyB)).onboarding, [{ id: oid(8).toHexString(), number: 'FV/8' }]);

  await collection.deleteMany({ _id: { $in: [oid(1), oid(2)] } });
  assert.deepEqual((await read(companyA)).onboarding, [], 'purchases, proformas, corrections and canceled documents cannot complete the sales step');

  await collection.insertOne(invoice(10));
  assert.deepEqual((await read(companyA)).onboarding, [{ id: oid(10).toHexString(), number: 'FV/10' }], 'legacy missing false flags and a saved draft remain valid');
});
