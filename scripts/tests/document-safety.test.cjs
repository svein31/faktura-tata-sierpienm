require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict'), { createHash } = require('node:crypto');
const { basicDocumentThreat, scanDocument } = require('../../src/lib/document-safety.ts');
test('active PDF and escaped PDF names are quarantined; bytes define the type', () => {
  assert.ok(basicDocumentThreat(Buffer.from('%PDF-1.7 /JavaScript (alert)')));
  assert.ok(basicDocumentThreat(Buffer.from('%PDF-1.7 /J#61vaScript (alert)')));
  assert.ok(basicDocumentThreat(Buffer.from('%PDF-1.7 EICAR-STANDARD-ANTIVIRUS-TEST-FILE')));
  assert.equal(basicDocumentThreat(Buffer.from('%PDF-1.7 ordinary invoice')), null);
  assert.throws(() => basicDocumentThreat(Buffer.from('<svg onload="alert(1)">')));
});
test('scanner errors and mismatched digests fail closed; basic inspection does not claim an AV pass', async () => {
  const old = { url: process.env.DOCUMENT_SCAN_URL, token: process.env.DOCUMENT_SCAN_TOKEN, required: process.env.DOCUMENT_SCAN_REQUIRED }, originalFetch = global.fetch;
  const bytes = Buffer.from('%PDF-1.7 ordinary invoice');
  try {
    delete process.env.DOCUMENT_SCAN_URL; delete process.env.DOCUMENT_SCAN_TOKEN; delete process.env.DOCUMENT_SCAN_REQUIRED;
    assert.equal((await scanDocument(bytes)).safetyStatus, 'unverified');
    process.env.DOCUMENT_SCAN_REQUIRED = 'true';
    assert.equal((await scanDocument(bytes)).safetyStatus, 'quarantined');
    process.env.DOCUMENT_SCAN_URL = 'https://scanner.example/scan'; process.env.DOCUMENT_SCAN_TOKEN = 'synthetic-scan-token';
    global.fetch = async () => new Response(JSON.stringify({ status: 'clean', sha256: '0'.repeat(64) }));
    assert.equal((await scanDocument(bytes)).safetyStatus, 'quarantined');
    global.fetch = async () => new Response(JSON.stringify({ status: 'clean', sha256: createHash('sha256').update(bytes).digest('hex') }));
    assert.equal((await scanDocument(bytes)).safetyStatus, 'clean');
    global.fetch = async () => { throw new Error('unavailable'); };
    assert.equal((await scanDocument(bytes)).safetyStatus, 'quarantined');
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of [['DOCUMENT_SCAN_URL', old.url], ['DOCUMENT_SCAN_TOKEN', old.token], ['DOCUMENT_SCAN_REQUIRED', old.required]]) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
