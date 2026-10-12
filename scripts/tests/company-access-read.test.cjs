require('../register-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { prisma } = require('../../src/lib/prisma.ts');
const { readCompanyAccess, companyAccessPipeline } = require('../../src/lib/company-access-read.ts');
const { getCompanyMembership, requireCompanyAccess } = require('../../src/lib/permissions.ts');
const { companyAccess } = require('../../src/lib/company-write.ts');
const { DEFAULT_ROLE_PERMISSIONS } = require('../../src/lib/role-permissions.ts');

const userId = 'a'.repeat(24), companyId = 'b'.repeat(24), memberId = 'c'.repeat(24);
const keys = Object.keys(DEFAULT_ROLE_PERMISSIONS.owner);
const company = { id: companyId, userId, companyName: 'Fixture', nip: '1234567890' };
const schemaFlags = Object.fromEntries(keys.map(key => [key, key === 'canIssueInvoices']));

test('company membership and transactional access retain fresh permissions, MFA precedence and owner fallback', async () => {
  const originalAggregate = prisma.companyProfile.aggregateRaw;
  const originalCreate = prisma.companyMember.create;
  const originalMemberFind = prisma.companyMember.findUnique;
  const originalPolicyFind = prisma.companySecurityPolicy.findUnique;
  const originalMfaFind = prisma.userMfa.findUnique;
  let row = { company, members: [{ id: memberId, role: 'viewer', ...schemaFlags }], policies: [], mfaEnabled: false };
  const reads = [], writes = [];
  let createError = false;
  let racedMember = null;
  prisma.companyProfile.aggregateRaw = async args => { reads.push(args); return row ? [row] : []; };
  prisma.companyMember.create = async args => {
    writes.push(args);
    if (createError) {
      if (racedMember) row.members = [racedMember];
      throw Object.assign(new Error('duplicate membership'), { code: 'P2002' });
    }
    return { id: memberId };
  };
  const unexpectedQuery = async () => { throw new Error('additional permission/MFA query'); };
  prisma.companyMember.findUnique = unexpectedQuery;
  prisma.companySecurityPolicy.findUnique = unexpectedQuery;
  prisma.userMfa.findUnique = unexpectedQuery;
  try {
    let membership = await getCompanyMembership(userId, companyId);
    assert.equal(membership.role, 'viewer', 'Explicit membership overrides the profile creator role');
    assert.deepEqual(membership.permissions, schemaFlags, 'Missing values use Prisma schema defaults, including viewer invoice issuance');
    assert.equal(membership.memberId, memberId);
    assert.equal(reads.length, 1);
    assert.equal(writes.length, 0);
    await assert.rejects(companyAccess(prisma, userId, companyId, 'canManageTeam'), /Brak uprawnienia/);

    row.members[0].role = 'owner';
    for (const key of keys) row.members[0][key] = false;
    membership = await getCompanyMembership(userId, companyId);
    assert.deepEqual(membership.permissions, DEFAULT_ROLE_PERMISSIONS.owner, 'Owner membership always has all permissions');
    await companyAccess(prisma, userId, companyId, 'canManageTeam');

    row.members[0].role = 'viewer';
    assert.equal((await requireCompanyAccess(userId, companyId, 'canManageTeam')).code, 'FORBIDDEN_INSUFFICIENT_PERMISSIONS', 'A revoked permission takes effect on the next call');
    row.policies = [{ requireMfa: true }];
    await assert.rejects(getCompanyMembership(userId, companyId), error => error.code === 'COMPANY_MFA_REQUIRED');
    await assert.rejects(companyAccess(prisma, userId, companyId, 'canManageTeam'), error => error.code !== 'COMPANY_MFA_REQUIRED' && /Brak uprawnienia/.test(error.message), 'Write access checks permission before MFA');
    row.members[0].role = 'unrecognized';
    await assert.rejects(getCompanyMembership(userId, companyId), error => error.code === 'COMPANY_MFA_REQUIRED', 'Membership checks MFA before rejecting an unknown role');
    await assert.rejects(companyAccess(prisma, userId, companyId), error => error.code !== 'COMPANY_MFA_REQUIRED' && /Brak dostępu/.test(error.message));
    row.mfaEnabled = true;
    assert.equal(await getCompanyMembership(userId, companyId), null);
    row.members[0].role = '';
    await assert.rejects(companyAccess(prisma, userId, companyId), /Brak dostępu/, 'A corrupt member role cannot fall back to creator ownership');

    row.members = [];
    const writeOwner = await companyAccess(prisma, userId, companyId, 'canManageTeam');
    assert.deepEqual(writeOwner, { company: { id: companyId, userId }, role: 'owner' });
    assert.equal(writes.length, 0, 'Transactional access never auto-creates memberships');
    membership = await getCompanyMembership(userId, companyId);
    assert.equal(membership.memberId, memberId, 'The membership auto-create path returns the created member id');
    assert.equal(writes.length, 1);
    assert.equal(writes[0].data.role, 'owner');
    assert.equal(Object.hasOwn(writes[0].data, 'canManageIntegrations'), false, 'Auto-create payload keeps the established defaults');
    createError = true;
    membership = await getCompanyMembership(userId, companyId);
    assert.equal(membership.role, 'owner');
    assert.equal(Object.hasOwn(membership, 'memberId'), false, 'An unavailable create with no concurrent member retains owner fallback without member id');
    racedMember = { id: memberId, role: 'viewer', ...Object.fromEntries(keys.map(key => [key, false])) };
    membership = await getCompanyMembership(userId, companyId);
    assert.equal(membership.role, 'viewer', 'A concurrent downgraded membership overrides the profile creator during the same request');
    assert.equal(membership.memberId, memberId);
    assert.equal((await requireCompanyAccess(userId, companyId, 'canManageTeam')).ok, false, 'The next request uses the concurrent membership, without caching the owner result');

    row.company = { ...company, userId: 'd'.repeat(24) };
    row.members = [];
    const writeCount = writes.length;
    assert.equal(await getCompanyMembership(userId, companyId), null, 'A nonmember cannot use owner fallback');
    await assert.rejects(companyAccess(prisma, userId, companyId), /Brak dostępu/);
    assert.equal(writes.length, writeCount);
    row = null;
    assert.equal(await getCompanyMembership(userId, companyId), null);
    await assert.rejects(companyAccess(prisma, userId, companyId), /Brak dostępu/);
    const before = reads.length;
    assert.equal(await getCompanyMembership('', companyId), null);
    assert.equal(await getCompanyMembership(userId, 'malformed'), null);
    assert.equal((await requireCompanyAccess(userId, 'malformed')).code, 'INVALID_ID');
    await assert.rejects(companyAccess(prisma, userId, 'malformed'), error => error.status === 400);
    assert.equal(reads.length, before);
  } finally {
    prisma.companyProfile.aggregateRaw = originalAggregate;
    prisma.companyMember.create = originalCreate;
    prisma.companyMember.findUnique = originalMemberFind;
    prisma.companySecurityPolicy.findUnique = originalPolicyFind;
    prisma.userMfa.findUnique = originalMfaFind;
  }
});

test('raw access reader uses minimal indexed joins and rejects malformed permission fields', async () => {
  const pipeline = companyAccessPipeline(userId, companyId);
  assert.deepEqual(pipeline[0], { $match: { _id: { $oid: companyId } } });
  const lookups = pipeline.filter(stage => stage.$lookup).map(stage => stage.$lookup);
  assert.deepEqual(lookups.map(lookup => lookup.from), ['CompanyMember', 'CompanySecurityPolicy', 'UserMfa']);
  assert.deepEqual(lookups[0].pipeline[0].$match, { userId: { $oid: userId }, $expr: { $eq: ['$companyId', '$$companyId'] } });
  assert.equal(lookups[1].foreignField, '_id');
  assert.equal(lookups[2].pipeline[0].$match.$expr, '$$required', 'MFA lookup is gated by the company policy');
  assert.equal(/password|encryptedSecret|recoveryHashes|ksefToken|bankAccount/.test(JSON.stringify(pipeline)), false);

  let member = { id: memberId, role: 'admin' };
  let policy = [];
  let queries = 0;
  const db = { companyProfile: { aggregateRaw: async () => { queries++; return [{ company, members: [member], policies: policy, mfaEnabled: false }]; } } };
  assert.deepEqual((await readCompanyAccess(db, userId, companyId)).member.permissions, schemaFlags);
  for (const key of keys) {
    for (const value of [null, 'true', 1, [], {}]) {
      member = { id: memberId, role: 'owner', [key]: value };
      const result = await readCompanyAccess(db, userId, companyId);
      assert.equal(result.member.valid, false, `${key}=${JSON.stringify(value)} must never grant owner fallback`);
    }
  }
  member = { id: memberId, role: null };
  assert.equal((await readCompanyAccess(db, userId, companyId)).member.valid, false);
  member = { id: memberId };
  assert.equal((await readCompanyAccess(db, userId, companyId)).member.role, 'employee', 'Absent role uses the Prisma schema default');
  policy = [{ requireMfa: null }];
  assert.equal(await readCompanyAccess(db, userId, companyId), null, 'A corrupt required policy flag denies access');
  const before = queries;
  assert.equal(await readCompanyAccess(db, 'invalid', companyId), null);
  assert.equal(queries, before);
  db.companyProfile.aggregateRaw = async () => { throw new Error('database unavailable'); };
  await assert.rejects(readCompanyAccess(db, userId, companyId), /database unavailable/, 'Database errors cannot become a granted membership');
});
