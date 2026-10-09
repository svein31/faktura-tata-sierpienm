import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('./register-ts.cjs');
const { changePasswordAuthenticated } = require('../src/lib/password-change.ts');
const bcrypt = require('bcryptjs');

/** Only the isolated harness supplies the database; this module cannot target production from environment variables. */
export async function checkPasswordChangeAtomic(db) {
  const user = await db.user.create({ data: { email: `password-audit-${randomBytes(8).toString('hex')}@example.invalid`, password: 'previous-hash' } });
  try {
    const liveSession = await db.session.create({ data: { userId: user.id, sessionToken: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 3600000) } });
    await db.session.create({ data: { userId: user.id, sessionToken: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 3600000) } });
    const reset = await db.passwordResetToken.create({ data: { userId: user.id, tokenHash: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 3600000) } });
    const emailChange = await db.emailVerificationToken.create({ data: { userId: user.id, tokenHash: randomBytes(32).toString('hex'), email: 'new@example.invalid', sourceEmail: user.email, purpose: 'change-email', expiresAt: new Date(Date.now() + 3600000) } });
    const emailProof = await db.emailVerificationToken.create({ data: { userId: user.id, tokenHash: randomBytes(32).toString('hex'), email: user.email, sourceEmail: user.email, expiresAt: new Date(Date.now() + 3600000) } });
    const results = await Promise.allSettled([0, 1].map(index => changePasswordAuthenticated(user.id, liveSession.id, 'previous-hash', `winner-hash-${index}`, db)));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.find(result => result.status === 'rejected').reason.code, 'PASSWORD_CHANGED');
    const winnerHash = `winner-hash-${results.findIndex(result => result.status === 'fulfilled')}`;
    assert.equal((await db.user.findUnique({ where: { id: user.id } })).password, winnerHash);
    assert.equal(await db.session.count({ where: { userId: user.id } }), 1);
    assert.ok(await db.session.findUnique({ where: { id: liveSession.id } }));
    assert.ok((await db.passwordResetToken.findUnique({ where: { id: reset.id } })).usedAt);
    assert.ok((await db.emailVerificationToken.findUnique({ where: { id: emailChange.id } })).usedAt);
    assert.equal((await db.emailVerificationToken.findUnique({ where: { id: emailProof.id } })).usedAt, null);
    const recovery = await db.passwordResetToken.create({ data: { userId: user.id, tokenHash: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 3600000) } });
    const anotherSession = await db.session.create({ data: { userId: user.id, sessionToken: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 3600000) } });
    const faultingDb = { $transaction: callback => db.$transaction(tx => callback(new Proxy(tx, { get(target, key) {
      if (key === 'emailVerificationToken') return { updateMany: async () => { throw new Error('Injected credential revocation failure'); } };
      return target[key];
    } }))) };
    await assert.rejects(changePasswordAuthenticated(user.id, liveSession.id, winnerHash, 'must-rollback', faultingDb), /Injected credential revocation failure/);
    assert.equal((await db.user.findUnique({ where: { id: user.id } })).password, winnerHash);
    assert.equal((await db.passwordResetToken.findUnique({ where: { id: recovery.id } })).usedAt, null);
    assert.ok(await db.session.findUnique({ where: { id: anotherSession.id } }));
    await db.session.delete({ where: { id: liveSession.id } });
    await assert.rejects(changePasswordAuthenticated(user.id, liveSession.id, winnerHash, 'revoked-proof', db), error => error.code === 'UNAUTHENTICATED');
    assert.equal((await db.user.findUnique({ where: { id: user.id } })).password, winnerHash);
    console.log('[account-audit] PASS: concurrent password changes, old recovery revocation, live-session fencing and atomic rollback');
  } finally { await db.user.delete({ where: { id: user.id } }); }
}

