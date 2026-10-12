require('../register-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { getSession, getApiSessionUser } = require('../../src/lib/auth.ts');
const { prisma } = require('../../src/lib/prisma.ts');
const { sessionTokenHash } = require('../../src/lib/session-token.ts');

test('lean API identity retains live revocation, MFA, expiry and legacy upgrade without integration reads', async () => {
  const token = 'a'.repeat(43), sessionId = 'b'.repeat(24);
  const originalAggregate = prisma.session.aggregateRaw;
  const originalFind = prisma.session.findUnique;
  const originalUpdate = prisma.session.updateMany;
  const originalDelete = prisma.session.delete;
  const queries = [], commands = [], writes = [], deleted = [];
  let live = true, legacy = false, mfa = null, verified = null, expires = Date.now() + 60000;
  prisma.session.aggregateRaw = async args => {
    commands.push(args);
    if (!live || legacy) return [];
    return [{ sessionId, expiresAt: { $date: new Date(expires).toISOString() },
      mfaVerifiedAt: verified ? { $date: verified.toISOString() } : null,
      mfaEnabledAt: mfa ? { $date: mfa.toISOString() } : null,
      user: { id: 'c'.repeat(24), name: 'Test', email: 'test@example.invalid' } }];
  };
  prisma.session.findUnique = async args => {
    queries.push(args);
    if (!live || (legacy ? args.where.sessionToken !== token : args.where.sessionToken !== sessionTokenHash(token))) return null;
    return { id: sessionId, expiresAt: new Date(expires), mfaVerifiedAt: verified,
      user: { id: 'c'.repeat(24), name: 'Test', email: 'test@example.invalid', mfa: mfa ? { enabledAt: mfa } : null } };
  };
  prisma.session.updateMany = async args => { writes.push(args); legacy = false; return { count: live ? 1 : 0 }; };
  prisma.session.delete = async args => { deleted.push(args); return {}; };
  try {
    assert.equal((await getApiSessionUser(token)).id, 'c'.repeat(24));
    assert.equal(commands.length, 1, 'A live identity needs one indexed command');
    assert.equal(queries.length, 0, 'No account/integration relation traversal');
    assert.deepEqual(commands[0].pipeline[0], { $match: { sessionToken: sessionTokenHash(token) } });
    assert.equal(JSON.stringify(commands[0]).includes('password'), false);
    await getSession(token);
    assert.equal(queries.at(-1).include.user.include.companyProfiles, true, 'Full account/layout contract remains available');
    live = false;
    assert.equal(await getApiSessionUser(token), null, 'A prior successful request cannot cache a revoked session');
    live = true; mfa = new Date('2026-10-09T12:00:00Z');
    assert.equal(await getApiSessionUser(token), null, 'Enabled MFA requires the session proof');
    verified = new Date(mfa.getTime() - 1);
    assert.equal(await getApiSessionUser(token), null, 'An old MFA proof is insufficient');
    verified = new Date(mfa.getTime());
    assert.ok(await getApiSessionUser(token));
    expires = Date.now() - 1;
    assert.equal(await getApiSessionUser(token), null);
    assert.deepEqual(deleted, [{ where: { id: sessionId } }]);
    expires = Date.now() + 60000; legacy = true;
    assert.ok(await getApiSessionUser(token));
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0].where, { id: sessionId, sessionToken: token });
    assert.equal(writes[0].data.sessionToken, sessionTokenHash(token));
    const count = commands.length;
    for (const invalid of ['', '<script>', 'x'.repeat(10000)]) assert.equal(await getApiSessionUser(invalid), null);
    assert.equal(commands.length, count, 'Malformed bearer input is rejected before database work');
    prisma.session.aggregateRaw = async () => { throw new Error('unavailable'); };
    assert.equal(await getApiSessionUser(token), null, 'Database errors fail closed');
  } finally {
    prisma.session.aggregateRaw = originalAggregate;
    prisma.session.findUnique = originalFind;
    prisma.session.updateMany = originalUpdate;
    prisma.session.delete = originalDelete;
  }
});
