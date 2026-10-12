require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict'), Module = require('node:module');
const { ApiError } = require('../../src/lib/api.ts');
const userId = 'a'.repeat(24), companyId = 'b'.repeat(24), recordId = 'c'.repeat(24);
function fixture({ revoked = false, personal = false, changedOwner = false } = {}) {
  const writes = { bank: 0, invitation: 0, audit: 0, checks: [] };
  const account = { id: recordId, companyId, currency: 'PLN', accountName: 'Synthetic account', accountNumber: '61109010140000071219812874', beneficiaryName: 'Synthetic company' };
  const invitation = { id: recordId, companyId: personal ? null : companyId, userId, email: 'fixture@example.invalid', role: 'employee' };
  const tx = { companyBankAccount: { create: async () => { writes.bank++; return account; }, updateMany: async () => { writes.bank++; return { count: 1 }; }, update: async () => { writes.bank++; return account; }, delete: async () => { writes.bank++; return account; } },
    teamInvitation: { findUnique: async () => ({ ...invitation, userId: changedOwner ? 'd'.repeat(24) : userId }), update: async () => { writes.invitation++; return invitation; } } };
  const db = { companyProfile: { findMany: async () => [] }, companyBankAccount: { findFirst: async () => account }, teamInvitation: { findUnique: async () => invitation }, $transaction: async callback => callback(tx) };
  const mocks = { '@/lib/db': { prisma: db }, '@/lib/auth': { getSessionUser: async () => ({ id: userId, email: 'actor@example.invalid' }) },
    '@/lib/permissions': { requireCompanyAccess: async () => ({ ok: true, membership: { company: { userId, companyName: 'Synthetic company' } } }) },
    '@/lib/company-write': { companyWriteAccess: async (supplied, actor, company, permission) => {
      assert.equal(supplied, tx); assert.equal(actor, userId); assert.equal(company, companyId); writes.checks.push(permission);
      if (revoked) throw new ApiError(403, 'Uprawnienie cofnięte przed zapisem.');
    } },
    '@/lib/audit': { recordAuditLog: async () => { writes.audit++; } },
    '@/lib/dto': { companyBankAccountToDto: value => value } };
  const original = Module._load;
  Module._load = function(request, parent, isMain) { return Object.hasOwn(mocks, request) ? mocks[request] : original.call(this, request, parent, isMain); };
  try { const paths = ['../../src/app/api/companies/[id]/bank-accounts/route.ts','../../src/app/api/team/invitations/[id]/route.ts'].map(require.resolve); for (const path of paths) delete require.cache[path]; return { bank: require(paths[0]), invitation: require(paths[1]), writes }; }
  finally { Module._load = original; }
}
const bankContext = { params: Promise.resolve({ id: companyId }) }, inviteContext = { params: Promise.resolve({ id: recordId }) };
const request = (method, query = '') => new Request('http://127.0.0.1/api/synthetic' + query, { method, ...(method === 'DELETE' ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId: recordId, accountNumber: '61109010140000071219812874', accountName: 'Synthetic account' }) }) });
test('bank creation, default selection and deletion reject access revoked after preflight without writes', async t => {
  for (const method of ['POST','PATCH','DELETE']) await t.test(method, async () => {
    const f = fixture({ revoked: true }); const response = await f.bank[method](request(method, method === 'DELETE' ? '?accountId=' + recordId : ''), bankContext);
    assert.equal(response.status, 403); assert.equal(f.writes.bank, 0); assert.equal(f.writes.audit, 0); assert.deepEqual(f.writes.checks, ['canManageBankAccounts']);
  });
});
test('authorized bank operations preserve their responses and check the supplied business transaction', async t => {
  for (const method of ['POST','PATCH','DELETE']) await t.test(method, async () => {
    const f = fixture(); const response = await f.bank[method](request(method, method === 'DELETE' ? '?accountId=' + recordId : ''), bankContext);
    const body = await response.json(); assert.equal(response.status, method === 'POST' ? 201 : 200, JSON.stringify(body));
    assert.equal(f.writes.bank, method === 'PATCH' ? 2 : 1); assert.equal(f.writes.audit, 1); assert.deepEqual(f.writes.checks, ['canManageBankAccounts']);
  });
});
test('invalid bank deletion id is rejected before entering a write transaction', async () => {
  const f = fixture(); assert.equal((await f.bank.DELETE(request('DELETE','?accountId=invalid'),bankContext)).status,400); assert.equal(f.writes.bank,0); assert.deepEqual(f.writes.checks,[]);
});
test('invitation revocation rechecks team permission after preflight before changing its status', async () => {
  const f = fixture({ revoked: true }); assert.equal((await f.invitation.DELETE(request('DELETE'),inviteContext)).status,403); assert.equal(f.writes.invitation,0); assert.equal(f.writes.audit,0); assert.deepEqual(f.writes.checks,['canManageTeam']);
});
test('legacy personal invitation retains owner revocation and rejects an owner change before saving', async t => {
  for(const changedOwner of [false,true]) await t.test(String(changedOwner),async()=>{const f=fixture({personal:true,changedOwner});assert.equal((await f.invitation.DELETE(request('DELETE'),inviteContext)).status,changedOwner?403:200);assert.equal(f.writes.invitation,changedOwner?0:1);assert.deepEqual(f.writes.checks,[]);});
});
