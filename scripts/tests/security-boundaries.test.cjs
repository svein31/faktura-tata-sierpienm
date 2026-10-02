require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const { sessionTokenHash, isSessionBearer } = require('../../src/lib/session-token.ts');
const { isUnsafeCrossOrigin } = require('../../src/lib/csrf.ts');
const token = 'a'.repeat(43);
test('session digest cannot be used as bearer; randomness format is constrained', () => {
  const hash = sessionTokenHash(token);
  assert.notEqual(hash, token); assert.match(hash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(isSessionBearer(hash), false);
  assert.equal(isSessionBearer(token), true);
  for (const bad of ['', 'a'.repeat(42), 'a'.repeat(44), '../../etc/passwd']) assert.equal(isSessionBearer(bad), false);
});
test('cookie writes require same-origin evidence; forged and null origins are rejected', () => {
  const req = headers => new Request('https://fakturaprosto.pl/api/invoices', { method: 'POST', headers });
  assert.equal(isUnsafeCrossOrigin(req({ cookie: 'auth_session=' + token })), true);
  assert.equal(isUnsafeCrossOrigin(req({ cookie: 'auth_session=' + token, origin: 'https://fakturaprosto.pl' })), false);
  for (const origin of ['https://evil.example', 'https://fakturaprosto.pl.evil.example', 'http://fakturaprosto.pl', 'null', 'garbage']) assert.equal(isUnsafeCrossOrigin(req({ origin })), true);
  assert.equal(isUnsafeCrossOrigin(req({ 'sec-fetch-site': 'cross-site' })), true);
  assert.equal(isUnsafeCrossOrigin(req({ authorization: 'Bearer service-token' })), false);
  assert.equal(isUnsafeCrossOrigin(new Request('https://fakturaprosto.pl/api/data', { headers: { origin: 'https://evil.example' } })), false);
});

test('same-origin proxy requests use the actual host, not Next internal localhost', () => {
  const req = headers => new Request('http://localhost:3000/api/invoices', { method: 'POST', headers });
  assert.equal(isUnsafeCrossOrigin(req({ host: 'fakturaprosto.pl', 'x-forwarded-proto': 'https', origin: 'https://fakturaprosto.pl' })), false);
  assert.equal(isUnsafeCrossOrigin(req({ host: 'fakturaprosto.pl', 'x-forwarded-proto': 'https', origin: 'https://evil.example', 'x-forwarded-host': 'evil.example' })), true);
});
