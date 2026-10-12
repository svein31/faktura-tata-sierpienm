require('../register-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { companyAccess, companyWriteAccess, fenceCompanyWrite } = require('../../src/lib/company-write.ts');

const userId = 'a'.repeat(24), companyId = 'b'.repeat(24), memberId = 'c'.repeat(24), ownerId = 'd'.repeat(24);
function accessRow(overrides = {}) {
  return {
    company: { id: companyId, userId: ownerId, companyName: 'Fixture', nip: '1234567890' },
    members: [{ id: memberId, role: 'employee', canIssueInvoices: true, canSendKsef: true }],
    policies: [],
    mfaEnabled: false,
    ...overrides,
  };
}
function transaction(row = accessRow(), writeError, updatedAt = new Date('2999-01-01T00:00:00.000Z')) {
  const reads = [], writes = [], events = [];
  const tx = {
    companyProfile: {
      async aggregateRaw(args) {
        assert.equal(this, tx.companyProfile, 'Access reads use the supplied transaction delegate');
        reads.push(args); events.push('read');
        return row ? [row] : [];
      },
      async update(args) {
        assert.equal(this, tx.companyProfile, 'The fence uses the same transaction delegate as the access read');
        writes.push(args); events.push('write');
        if (writeError) throw writeError;
        return { id: args.where.id };
      },
      async findUnique(args) {
        assert.equal(this, tx.companyProfile);
        assert.deepEqual(args, { where: { id: companyId }, select: { updatedAt: true } });
        events.push('timestamp');
        return { updatedAt };
      },
    },
  };
  return { tx, reads, writes, events };
}

test('companyAccess reads valid membership without taking a write fence', async () => {
  const fixture = transaction();
  const access = await companyAccess(fixture.tx, userId, companyId, 'canSendKsef');
  assert.deepEqual(access, { company: { id: companyId, userId: ownerId }, role: 'employee' });
  assert.equal(fixture.reads.length, 1);
  assert.deepEqual(fixture.writes, []);
  assert.deepEqual(fixture.events, ['read']);
});

test('companyWriteAccess rejects invalid access, permissions and MFA before writing', async t => {
  const cases = [
    { name: 'malformed company id', id: 'invalid', row: accessRow(), status: 400, reads: 0 },
    { name: 'missing company', row: null, status: 403 },
    { name: 'nonmember without owner fallback', row: accessRow({ members: [] }), status: 403 },
    { name: 'unknown member role', row: accessRow({ members: [{ id: memberId, role: 'unknown' }] }), status: 403 },
    { name: 'malformed member permission', row: accessRow({ members: [{ id: memberId, role: 'owner', canSendKsef: 'true' }] }), status: 403 },
    { name: 'revoked member permission', row: accessRow({ members: [{ id: memberId, role: 'employee', canSendKsef: false }] }), status: 403 },
    { name: 'required MFA unavailable', row: accessRow({ policies: [{ requireMfa: true }] }), status: 403, code: 'COMPANY_MFA_REQUIRED' },
  ];
  for (const entry of cases) {
    await t.test(entry.name, async () => {
      const fixture = transaction(entry.row);
      await assert.rejects(companyWriteAccess(fixture.tx, userId, entry.id || companyId, 'canSendKsef'), error => {
        assert.equal(error.status, entry.status);
        if (entry.code) assert.equal(error.code, entry.code);
        return true;
      });
      assert.equal(fixture.reads.length, entry.reads ?? 1);
      assert.deepEqual(fixture.writes, [], 'Denied access never touches the company write fence');
    });
  }
});

test('companyWriteAccess fences once on the supplied transaction using the authorized company id', async () => {
  const fixture = transaction(accessRow({ policies: [{ requireMfa: true }], mfaEnabled: true }));
  const access = await companyWriteAccess(fixture.tx, userId, companyId.toUpperCase(), 'canSendKsef');
  assert.deepEqual(access, { company: { id: companyId, userId: ownerId }, role: 'employee' });
  assert.deepEqual(fixture.events, ['read', 'timestamp', 'write']);
  assert.equal(fixture.writes.length, 1);
  const [write] = fixture.writes;
  assert.deepEqual(write.where, { id: access.company.id });
  assert.deepEqual(write.select, { id: true });
  assert.deepEqual(Object.keys(write.data), ['updatedAt']);
  assert.ok(write.data.updatedAt instanceof Date);
  assert.ok(Number.isFinite(write.data.updatedAt.getTime()));
  assert.equal(write.data.updatedAt.getTime(), new Date('2999-01-01T00:00:00.000Z').getTime() + 1, 'A stalled or backwards clock still advances the stored fence');
});

test('companyWriteAccess preserves profile-owner fallback without creating membership', async () => {
  const fixture = transaction(accessRow({ company: { id: companyId, userId, companyName: 'Fixture', nip: '1234567890' }, members: [] }));
  const access = await companyWriteAccess(fixture.tx, userId, companyId, 'canManageTeam');
  assert.equal(access.role, 'owner');
  assert.deepEqual(fixture.events, ['read', 'timestamp', 'write']);
  assert.equal(fixture.writes.length, 1);
});

test('companyWriteAccess propagates the transaction write conflict without retry or granted result', async () => {
  const conflict = Object.assign(new Error('transaction write conflict'), { code: 'P2034' });
  const fixture = transaction(accessRow(), conflict);
  await assert.rejects(companyWriteAccess(fixture.tx, userId, companyId, 'canSendKsef'), error => error === conflict);
  assert.deepEqual(fixture.events, ['read', 'timestamp', 'write']);
  assert.equal(fixture.reads.length, 1);
  assert.equal(fixture.writes.length, 1);
});

test('fenceCompanyWrite rejects a removed company without making a write', async () => {
  const fixture = transaction();
  fixture.tx.companyProfile.findUnique = async () => null;
  await assert.rejects(fenceCompanyWrite(fixture.tx, companyId), error => error.status === 403);
  assert.deepEqual(fixture.writes, []);
});
