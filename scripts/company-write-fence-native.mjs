import assert from 'node:assert/strict';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { PrismaClient } from '@prisma/client';
import { checkCompanyWriteFence } from './company-write-fence-regression.mjs';

// No inherited database URL; all data belongs to a fresh loopback replica set.
const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, instanceOpts: process.platform === 'win32' ? [] : [{ args: ['--nounixsocket'] }] });
const databaseUrl = mongo.getUri('company_write_fence_native');
const client = new MongoClient(databaseUrl), db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
try {
  await client.connect();
  const mongoDb = client.db('company_write_fence_native');
  await mongoDb.collection('CompanyMember').createIndex({ companyId: 1, userId: 1 }, { unique: true });
  const result = await checkCompanyWriteFence({ db, mongoDb }); assert.equal(result.status, 'passed');
  console.log(JSON.stringify(result, null, 2));
} finally { await db.$disconnect(); await client.close(); await mongo.stop(); }
