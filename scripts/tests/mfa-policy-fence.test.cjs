const test = require('node:test');
const assert = require('node:assert/strict');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { MongoClient } = require('mongodb');
const { PrismaClient } = require('@prisma/client');

test('Native MFA policy fence prevents same-millisecond policy/disable races in both orders', { timeout: 90000 }, async () => {
  // Always create a fresh loopback replica set; inherited database URLs are never used.
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, instanceOpts: process.platform !== 'win32' ? [{ args: ['--nounixsocket'] }] : [] });
  const uri = mongo.getUri('mfa_policy_fence'), client = new MongoClient(uri), db = new PrismaClient({ datasources: { db: { url: uri } } });
  try {
    await client.connect();
    const { checkMfaPolicyFence } = await import('../mfa-policy-fence-regression.mjs');
    const result = await checkMfaPolicyFence({ db, mongoDb: client.db('mfa_policy_fence') });
    assert.equal(result.status, 'passed'); assert.equal(result.cases, 6);
    assert.equal(result.externalProviders, false);
    console.log('[mfa-policy-fence-evidence] ' + JSON.stringify(result));
  } finally {
    await db.$disconnect(); await client.close(); await mongo.stop();
  }
});
