require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { buildKsefVerificationUrl, buildKsefOfflineCertUrl, calculateXmlDigestBase64Url } = require('../../src/lib/ksef/qr.ts');

test('KSeF verification hash covers exact XML bytes, including whitespace', () => {
  const xml = '<Fa>ąć</Fa>\n';
  const digest = crypto.createHash('sha256').update(Buffer.from(xml, 'utf8')).digest('base64url');
  assert.equal(calculateXmlDigestBase64Url(xml), digest);
  assert.equal(buildKsefVerificationUrl({ sellerNip: '123-456-78-90', issueDate: '2026-09-23', xmlContent: xml, environment: 'test' }), `https://qr-test.ksef.mf.gov.pl/invoice/1234567890/23-09-2026/${digest}`);
  assert.notEqual(calculateXmlDigestBase64Url(xml), calculateXmlDigestBase64Url(xml.trim()));
});

test('missing XML and unsigned offline certificate never produce plausible QR URLs', () => {
  const params = { sellerNip: '1234567890', issueDate: '2026-09-23' };
  assert.throws(() => buildKsefVerificationUrl(params), /XML/);
  assert.throws(() => buildKsefOfflineCertUrl({ ...params, xmlContent: '<Fa/>' }), /certyfikatem/);
});
