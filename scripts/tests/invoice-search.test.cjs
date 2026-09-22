const test = require('node:test');
const assert = require('node:assert/strict');
require('../register-ts.cjs');
const { invoiceSearchParams, literalRegex } = require('../../src/lib/invoice-search.ts');
const { reportUnexpectedError } = require('../../src/lib/error-report.ts');
test('invoice search bounds inputs, rejects unknown filters and treats regex literally', () => {
  assert.equal(invoiceSearchParams(new URLSearchParams()).type, 'all');
  for (const query of ['type=invalid','cursor=bad','status=deleted','search='+'a'.repeat(151)]) assert.throws(() => invoiceSearchParams(new URLSearchParams(query)));
  assert.equal(new RegExp(literalRegex('a.*[b]$')).test('a.*[b]$'), true);
  assert.equal(new RegExp(literalRegex('a.*[b]$')).test('ab'), false);
});
test('unexpected error logs exclude messages, stack paths and secrets while identifying incidents', () => {
  const old = console.error, logged = [];
  console.error = line => logged.push(line);
  try {
    const incident = reportUnexpectedError(new Error('secret password customer@example.com'));
    const event = JSON.parse(logged[0]);
    assert.equal(event.incident, incident); assert.equal(event.event, 'application_error');
    assert.ok(event.fingerprint); assert.equal(/secret|password|customer|\.ts/.test(logged[0]), false);
  } finally { console.error = old; }
});
