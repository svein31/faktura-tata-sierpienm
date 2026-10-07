import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('./register-ts.cjs');
const { resetPasswordWithToken } = require('../src/lib/password-reset.ts');
const { deleteUserAccount } = require('../src/lib/account-deletion.ts');

/** Runs only against the isolated database supplied by the integration harness. */
export async function checkPasswordResetAtomic(db) {
  const user = await db.user.create({ data: {
    email: `reset-concurrency-${randomBytes(8).toString('hex')}@example.test`, password: 'original-password-hash',
  } });
  try {
    const tokenHash = randomBytes(32).toString('hex');
    const token = await db.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 3600000) } });
    const otherToken = await db.passwordResetToken.create({ data: { userId: user.id, tokenHash: randomBytes(32).toString('hex'), usedAt: null, expiresAt: new Date(Date.now() + 3600000) } });
    assert.equal(await db.passwordResetToken.count({ where: { id: token.id, usedAt: { isSet: false } } }), 1, 'The normal forgot-password token omits usedAt');
    assert.equal(await db.passwordResetToken.count({ where: { id: otherToken.id, usedAt: null } }), 1, 'Explicit null tokens must also be supported');
    await db.session.create({ data: { userId: user.id, sessionToken: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 3600000) } });
    const results = await Promise.allSettled([0, 1, 2, 3].map(index => resetPasswordWithToken(tokenHash, `new-password-hash-${index}`, db)));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1, 'A reset link must have exactly one concurrent winner');
    for (const result of results.filter(result => result.status === 'rejected')) {
      assert.equal(result.reason.code, 'INVALID_OR_EXPIRED_TOKEN', 'Concurrent losers must see a consumed link');
    }
    const winner = results.findIndex(result => result.status === 'fulfilled');
    assert.equal((await db.user.findUnique({ where: { id: user.id } })).password, `new-password-hash-${winner}`);
    assert.ok((await db.passwordResetToken.findUnique({ where: { id: token.id } })).usedAt);
    assert.ok((await db.passwordResetToken.findUnique({ where: { id: otherToken.id } })).usedAt);
    assert.equal(await db.session.count({ where: { userId: user.id } }), 0);

    const rollbackHash = randomBytes(32).toString('hex');
    const rollbackToken = await db.passwordResetToken.create({ data: { userId: user.id, tokenHash: rollbackHash, usedAt: null, expiresAt: new Date(Date.now() + 3600000) } });
    await db.session.create({ data: { userId: user.id, sessionToken: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 3600000) } });
    const faultingDb = {
      $transaction: callback => db.$transaction(tx => callback(new Proxy(tx, {
        get(target, key) {
          if (key === 'session') return { deleteMany: async () => { throw new Error('Injected session revocation failure'); } };
          return target[key];
        },
      }))),
    };
    await assert.rejects(resetPasswordWithToken(rollbackHash, 'must-not-commit', faultingDb), /Injected session revocation failure/);
    assert.equal((await db.user.findUnique({ where: { id: user.id } })).password, `new-password-hash-${winner}`, 'Password must roll back together with the token');
    assert.equal((await db.passwordResetToken.findUnique({ where: { id: rollbackToken.id } })).usedAt, null);
    assert.equal(await db.session.count({ where: { userId: user.id } }), 1);
    await resetPasswordWithToken(rollbackHash, 'retry-after-rollback', db);
    assert.equal((await db.user.findUnique({ where: { id: user.id } })).password, 'retry-after-rollback');
    assert.equal(await db.session.count({ where: { userId: user.id } }), 0);
    console.log('[integration] PASS password reset is single-use under concurrency and rolls back password/token/sessions together');
  } finally {
    await db.user.delete({ where: { id: user.id } });
  }
}

/** Personal snapshots and all owned-company audit entries are deleted atomically with the user. */
export async function checkAccountDeletionAtomic(db) {
  const prefix = randomBytes(8).toString('hex');
  const owner = await db.user.create({ data: { email: `delete-owner-${prefix}@example.test`, password: 'fixture-hash' } });
  const other = await db.user.create({ data: { email: `delete-other-${prefix}@example.test`, password: 'fixture-hash' } });
  const allAuditIds = [];
  try {
    const ownedCompany = await db.companyProfile.create({ data: { userId: owner.id, nip: '5260301706', companyName: 'Owned deletion fixture' } });
    const unrelatedCompany = await db.companyProfile.create({ data: { userId: other.id, nip: '5260301706', companyName: 'Preserved independent company' } });
    const createAudit = async data => {
      const audit = await db.auditLog.create({ data: {
        action: 'account_deletion_fixture', entityType: 'company', entityId: 'fixture',
        userName: 'Personal snapshot', userEmail: 'personal-snapshot@example.test',
        description: 'Personal information in audit history',
        diff: { address: { old: 'old private address', new: 'new private address' } }, ...data,
      } });
      allAuditIds.push(audit.id);
      return audit;
    };
    const ownAudit = await createAudit({ userId: owner.id, companyId: ownedCompany.id });
    const actorAudit = await createAudit({ userId: other.id, companyId: ownedCompany.id });
    const systemAudit = await createAudit({ userId: null, companyId: ownedCompany.id });
    const ownCrossCompanyAudit = await createAudit({ userId: owner.id, companyId: unrelatedCompany.id });
    const unrelatedAudit = await createAudit({ userId: other.id, companyId: unrelatedCompany.id });
    const faultingDb = {
      $transaction: (callback, options) => db.$transaction(tx => callback(new Proxy(tx, {
        get(target, key) {
          if (key === 'user') return { delete: async () => { throw new Error('Injected account deletion failure'); } };
          return target[key];
        },
      })), options),
    };
    await assert.rejects(deleteUserAccount(owner.id, faultingDb), /Injected account deletion failure/);
    assert.ok(await db.user.findUnique({ where: { id: owner.id } }), 'Failed deletion must retain the user');
    assert.equal(await db.auditLog.count({ where: { id: { in: allAuditIds } } }), allAuditIds.length, 'Failed deletion must restore audit entries');
    assert.ok(await db.companyProfile.findUnique({ where: { id: ownedCompany.id } }));

    await deleteUserAccount(owner.id, db);
    assert.equal(await db.user.findUnique({ where: { id: owner.id } }), null);
    assert.equal(await db.companyProfile.findUnique({ where: { id: ownedCompany.id } }), null);
    for (const audit of [ownAudit, actorAudit, systemAudit, ownCrossCompanyAudit]) {
      assert.equal(await db.auditLog.findUnique({ where: { id: audit.id } }), null, 'Personal and owned-company audit snapshots must be removed');
    }
    assert.deepEqual(await db.auditLog.findUnique({ where: { id: unrelatedAudit.id } }), unrelatedAudit, 'Other owners retain their independent audit history');
    assert.ok(await db.user.findUnique({ where: { id: other.id } }));
    assert.ok(await db.companyProfile.findUnique({ where: { id: unrelatedCompany.id } }));
    console.log('[integration] PASS account deletion removes personal/owned-company audit snapshots, preserves unrelated history and rolls back all data on failure');
  } finally {
    await db.auditLog.deleteMany({ where: { id: { in: allAuditIds } } });
    for (const user of [owner, other]) {
      if (await db.user.findUnique({ where: { id: user.id } })) await db.user.delete({ where: { id: user.id } });
    }
  }
}
