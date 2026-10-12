import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { ObjectId } from 'mongodb';

const require = createRequire(import.meta.url);
require('./register-ts.cjs');
const { readApiIdentity } = require('../src/lib/api-session-identity.ts');
const { sessionTokenHash } = require('../src/lib/session-token.ts');

/** Native BSON/authentication regression; only synthetic loopback fixtures. */
export async function checkApiSessionIdentity(db, { rawDb } = {}) {
  assert.ok(rawDb?.client?.options.hosts?.length && rawDb.client.options.hosts.every(address => ['127.0.0.1', 'localhost', '::1'].includes(address.host)), 'API identity regression requires an isolated loopback-only native database');
  const marker = randomBytes(8).toString('hex'), now = new Date();
  const userId = new ObjectId(), sessionIds = [], checks = [], capturedCommands = [], dateEncodings = new Set();
  const secrets = ['SYNTHETIC_PASSWORD_MUST_NOT_TRANSFER', 'SYNTHETIC_MFA_SECRET_MUST_NOT_TRANSFER', 'SYNTHETIC_KSEF_SECRET_MUST_NOT_TRANSFER'];
  const user = { _id: userId, email: `api-identity-${marker}@example.invalid`, name: 'Synthetic identity Żółć', password: secrets[0], createdAt: now, updatedAt: now, integrationCredential: secrets[2] };
  let aggregateReads = 0, deletionAttempts = 0, validBearerReads = 0;
  const measured = { session: {
    aggregateRaw: async args => {
      aggregateReads++; capturedCommands.push(args);
      const rows = await db.session.aggregateRaw(args);
      const serialized = JSON.stringify(rows);
      for (const secret of secrets) assert.equal(serialized.includes(secret), false, 'Credential content must be excluded by Mongo before transfer');
      for (const row of rows) {
        for (const value of [row.expiresAt, row.mfaVerifiedAt, row.mfaEnabledAt]) if (value?.$date != null) {
          dateEncodings.add(typeof value.$date === 'string' ? 'relaxed BSON date string' : 'canonical BSON $numberLong date');
        }
        if (row.user) assert.deepEqual(Object.keys(row.user).sort(), ['email', 'id', 'name'], 'Wire identity must contain only id/name/email');
        const allowed = new Set(['expiresAt', 'mfaEnabledAt', 'mfaVerifiedAt', 'sessionId', 'user']);
        assert.ok(Object.keys(row).every(key => allowed.has(key)), 'Session projection must omit bearer hashes and unrelated account fields');
      }
      return rows;
    },
    delete: args => { deletionAttempts++; return db.session.delete(args); },
  } };
  const createSession = async (changes = {}) => {
    const token = randomBytes(32).toString('base64url'), id = new ObjectId(); sessionIds.push(id);
    await rawDb.collection('Session').insertOne({ _id: id, userId, sessionToken: sessionTokenHash(token), expiresAt: new Date(Date.now() + 3600000), createdAt: now, updatedAt: now, ...changes });
    return { token, id };
  };
  const read = async token => {
    const before = aggregateReads, value = await readApiIdentity(measured, token);
    assert.equal(aggregateReads - before, 1, 'Every valid bearer read must use one Session aggregate command');
    validBearerReads++; return value;
  };
  const expectedUser = { id: userId.toHexString(), name: user.name, email: user.email };
  try {
    await rawDb.collection('User').insertOne(user);
    // The records exist to prove the fast identity read does not load or return
    // company/integration relations. They are never actual provider credentials.
    await rawDb.collection('KsefSettings').insertOne({ _id: new ObjectId(), userId, tokenMask: secrets[2], tokenSet: true });
    await rawDb.collection('CompanySettings').insertOne({ _id: new ObjectId(), userId, name: 'Synthetic unrelated company settings' });

    const invalid = ['', '<script>', 'x'.repeat(42), 'x'.repeat(44), 'x'.repeat(10000), sessionTokenHash('a'.repeat(43))];
    const beforeInvalid = aggregateReads;
    for (const token of invalid) assert.deepEqual(await readApiIdentity(measured, token), { state: 'denied' });
    assert.equal(aggregateReads, beforeInvalid, 'Malformed bearer and stored digest must be rejected before any DB operation');
    checks.push('Six malformed bearer/digest inputs are denied before database work');

    assert.deepEqual(await read(randomBytes(32).toString('base64url')), { state: 'missing' });
    checks.push('An absent hashed session alone is classified missing for the separate legacy-upgrade path');

    const live = await createSession();
    assert.deepEqual(await read(live.token), { state: 'live', user: expectedUser });
    checks.push('Live hashed session returns the exact minimal identity from real BSON dates and indexed joins');

    await rawDb.collection('User').updateOne({ _id: userId }, { $set: { email: `api-updated-${marker}@example.invalid`, name: 'Updated Żółć' } });
    assert.deepEqual(await read(live.token), { state: 'live', user: { ...expectedUser, name: 'Updated Żółć', email: `api-updated-${marker}@example.invalid` } });
    await rawDb.collection('User').updateOne({ _id: userId }, { $set: { email: user.email, name: user.name } });
    checks.push('Changed user identity is observed on the next read without process-level account caching');

    const revoked = await createSession();
    assert.equal((await read(revoked.token)).state, 'live');
    await rawDb.collection('Session').deleteOne({ _id: revoked.id });
    assert.deepEqual(await read(revoked.token), { state: 'missing' });
    checks.push('Revocation immediately removes a previously accepted session on the next database read');

    const expired = await createSession({ expiresAt: new Date(Date.now() - 10000) }), beforeExpiry = deletionAttempts;
    assert.deepEqual(await read(expired.token), { state: 'denied' });
    assert.equal(deletionAttempts - beforeExpiry, 1);
    assert.equal(await rawDb.collection('Session').countDocuments({ _id: expired.id }), 0, 'An expired synthetic session is actually deleted');
    assert.deepEqual(await read(expired.token), { state: 'missing' });
    checks.push('Expired BSON session is denied and removed; it never remains a live cached identity');

    const malformedExpiry = await createSession({ expiresAt: 'not-a-BSON-date' });
    assert.deepEqual(await read(malformedExpiry.token), { state: 'denied' });
    checks.push('Malformed stored expiry fails closed instead of bypassing expiration');

    const enabledAt = new Date('2026-10-09T12:34:56.789Z');
    await rawDb.collection('UserMfa').insertOne({ _id: new ObjectId(), userId, encryptedSecret: secrets[1], enabledAt: null });
    assert.equal((await read(live.token)).state, 'live');
    await rawDb.collection('UserMfa').updateOne({ userId }, { $unset: { enabledAt: '' } });
    assert.equal((await read(live.token)).state, 'live');
    checks.push('Disabled MFA with explicit null or a missing legacy enabledAt preserves normal session access');

    await rawDb.collection('UserMfa').updateOne({ userId }, { $set: { enabledAt } });
    assert.deepEqual(await read(live.token), { state: 'denied' });
    checks.push('Enabling MFA immediately denies a session with no verification proof');

    await rawDb.collection('Session').updateOne({ _id: live.id }, { $set: { mfaVerifiedAt: new Date(enabledAt.getTime() - 1) } });
    assert.deepEqual(await read(live.token), { state: 'denied' });
    checks.push('A verification timestamp one millisecond older than enabledAt is insufficient');

    await rawDb.collection('Session').updateOne({ _id: live.id }, { $set: { mfaVerifiedAt: enabledAt } });
    assert.deepEqual(await read(live.token), { state: 'live', user: expectedUser });
    checks.push('Exact BSON millisecond MFA verification accepts the current session');

    await rawDb.collection('UserMfa').updateOne({ userId }, { $set: { enabledAt: new Date(enabledAt.getTime() + 1) } });
    assert.deepEqual(await read(live.token), { state: 'denied' });
    checks.push('Rotating the MFA enabledAt immediately rejects a formerly accepted verification');

    await rawDb.collection('UserMfa').updateOne({ userId }, { $set: { enabledAt: null } });
    assert.equal((await read(live.token)).state, 'live');
    checks.push('Disabling MFA is read live and does not depend on cached security-policy state');

    await rawDb.collection('UserMfa').updateOne({ userId }, { $set: { enabledAt: 'invalid-MFA-date' } });
    assert.deepEqual(await read(live.token), { state: 'denied' });
    await rawDb.collection('UserMfa').updateOne({ userId }, { $set: { enabledAt } });
    await rawDb.collection('Session').updateOne({ _id: live.id }, { $set: { mfaVerifiedAt: 'invalid-proof-date' } });
    assert.deepEqual(await read(live.token), { state: 'denied' });
    await rawDb.collection('UserMfa').updateOne({ userId }, { $set: { enabledAt: null } });
    checks.push('Malformed stored MFA enablement or proof dates fail closed');

    const orphan = await createSession({ userId: new ObjectId() });
    assert.deepEqual(await read(orphan.token), { state: 'denied' }, 'Existing hashed session with a missing user must not be mistaken for absent hashed session');
    checks.push('Orphaned hashed session is denied without becoming eligible for legacy fallback');

    await rawDb.collection('User').updateOne({ _id: userId }, { $set: { name: ['malformed-name'] } });
    assert.deepEqual(await read(live.token), { state: 'denied' });
    await rawDb.collection('User').updateOne({ _id: userId }, { $set: { name: user.name, email: { malformed: true } } });
    assert.deepEqual(await read(live.token), { state: 'denied' });
    await rawDb.collection('User').updateOne({ _id: userId }, { $set: { email: user.email }, $unset: { name: '' } });
    assert.deepEqual(await read(live.token), { state: 'live', user: { ...expectedUser, name: '' } });
    await rawDb.collection('User').updateOne({ _id: userId }, { $set: { name: null } });
    assert.deepEqual(await read(live.token), { state: 'live', user: { ...expectedUser, name: '' } });
    await rawDb.collection('User').updateOne({ _id: userId }, { $set: { name: user.name } });
    checks.push('Malformed user fields fail closed; nullable or missing legacy name keeps the established empty-name fallback');

    assert.equal(aggregateReads, validBearerReads);
    const command = capturedCommands[2];
    const explain = await rawDb.collection('Session').aggregate(command.pipeline).explain('executionStats');
    const initial = explain.stages.find(stage => stage.$cursor)?.$cursor || explain;
    const lookupPlans = explain.stages.filter(stage => stage.$lookup).map(stage => ({ collection: stage.$lookup.from, indexesUsed: stage.indexesUsed, documentsExamined: stage.totalDocsExamined, keysExamined: stage.totalKeysExamined }));
    assert.ok(JSON.stringify(initial.queryPlanner.winningPlan).includes('Session_sessionToken_key'), 'Session match must use its unique bearer-hash index');
    assert.ok(initial.executionStats.totalDocsExamined <= 1, 'Session identity must not scan unrelated users sessions');
    for (const [collection, index] of [['User', '_id_'], ['UserMfa', 'UserMfa_userId_key']]) {
      const plan = lookupPlans.find(value => value.collection === collection);
      assert.ok(plan.indexesUsed.includes(index), `${collection} lookup must use ${index}`);
      assert.ok(plan.documentsExamined <= 1, `${collection} lookup must examine at most one record`);
    }
    checks.push('Real execution plans use the unique sessionToken, User _id and UserMfa userId indexes, each examining at most one record');
    const result = { passed: true, caseCount: checks.length, checks, malformedBearerInputs: invalid.length, validBearerReads, aggregateReads, deletionAttempts, bsonDateEncodings: [...dateEncodings], projection: { identity: ['id', 'email', 'name'], integrationAndPasswordCredentialsTransferred: false }, queryPlan: { session: { documentsExamined: initial.executionStats.totalDocsExamined, keysExamined: initial.executionStats.totalKeysExamined }, lookups: lookupPlans } };
    console.log(`[integration] PASS ${result.caseCount} native API identity cases; ${aggregateReads} one-command valid-bearer reads; live revocation/expiry/MFA/rotation/orphan handling; indexed joins and minimal credential-free projection`);
    return result;
  } finally {
    // Only explicit synthetic IDs/userId from this invocation are removed.
    await rawDb.collection('Session').deleteMany({ _id: { $in: sessionIds } });
    for (const collection of ['UserMfa', 'KsefSettings', 'CompanySettings']) await rawDb.collection(collection).deleteMany({ userId });
    await rawDb.collection('User').deleteOne({ _id: userId });
  }
}
