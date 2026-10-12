import assert from 'node:assert/strict';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { PrismaClient } from '@prisma/client';
import { checkCompanyAccessRead } from './company-access-read-regression.mjs';

// Always create a fresh loopback replica set; never read an inherited URL.
const mongo = await MongoMemoryReplSet.create({
  replSet: { count: 1 },
  instanceOpts: process.platform === 'win32' ? [] : [{ args: ['--nounixsocket'] }],
});
const databaseUrl = mongo.getUri('company_access_native');
const client = new MongoClient(databaseUrl);
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
try {
  await client.connect();
  const mongoDb = client.db('company_access_native');
  await mongoDb.collection('CompanyMember').createIndex({ companyId: 1, userId: 1 }, { name: 'CompanyMember_companyId_userId_key', unique: true });
  await mongoDb.collection('UserMfa').createIndex({ userId: 1 }, { name: 'UserMfa_userId_key', unique: true });
  const result = await checkCompanyAccessRead({ db, mongoDb });
  assert.equal(result.status, 'passed');
  console.log(JSON.stringify(result, null, 2));
} finally {
  await db.$disconnect();
  await client.close();
  await mongo.stop();
}
