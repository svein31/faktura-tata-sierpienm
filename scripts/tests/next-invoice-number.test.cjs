require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const Module = require('node:module'), originalLoad = Module._load;
const user = { id: 'a'.repeat(24) }, companyId = 'b'.repeat(24);
let authenticated = true, permitted = true, reads = 0, proposals = [];
Module._load = function (request, parent, main) {
  if (request === '@/lib/auth') return { getSessionUser: async () => authenticated ? user : null };
  if (request === '@/lib/permissions') return { requireCompanyAccess: async () => permitted ? { ok: true } : { ok: false, status: 403, error: 'Brak dostępu.' } };
  if (request === '@/lib/db') return { prisma: {
    companyProfile: { findUniqueOrThrow: async () => { reads++; return { invoiceNumberPattern: '{PREFIX} {NN}/{MM}/{YYYY}' }; } },
    invoice: { findFirst: async () => { reads++; return { number: 'FV 08/10/2026' }; } },
  } };
  if (request === '@/lib/invoice-numbering-server') return { nextPersistedInvoiceNumber: async (...args) => { proposals.push(args.slice(1)); return 'FV 09/10/2026'; } };
  return originalLoad.call(this, request, parent, main);
};
const { GET } = require('../../src/app/api/invoices/next-number/route.ts');
Module._load = originalLoad;
const request = query => new Request(`http://localhost/api/invoices/next-number?${query}`);

test('number preview checks authentication, company identity and access before reading numbering', async () => {
  reads = 0; proposals = [];
  authenticated = false;
  assert.equal((await GET(request(`companyId=${companyId}&date=2026-10-08`))).status, 401);
  authenticated = true;
  assert.equal((await GET(request('companyId=wrong&date=2026-10-08'))).status, 400);
  permitted = false;
  assert.equal((await GET(request(`companyId=${companyId}&date=2026-10-08`))).status, 403);
  permitted = true;
  assert.equal(reads, 0); assert.equal(proposals.length, 0);
});

test('number preview rejects invalid calendar dates and document types without proposing a reservation', async () => {
  proposals = [];
  assert.equal((await GET(request(`companyId=${companyId}&date=2026-02-30`))).status, 400);
  assert.equal((await GET(request(`companyId=${companyId}&date=2026-10-08&type=bad`))).status, 400);
  assert.equal(proposals.length, 0);
});

test('number preview returns a small private response and preserves series selection', async () => {
  reads = 0; proposals = [];
  const response = await GET(request(`companyId=${companyId}&date=2026-10-08&type=sale&correction=1`));
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(data, { number: 'FV 09/10/2026', lastNumber: 'FV 08/10/2026' });
  assert.equal(proposals[0][3], 'KOR');
  assert.equal(reads, 2); assert.ok(Buffer.byteLength(JSON.stringify(data)) < 200);
});
