require('../register-ts.cjs');
const Module = require('node:module'), test = require('node:test'), assert = require('node:assert/strict');
const original = Module._load;
let contact, links = 0, access = false;
Module._load = function(request, parent, main) {
  if (request === '@/lib/db') return { prisma: { contractor: { findUnique: async () => contact }, invoice: { count: async () => links } } };
  if (request === '@/lib/permissions') return { requireCompanyAccess: async () => access ? { ok: true } : { ok: false, status: 403, error: 'Denied' } };
  return original.call(this, request, parent, main);
};
const { contractorForCompany, requireCatalogEdit } = require('../../src/lib/company-scope.ts');
const id = '012345678901234567890123', company = '112345678901234567890123';
test('contact cannot cross company boundary even for its author', async () => {
  contact = { userId: 'owner', companyId: company };
  assert.equal(await contractorForCompany('owner', id, '212345678901234567890123'), false);
  assert.equal(await contractorForCompany('owner', id, company), true);
});
test('legacy contacts are shared only through a document in the selected company', async () => {
  contact = { userId: 'owner', companyId: null }; links = 0;
  assert.equal(await contractorForCompany('member', id, company), false);
  links = 1; assert.equal(await contractorForCompany('member', id, company), true);
});
test('catalog editing rechecks membership and denies legacy viewer writes', async () => {
  access = false;
  await assert.rejects(requireCatalogEdit('author', 'owner', { userId: 'author', companyId: company }), /Denied/);
  await assert.rejects(requireCatalogEdit('owner', 'viewer', { userId: 'owner', companyId: null }), /Brak/);
  access = true; await requireCatalogEdit('member', 'employee', { userId: 'author', companyId: company });
});
