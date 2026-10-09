require('../register-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { validNewPasswordLength, readPasswordResetLink } = require('../../src/lib/password-policy.ts');
const { validateCredentials, verifyPassword, sessionCookieOptions } = require('../../src/lib/auth.ts');
const { changePasswordAuthenticated } = require('../../src/lib/password-change.ts');
const { validateTaxId } = require('../../src/lib/validation.ts');
const { parseContractorBody, parseInvoiceBody } = require('../../src/lib/parsers.ts');
const bcrypt = require('bcryptjs');

test('new passwords must fit bcrypt UTF-8 input without a silently ignored suffix', async () => {
  assert.equal(validNewPasswordLength('a'.repeat(72)), true);
  assert.equal(validNewPasswordLength('a'.repeat(73)), false);
  assert.equal(validNewPasswordLength('ą'.repeat(36)), true);
  assert.equal(validNewPasswordLength('ą'.repeat(37)), false);
  assert.equal(validNewPasswordLength('🔐'.repeat(18)), true);
  assert.equal(validNewPasswordLength('🔐'.repeat(19)), false);
  for (const password of ['short', '', null, 123, {}, 'x'.repeat(1000000)]) assert.equal(validNewPasswordLength(password), false);
  assert.equal(validateCredentials('test@example.invalid', 'ą'.repeat(37)).ok, false);
  const prefix = 'a'.repeat(72), hash = await bcrypt.hash(prefix + 'first-suffix', 4);
  assert.equal(await verifyPassword(prefix + 'second-suffix', hash), true, 'Previously accepted legacy passwords remain usable for migration');
  assert.equal(await verifyPassword('a'.repeat(129), hash), false);
});

test('password reset captures fragment and legacy query credentials before URL cleaning', () => {
  assert.deepEqual(readPasswordResetLink(new URL('https://fakturaprosto.pl/reset-password#token=fragment')), { token: 'fragment', email: '' });
  assert.deepEqual(readPasswordResetLink(new URL('https://fakturaprosto.pl/reset-password?token=old&email=jan%2Bqa%40example.invalid')), { token: 'old', email: 'jan+qa@example.invalid' });
  assert.deepEqual(readPasswordResetLink(new URL('https://fakturaprosto.pl/reset-password?token=old#token=new')), { token: 'new', email: '' });
});

function passwordDb({ live = 1, changed = 1 } = {}) {
  const calls = [];
  const tx = {
    session: { updateMany: async args => { calls.push(['session-proof', args]); return { count: live }; }, deleteMany: async args => { calls.push(['sessions-revoked', args]); } },
    user: { updateMany: async args => { calls.push(['password-cas', args]); return { count: changed }; } },
    passwordResetToken: { updateMany: async args => { calls.push(['reset-revoked', args]); } },
    emailVerificationToken: { updateMany: async args => { calls.push(['email-change-revoked', args]); } },
  };
  return { calls, db: { $transaction: callback => callback(tx) } };
}
test('password change keeps only its authenticated live session and atomically revokes old recovery paths', async () => {
  const { calls, db } = passwordDb();
  await changePasswordAuthenticated('owner', 'current-session', 'old-hash', 'new-hash', db);
  assert.deepEqual(calls.map(call => call[0]), ['session-proof', 'password-cas', 'reset-revoked', 'email-change-revoked', 'sessions-revoked']);
  assert.deepEqual(calls[1][1].where, { id: 'owner', password: 'old-hash' });
  assert.deepEqual(calls[4][1].where, { userId: 'owner', id: { not: 'current-session' } });
  assert.equal(calls[3][1].where.purpose, 'change-email', 'Ordinary email confirmation is preserved');
});
test('stale password proofs and revoked sessions cannot issue credential changes', async () => {
  for (const fixture of [{ options: { live: 0 }, code: 'UNAUTHENTICATED', calls: 1 }, { options: { changed: 0 }, code: 'PASSWORD_CHANGED', calls: 2 }]) {
    const { db, calls } = passwordDb(fixture.options);
    await assert.rejects(changePasswordAuthenticated('owner', 'current-session', 'old-hash', 'new-hash', db), error => error.code === fixture.code);
    assert.equal(calls.length, fixture.calls);
  }
});
test('contractor API rejects unsupported tax identifier types even with a valid-looking NIP or foreign identifier', () => {
  for (const country of ['PL', 'US']) {
    assert.equal(validateTaxId('5260301706', 'unexpected', country).valid, false);
    assert.throws(() => parseContractorBody({ name: 'Synthetic contractor', nip: '5260301706', taxIdType: 'unexpected', country }), /typ identyfikatora/);
  }
  assert.equal(validateTaxId('5260301706', 'nip', 'PL').valid, true);
  assert.equal(validateTaxId('001-AB', 'tin', 'US').valid, true);
  assert.equal(validateTaxId('', 'none', 'PL').valid, true);
});
test('Polish VAT UE preserves its PL prefix/checksum and produces official-schema-compatible buyer identity', async () => {
  for (const value of ['PL5260301706', '5260301706', 'PL 526-030-17-06']) {
    const result = validateTaxId(value, 'vat_eu', 'PL');
    assert.equal(result.valid, true); assert.equal(result.normalized, 'PL5260301706'); assert.equal(result.type, 'vat_eu');
  }
  for (const value of ['PL5260301707', 'PL123', 'DE5260301706', 'PLABCDEFGHIJ']) assert.equal(validateTaxId(value, 'vat_eu', 'PL').valid, false);
  const buyer = parseContractorBody({ name: 'Synthetic PL VAT company', taxId: 'PL5260301706', taxIdType: 'vat_eu', country: 'PL', address: { country: 'PL', city: 'Warszawa', street: 'Test 2', postal: '00-001' } });
  assert.equal(buyer.taxId, 'PL5260301706');
  const invoice = await parseInvoiceBody({ number: 'QA/VAT-UE/1', type: 'sale', status: 'issued', contractorId: 'a'.repeat(24), sellerCompanyId: 'b'.repeat(24), issueDate: '2026-10-08', saleDate: '2026-10-08', dueDate: '2026-10-22', currency: 'PLN', paymentMethod: 'transfer', lines: [{ name: 'Synthetic item', quantity: 1, unit: 'szt.', netPrice: 100, vatRate: '23' }] }, { contractorOwnedBy: async () => true, companyOwnedBy: async () => true });
  const { buildFa3Xml } = require('../../src/lib/ksef/xmlBuilder.ts');
  const xml = buildFa3Xml({ invoice, seller: { companyName: 'Synthetic seller', nip: '5250001003', street: 'Test 1', city: 'Warszawa', postalCode: '00-001' }, buyer });
  assert.match(xml, /<KodUE>PL<\/KodUE>\s*<NrVatUE>5260301706<\/NrVatUE>/);
  const { spawnSync } = require('node:child_process');
  const checked = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['scripts/validate-jpk.py', 'fa3.xsd'], { input: xml, encoding: 'utf8', timeout: 15000 });
  assert.equal(checked.status, 0, checked.stderr);
});
test('invitation session cookies can derive Secure from the actual HTTPS request or trusted proxy', () => {
  const previous = process.env.COOKIE_SECURE;
  delete process.env.COOKIE_SECURE;
  try {
    assert.equal(sessionCookieOptions(undefined, new Request('https://fakturaprosto.pl/api/invite/test')).secure, true);
    assert.equal(sessionCookieOptions(undefined, new Request('http://localhost:3000/api/invite/test', { headers: { 'x-forwarded-proto': 'https' } })).secure, true);
    assert.equal(sessionCookieOptions(undefined, new Request('http://127.0.0.1/api/invite/test')).secure, false);
  } finally { if (previous === undefined) delete process.env.COOKIE_SECURE; else process.env.COOKIE_SECURE = previous; }
});
