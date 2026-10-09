require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict'), Module = require('node:module');
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '@/lib/auth') return { getSessionUser: async () => ({ id: 'synthetic-owner' }) };
  if (request === '@/lib/document-inbox') return { inboxAccess: async () => 'synthetic-company', MAX_DOCUMENT_BYTES: 3 * 1024 * 1024 };
  return originalLoad.call(this, request, parent, isMain);
};
let route;
try { route = require('../../src/app/api/documents/route.ts'); } finally { Module._load = originalLoad; }
test('invalid multipart uploads are client errors and cannot reach a database write or scanner', async () => {
  for (const contentType of ['application/json', 'multipart/form-data; boundary=missing', 'multipart/form-data']) {
    const response = await route.POST(new Request('http://127.0.0.1/api/documents', { method: 'POST', headers: { 'Content-Type': contentType }, body: 'invalid multipart' }));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, 'INVALID_MULTIPART');
  }
});