/** HTTP proof on a local compiled application, with newly created synthetic users and no provider delivery. */
export async function checkAccountSecurityHttp(base, db) {
  assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Account QA can only call a local fixture server');
  const original = 'SyntheticOld123!', replacement = 'SyntheticNew456!';
  const user = await db.user.create({ data: { email: `http-password-${randomBytes(8).toString('hex')}@example.invalid`, password: await bcrypt.hash(original, 12) } });
  const bearer = randomBytes(32).toString('base64url'), staleBearer = randomBytes(32).toString('base64url');
  const cookie = `auth_session=${bearer}`;
  const api = async (method, path, body, credential = cookie, headers = {}) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Cookie: credential, Origin: base, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { response, data: await response.json() };
  };
  try {
    for (const token of [bearer, staleBearer]) await db.session.create({ data: { userId: user.id, sessionToken: 'sha256:' + createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3600000) } });
    const company = await db.companyProfile.create({ data: { userId: user.id, nip: '5260301706', companyName: 'Synthetic account QA company' } });
    const malformedUpload = await fetch(base + '/api/documents?companyId=' + company.id, { method: 'POST', headers: { Cookie: cookie, Origin: base, 'Content-Type': 'multipart/form-data; boundary=missing' }, body: 'invalid multipart' });
    assert.equal(malformedUpload.status, 400); assert.equal((await malformedUpload.json()).code, 'INVALID_MULTIPART');
    assert.equal(await db.expenseScan.count({ where: { companyId: company.id } }), 0);
    assert.equal((await api('POST', '/api/consents', { documentType: 'cookie_analytics', accepted: 'true' })).response.status, 400);
    const malformedConsent = await fetch(base + '/api/consents', { method: 'POST', headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json' }, body: '{broken' });
    assert.equal(malformedConsent.status, 400);
    assert.equal((await api('POST', '/api/consents', { documentType: 'cookie_analytics', accepted: true })).response.status, 200);
    const { LEGAL_VERSIONS } = require('../src/lib/legal/config.ts');
    assert.equal((await db.legalConsent.findFirst({ where: { userId: user.id, documentType: 'cookie_analytics' } })).documentVersion, LEGAL_VERSIONS.cookies);
    const resetRaw = randomBytes(32).toString('hex');
    await db.passwordResetToken.create({ data: { userId: user.id, tokenHash: createHash('sha256').update(resetRaw).digest('hex'), expiresAt: new Date(Date.now() + 3600000) } });
    assert.equal((await api('POST', '/api/user/change-password', { currentPassword: original, newPassword: 'ą'.repeat(37) + '1!', confirmPassword: 'ą'.repeat(37) + '1!' })).response.status, 400);
    assert.equal((await api('PUT', '/api/user/profile', { nip: '1234567890' })).response.status, 400);
    assert.equal((await api('POST', '/api/user/change-password', { currentPassword: original, newPassword: replacement, confirmPassword: replacement }, cookie, { Origin: 'https://evil.example' })).response.status, 403);
    assert.equal((await api('POST', '/api/user/change-password', { currentPassword: original, newPassword: replacement, confirmPassword: replacement })).response.status, 200);
    assert.equal((await api('GET', '/api/auth/me', undefined)).response.status, 200);
    assert.equal((await api('GET', '/api/auth/me', undefined, `auth_session=${staleBearer}`)).response.status, 401);
    assert.equal((await api('POST', '/api/auth/reset-password', { token: resetRaw, newPassword: 'RecoveryUnwanted789!' }, '')).response.status, 400);
    assert.equal(await bcrypt.compare(replacement, (await db.user.findUnique({ where: { id: user.id } })).password), true);
    for (const fields of [{ password: 'ą'.repeat(37) }, { name: 'x'.repeat(101) }, { nip: '1234567890', companyName: 'Invalid synthetic company' }, { company: [] }]) {
      const email = `invalid-register-${randomBytes(8).toString('hex')}@example.invalid`;
      assert.equal((await api('POST', '/api/auth/register', { email, password: original, acceptTerms: true, ...fields }, '')).response.status, 400);
      assert.equal(await db.user.findUnique({ where: { email } }), null, 'Rejected registration must not leave an account');
    }
    await db.user.update({ where: { id: user.id }, data: { email: `zażółć-${randomBytes(8).toString('hex')}@example.invalid` } });
    const exported = await api('GET', '/api/user/export-data');
    assert.equal(exported.response.status, 200);
    assert.match(exported.response.headers.get('content-disposition'), new RegExp('^attachment; filename="fakturaprosto-export-' + user.id + '-'));
    assert.ok(exported.data.profile.email.startsWith('zażółć-'));
    assert.equal(exported.data.invoices_summary.count, 0); assert.equal(exported.data.contractors_count, 0);
    for (let attempt = 0; attempt < 11; attempt++) {
      const result = await api('POST', '/api/auth/step-up', { password: 'incorrect-secret' }, cookie, { 'X-Nf-Client-Connection-Ip': `192.0.2.${attempt + 1}` });
      assert.equal(result.response.status, attempt < 10 ? 401 : 429, 'Changing the client address cannot reset the account quota');
    }
    console.log('[account-audit] PASS: HTTP password byte bounds, CSRF, session/reset revocation, registration/profile validation, malformed upload, consent version/errors, Unicode export and step-up account quota');
  } finally { await db.user.delete({ where: { id: user.id } }); }
}
