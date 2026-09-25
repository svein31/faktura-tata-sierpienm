require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const { encodeBase32, totpAt, matchingTotpStep, encryptMfaSecret, decryptMfaSecret, generateRecoveryCodes, recoveryHash } = require('../../src/lib/totp.ts');
test('TOTP matches all RFC 6238 SHA-1 vectors including dates beyond 2038', () => {
  const secret = encodeBase32(Buffer.from('12345678901234567890'));
  for (const [seconds, expected] of [[59,'94287082'],[1111111109,'07081804'],[1111111111,'14050471'],[1234567890,'89005924'],[2000000000,'69279037'],[20000000000,'65353130']]) assert.equal(totpAt(secret,seconds*1000,8),expected);
  assert.equal(matchingTotpStep(secret,totpAt(secret,90000),120000),3);
  assert.equal(matchingTotpStep(secret,totpAt(secret,30000),120000),null);
  assert.equal(matchingTotpStep(secret,'not-a-code',120000),null);
});
test('MFA encryption is randomized, authenticated and bound to the account', () => {
  const previous = Object.fromEntries(['MFA_ENCRYPTION_KEY', 'NEXTAUTH_SECRET', 'DATABASE_URL'].map(key => [key, process.env[key]]));
  process.env.MFA_ENCRYPTION_KEY = '11'.repeat(32);
  process.env.NEXTAUTH_SECRET = 'integration-stable-auth-secret';
  try {
    const encrypted = encryptMfaSecret('BASE32SECRET','user-a');
    assert.equal(decryptMfaSecret(encrypted,'user-a'),'BASE32SECRET');
    assert.notEqual(encrypted,encryptMfaSecret('BASE32SECRET','user-a'));
    assert.throws(()=>decryptMfaSecret(encrypted,'user-b'));
    const parts = encrypted.split('.'); parts[3] = Buffer.from('tampered').toString('base64url');
    assert.throws(()=>decryptMfaSecret(parts.join('.'),'user-a'));
    delete process.env.MFA_ENCRYPTION_KEY;
    const fallbackEncrypted = encryptMfaSecret('BASE32SECRET','user-a');
    assert.equal(decryptMfaSecret(fallbackEncrypted,'user-a'),'BASE32SECRET');
    process.env.MFA_ENCRYPTION_KEY = '22'.repeat(32);
    assert.equal(decryptMfaSecret(fallbackEncrypted,'user-a'),'BASE32SECRET', 'Adding a dedicated key must not lock out prior setup');
    delete process.env.MFA_ENCRYPTION_KEY;
    delete process.env.NEXTAUTH_SECRET;
    process.env.DATABASE_URL = 'mongodb://secret@localhost/fakturo';
    assert.equal(decryptMfaSecret(encryptMfaSecret('BASE32SECRET','user-a'),'user-a'),'BASE32SECRET');
    delete process.env.DATABASE_URL;
    assert.throws(()=>encryptMfaSecret('secret','user-a'),/MFA_ENCRYPTION_KEY/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
test('recovery codes contain independent entropy and hashes are account bound', () => {
  const codes = generateRecoveryCodes(); assert.equal(new Set(codes).size,8);
  for (const code of codes) assert.match(code,/^[a-f\d]{8}(-[a-f\d]{8}){3}$/);
  assert.equal(recoveryHash('a',codes[0]),recoveryHash('a',codes[0].toUpperCase().replaceAll('-','')));
  assert.notEqual(recoveryHash('a',codes[0]),recoveryHash('b',codes[0]));
});
