import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';

/** Acceptance proof on loopback with synthetic tenants only; token delivery/providers are never used. */
export async function checkInvitationProofHttp(base, db) {
  assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
  const users = [], suffix = randomBytes(8).toString('hex'), password = 'SyntheticInvite123!';
  const hash = await bcrypt.hash(password, 4);
  try {
    const owner = await db.user.create({ data: { email: `invite-owner-${suffix}@example.invalid`, password: hash } }); users.push(owner);
    const company = await db.companyProfile.create({ data: { userId: owner.id, nip: '5260301706', companyName: 'Synthetic invitation QA' } });
    const createRecipient = async label => { const user = await db.user.create({ data: { email: `invite-${label}-${suffix}@example.invalid`, password: hash } }); users.push(user); return user; };
    const createInvite = (email, userId = owner.id) => db.teamInvitation.create({ data: { companyId: company.id, userId, email, role: 'employee', token: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 3600000), status: 'pending' } });
    const accept = async (invitation, body, cookie) => {
      const response = await fetch(base + '/api/invite/' + invitation.token, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
      return { response, data: await response.json() };
    };
    const anonymous = await createRecipient('anonymous'), anonymousInvite = await createInvite(anonymous.email);
    const accepted = await accept(anonymousInvite, { password });
    assert.equal(accepted.response.status, 200, JSON.stringify(accepted.data));
    assert.ok(accepted.response.headers.getSetCookie().some(cookie => cookie.startsWith('auth_session=')));
    assert.ok(await db.companyMember.findUnique({ where: { companyId_userId: { companyId: company.id, userId: anonymous.id } } }));
    assert.equal((await db.teamInvitation.findUnique({ where: { id: anonymousInvite.id } })).status, 'accepted');
    const sessionsBeforeReplay = await db.session.count({ where: { userId: anonymous.id } });
    assert.equal((await accept(anonymousInvite, { password })).response.status, 400);
    assert.equal(await db.session.count({ where: { userId: anonymous.id } }), sessionsBeforeReplay);
    assert.equal(await db.companyMember.count({ where: { companyId: company.id, userId: anonymous.id } }), 1);
    assert.equal(await db.legalConsent.count({ where: { userId: anonymous.id, context: 'invite_accept' } }), 0, 'Existing account acceptance must not fabricate new terms consent');
    const authenticated = await createRecipient('authenticated'), loggedInvite = await createInvite(authenticated.email), bearer = randomBytes(32).toString('base64url');
    await db.session.create({ data: { userId: authenticated.id, sessionToken: 'sha256:' + createHash('sha256').update(bearer).digest('hex'), expiresAt: new Date(Date.now() + 3600000) } });
    const logged = await accept(loggedInvite, {}, 'auth_session=' + bearer);
    assert.equal(logged.response.status, 200, JSON.stringify(logged.data));
    assert.equal(logged.response.headers.get('set-cookie'), null);
    const foreignRecipient = await createRecipient('foreign-owner'), foreignInvite = await createInvite(foreignRecipient.email);
    assert.equal((await accept(foreignInvite, {}, 'auth_session=' + bearer)).response.status, 403);
    assert.equal((await db.teamInvitation.findUnique({ where: { id: foreignInvite.id } })).status, 'pending');
    assert.equal(await db.companyMember.count({ where: { companyId: company.id, userId: foreignRecipient.id } }), 0);
    const mfa = await createRecipient('mfa'), mfaInvite = await createInvite(mfa.email);
    await db.userMfa.create({ data: { userId: mfa.id, encryptedSecret: 'synthetic-not-a-secret', enabledAt: new Date(), recoveryHashes: [] } });
    assert.equal((await accept(mfaInvite, { password })).response.status, 403);
    assert.equal((await db.teamInvitation.findUnique({ where: { id: mfaInvite.id } })).status, 'pending');
    assert.equal(await db.companyMember.count({ where: { companyId: company.id, userId: mfa.id } }), 0);
    const issuer = await createRecipient('former-admin'), rejectedRecipient = await createRecipient('issuer-revoked');
    const member = await db.companyMember.create({ data: { companyId: company.id, userId: issuer.id, role: 'admin', canManageTeam: true } });
    const revokedInvite = await createInvite(rejectedRecipient.email, issuer.id);
    await db.companyMember.update({ where: { id: member.id }, data: { role: 'viewer', canManageTeam: false } });
    assert.equal((await accept(revokedInvite, { password })).response.status, 403);
    assert.equal((await db.teamInvitation.findUnique({ where: { id: revokedInvite.id } })).status, 'pending');
    assert.equal(await db.companyMember.count({ where: { companyId: company.id, userId: rejectedRecipient.id } }), 0);
    const newEmail = `invite-new-${suffix}@example.invalid`, newInvite = await createInvite(newEmail);
    for (const acceptTerms of [undefined, false, 'true', 1]) {
      const missingTerms = await accept(newInvite, { password, name: 'Nowy użytkownik Żółć', acceptTerms });
      assert.equal(missingTerms.response.status, 400, JSON.stringify(missingTerms.data));
      assert.equal(missingTerms.data.code, 'TERMS_NOT_ACCEPTED');
      assert.equal(await db.user.findUnique({ where: { email: newEmail } }), null, 'No account may be created before explicit terms acceptance');
      assert.equal((await db.teamInvitation.findUnique({ where: { id: newInvite.id } })).status, 'pending');
    }
    const newAccepted = await accept(newInvite, { password, name: 'Nowy użytkownik Żółć', acceptTerms: true });
    assert.equal(newAccepted.response.status, 200, JSON.stringify(newAccepted.data));
    const created = await db.user.findUnique({ where: { email: newEmail } }); users.push(created);
    assert.ok(created.emailVerificationRequiredAt, 'Every newly created account requires email proof before external sending');
    assert.equal(created.emailVerifiedAt, null);
    assert.ok(created.termsAcceptedAt);
    const consents = await db.legalConsent.findMany({ where: { userId: created.id } });
    assert.equal(consents.length, 1); assert.equal(consents[0].context, 'invite_accept');
    assert.equal(consents[0].documentType, 'terms_of_service'); assert.equal(consents[0].accepted, true);
    assert.equal(consents[0].documentVersion, created.termsAcceptedVersion); assert.equal(consents[0].companyId, company.id);
    const revokedNewEmail = `invite-revoked-new-${suffix}@example.invalid`, revokedNewInvite = await createInvite(revokedNewEmail, issuer.id);
    const revokedNew = await accept(revokedNewInvite, { password, name: 'Odmowa nowego użytkownika', acceptTerms: true });
    assert.equal(revokedNew.response.status, 403, JSON.stringify(revokedNew.data));
    assert.equal(await db.user.findUnique({ where: { email: revokedNewEmail } }), null, 'Revoked issuer must roll back account and legal proof creation');
    assert.equal((await db.teamInvitation.findUnique({ where: { id: revokedNewInvite.id } })).status, 'pending');
    console.log('[invitation-audit] PASS: anonymous existing/new and authenticated recipients; MFA/issuer revocation and replay safety; strict new-account terms/current legal proof; account/consent/grant rollback; mailbox proof');
  } finally { for (const user of users.reverse()) if (user) await db.user.delete({ where: { id: user.id } }); }
}

export const checkInvitationAcceptanceHttp = checkInvitationProofHttp;
