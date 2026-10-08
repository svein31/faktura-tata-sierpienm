import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('./register-ts.cjs');

/** Uses isolated Mongo transactions; provider is a controlled double, never real SMTP/Resend. */
export async function checkEmailSafety(db) {
  const { requestEmailVerification, confirmEmailVerification, requireVerifiedEmailForSending } = require('../src/lib/email/verification.ts');
  const { claimManualEmail, startManualEmail, finishManualEmail, resolveManualEmail, manualEmailDigest } = require('../src/lib/email/manual-delivery.ts');
  const suffix = randomBytes(8).toString('hex'), messages = [];
  const user = await db.user.create({ data: { email: `verify-${suffix}@example.test`, password: 'synthetic-hash', emailVerificationRequiredAt: new Date() } });
  const deliver = async payload => { messages.push(payload); return { success: true, provider: 'smtp', messageId: 'synthetic-message', message: 'accepted' }; };
  const rawToken = payload => payload.text.match(/#token=([a-f0-9]{64})/)[1];
  try {
    await assert.rejects(requireVerifiedEmailForSending(user.id, db), error => error.code === 'EMAIL_NOT_VERIFIED');
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => requestEmailVerification(user.id, { db, deliver })));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1, 'Concurrent resend has one persisted winner');
    assert.equal(messages.length, 1); assert.equal(messages[0].singleAttempt, true);
    const raw = rawToken(messages[0]);
    const stored = await db.emailVerificationToken.findFirst({ where: { userId: user.id } });
    assert.equal(stored.tokenHash, createHash('sha256').update(raw).digest('hex'));
    assert.equal(Object.values(stored).includes(raw), false, 'The raw bearer is never persisted');
    const confirmations = await Promise.allSettled(Array.from({ length: 4 }, () => confirmEmailVerification(raw, db)));
    assert.equal(confirmations.filter(result => result.status === 'fulfilled').length, 1, 'One token has one atomic winner');
    await requireVerifiedEmailForSending(user.id, db);
    await assert.rejects(confirmEmailVerification(raw, db), error => error.code === 'INVALID_VERIFICATION_TOKEN');

    // A pending address change preserves the current login until ownership is proved.
    await db.user.update({ where: { id: user.id }, data: { emailVerificationSentAt: new Date(0) } });
    await db.session.create({ data: { userId: user.id, sessionToken: `synthetic-${suffix}`, expiresAt: new Date(Date.now() + 3600000) } });
    await requestEmailVerification(user.id, { db, deliver, targetEmail: `changed-${suffix}@example.test` });
    assert.equal((await db.user.findUnique({ where: { id: user.id } })).email, user.email);
    assert.equal((await confirmEmailVerification(rawToken(messages.at(-1)), db)).emailChanged, true);
    assert.equal((await db.user.findUnique({ where: { id: user.id } })).email, `changed-${suffix}@example.test`);
    assert.equal(await db.session.count({ where: { userId: user.id } }), 0, 'Changing the login email revokes sessions atomically');

    const pending = await db.user.create({ data: { email: `failed-verify-${suffix}@example.test`, password: 'synthetic-hash', emailVerificationRequiredAt: new Date() } });
    try {
      await requestEmailVerification(pending.id, { db, deliver });
      const working = rawToken(messages.at(-1));
      await db.user.update({ where: { id: pending.id }, data: { emailVerificationSentAt: new Date(0) } });
      let attempts = 0;
      const failure = await requestEmailVerification(pending.id, { db, deliver: async () => { attempts++; throw Object.assign(new Error('Explicit rejection'), { deliveryUncertain: false }); } });
      assert.equal(failure.delivery, 'failed'); assert.equal(attempts, 1);
      await confirmEmailVerification(working, db);
      assert.ok((await db.user.findUnique({ where: { id: pending.id } })).emailVerifiedAt, 'Failed resend preserves the previous working link');
    } finally { await db.user.delete({ where: { id: pending.id } }); }

    const invoice = await db.invoice.create({ data: { userId: user.id, contractorId: 'synthetic-contractor', number: `MANUAL/${suffix}`, type: 'sale', status: 'issued', issueDate: '2026-10-08', saleDate: '2026-10-08', dueDate: '2026-10-22', lines: [] } });
    let sequence = 0;
    const input = (overrides = {}) => ({ userId: user.id, invoiceId: invoice.id, key: `manual-${++sequence}`, requestHash: manualEmailDigest(`payload-${sequence}`), targetHash: manualEmailDigest(`target-${sequence}`), ...overrides });
    const log = { to: 'customer@example.test', subject: 'Invoice', messageBody: 'Synthetic body', provider: 'smtp', attachments: [] };
    const concurrentInput = input();
    const claims = await Promise.allSettled(Array.from({ length: 8 }, () => claimManualEmail(concurrentInput, db)));
    assert.equal(claims.filter(result => result.status === 'fulfilled').length, 1, 'Only one serverless instance can prepare a manual send');
    const lease = claims.find(result => result.status === 'fulfilled').value;
    await startManualEmail(lease, log, db);
    const replay = { success: true, provider: 'smtp', sentToEmail: log.to, sentAt: new Date().toISOString() };
    await finishManualEmail(lease, { status: 'accepted', provider: 'smtp', sentToEmail: log.to, response: replay }, db);
    assert.deepEqual((await claimManualEmail(concurrentInput, db)).replay, replay, 'Response loss replays accepted state without provider contact');
    assert.equal(await db.invoiceEmailLog.count({ where: { id: lease.id, status: 'accepted' } }), 1);
    await assert.rejects(claimManualEmail({ ...concurrentInput, requestHash: 'different-body' }, db), error => error.code === 'IDEMPOTENCY_CONFLICT');

    const definiteInput = input();
    const definiteLease = await claimManualEmail(definiteInput, db); await startManualEmail(definiteLease, log, db);
    await finishManualEmail(definiteLease, { status: 'failed', error: 'Explicit provider refusal' }, db);
    const retry = await claimManualEmail(definiteInput, db);
    assert.notEqual(retry.token, definiteLease.token, 'Definite provider refusal can be explicitly retried with a new owner lease');
    await finishManualEmail(retry, { status: 'failed' }, db);

    const ambiguousInput = input();
    const ambiguousLease = await claimManualEmail(ambiguousInput, db); await startManualEmail(ambiguousLease, log, db);
    await finishManualEmail(ambiguousLease, { status: 'verify_needed', error: 'Provider timeout after DATA' }, db);
    await assert.rejects(claimManualEmail(ambiguousInput, db), error => error.code === 'EMAIL_DELIVERY_UNCERTAIN');
    await assert.rejects(claimManualEmail({ ...ambiguousInput, key: 'fresh-key', requestHash: 'edited-body' }, db), error => error.code === 'EMAIL_DELIVERY_UNCERTAIN');
    const resolved = await resolveManualEmail({ userId: user.id, invoiceId: invoice.id, deliveryId: ambiguousLease.id, result: 'not-sent' }, db);
    assert.equal(resolved.success, false, 'Operator confirmation of not-sent never claims delivery');
    assert.equal((await db.invoiceEmailLog.findUnique({ where: { id: ambiguousLease.id } })).resolutionResult, 'not-sent');
    const afterCheck = await claimManualEmail(ambiguousInput, db);
    await finishManualEmail(afterCheck, { status: 'failed' }, db);

    const interruptedInput = input();
    const interrupted = await claimManualEmail(interruptedInput, db); await startManualEmail(interrupted, log, db);
    await db.manualEmailDelivery.update({ where: { id: interrupted.id }, data: { leaseUntil: new Date(0) } });
    await assert.rejects(claimManualEmail({ ...interruptedInput, key: 'after-restart' }, db), error => error.code === 'EMAIL_DELIVERY_UNCERTAIN');
    assert.equal((await db.manualEmailDelivery.findUnique({ where: { id: interrupted.id } })).status, 'verify_needed');
    assert.equal((await db.invoiceEmailLog.findUnique({ where: { id: interrupted.id } })).status, 'verify_needed');
    const resolutions = await Promise.allSettled(Array.from({ length: 4 }, () => resolveManualEmail({ userId: user.id, invoiceId: invoice.id, deliveryId: interrupted.id, result: 'accepted' }, db)));
    assert.equal(resolutions.filter(result => result.status === 'fulfilled').length, 1, 'One uncertain delivery has one audited operator resolution');
    assert.equal(await db.auditLog.count({ where: { userId: user.id, action: 'invoice_email_delivery_resolved' } }), 2);
    assert.equal((await db.invoiceEmailLog.findUnique({ where: { id: interrupted.id } })).resolutionResult, 'accepted');

    const preparationInput = input();
    const old = await claimManualEmail(preparationInput, db);
    await db.manualEmailDelivery.update({ where: { id: old.id }, data: { leaseUntil: new Date(0) } });
    const fresh = await claimManualEmail(preparationInput, db);
    await assert.rejects(startManualEmail(old, log, db), error => error.code === 'DUPLICATE_REQUEST');
    await startManualEmail(fresh, log, db); await finishManualEmail(fresh, { status: 'accepted', response: replay }, db);
    console.log('[integration] Email proof/manual durable delivery races passed (8 claims, 4 proof attempts, provider failure/restart fences)');
  } finally { await db.auditLog.deleteMany({ where: { userId: user.id } }); await db.user.delete({ where: { id: user.id } }); }
}
