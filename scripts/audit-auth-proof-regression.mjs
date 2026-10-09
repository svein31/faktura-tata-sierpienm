import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('./register-ts.cjs');
const Module = require('node:module');

/** Pause after successful old-password verification, commit a credential change, then resume the stale operation. */
export async function checkAuthenticationProofFencing(db, { expectVulnerable = false } = {}) {
  const originalLoad = Module._load, authPath = require.resolve('../src/lib/auth.ts');
  delete require.cache[authPath];
  Module._load = function(request, parent, isMain) {
    if (request === './db' && parent?.filename === authPath) return { prisma: db };
    return originalLoad.call(this, request, parent, isMain);
  };
  let createSession;
  try { ({ createSession } = require(authPath)); } finally { Module._load = originalLoad; }
  const { requestEmailVerification } = require('../src/lib/email/verification.ts');
  const user = await db.user.create({ data: { email: `stale-proof-${randomBytes(8).toString('hex')}@example.invalid`, password: 'original-verified-hash' } });
  try {
    const browserSession = await db.session.create({ data: { userId: user.id, sessionToken: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 3600000) } });
    // The route has already verified this exact hash; the database subsequently changes before session/token creation.
    const capturedProof = user.password;
    await db.user.update({ where: { id: user.id }, data: { password: 'replacement-password-hash' } });
    await db.session.deleteMany({ where: { userId: user.id } });
    const staleLogin = await Promise.allSettled([createSession(user.id, { expectedPasswordHash: capturedProof, expectedLoginEmail: user.email }, db)]);
    let deliveryAttempts = 0;
    const staleEmail = await Promise.allSettled([requestEmailVerification(user.id, { db, targetEmail: 'stale-target@example.invalid', expectedPasswordHash: capturedProof, expectedSessionId: browserSession.id, deliver: async () => { deliveryAttempts++; return { success: true }; } })]);
    const evidence = { staleLogin: staleLogin[0].status, staleEmailChange: staleEmail[0].status, sessions: await db.session.count({ where: { userId: user.id } }), pendingEmailChanges: await db.emailVerificationToken.count({ where: { userId: user.id, purpose: 'change-email' } }), deliveryAttempts };
    if (expectVulnerable) {
      assert.equal(evidence.staleLogin, 'fulfilled'); assert.equal(evidence.staleEmailChange, 'fulfilled');
      assert.equal(evidence.sessions, 1); assert.equal(evidence.pendingEmailChanges, 1); assert.equal(deliveryAttempts, 1);
      console.log('[auth-proof-audit] REPRODUCED before fix ' + JSON.stringify(evidence));
      return;
    }
    assert.equal(evidence.staleLogin, 'rejected'); assert.equal(staleLogin[0].reason.status, 401);
    assert.equal(evidence.staleEmailChange, 'rejected'); assert.equal(staleEmail[0].reason.status, 401);
    assert.equal(evidence.sessions, 0); assert.equal(evidence.pendingEmailChanges, 0); assert.equal(deliveryAttempts, 0);
    const valid = await createSession(user.id, { expectedPasswordHash: 'replacement-password-hash', expectedLoginEmail: user.email }, db);
    assert.ok(valid.token); assert.equal(await db.session.count({ where: { userId: user.id } }), 1);
    assert.equal((await requestEmailVerification(user.id, { db, targetEmail: 'valid-target@example.invalid', expectedPasswordHash: 'replacement-password-hash', expectedSessionId: valid.sessionId, deliver: async () => { deliveryAttempts++; return { success: true }; } })).delivery, 'accepted');
    assert.equal(deliveryAttempts, 1);
    console.log('[auth-proof-audit] PASS after fix ' + JSON.stringify(evidence) + '; current proofs still work');
  } finally { await db.user.delete({ where: { id: user.id } }); }
}
