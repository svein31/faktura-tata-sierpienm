import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import bcrypt from 'bcryptjs';
import { expect } from '@playwright/test';

const require = createRequire(import.meta.url);
require('../register-ts.cjs');
const { LEGAL_VERSIONS } = require('../../src/lib/legal/config.ts');

/** Actual invitation UI/API, loopback and synthetic tenants only; no token delivery. */
export async function auditInvitationBrowser(browser, { base, db, outputPath } = {}) {
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname), 'Invitation QA requires an isolated local target');
  const marker = randomBytes(8).toString('hex'), password = 'SyntheticInvite123!', hash = await bcrypt.hash(password, 4);
  const users = [], newEmails = [], contexts = [], checks = [], pageErrors = [];
  const result = { scope: 'isolated-loopback-synthetic', viewport: { width: 390, height: 844 }, checks };
  const user = async label => {
    const actor = await db.user.create({ data: { email: `invitation-browser-${label}-${marker}@example.invalid`, password: hash, name: `Zaproszenie Żółć ${label}`, termsAcceptedAt: new Date(), termsAcceptedVersion: LEGAL_VERSIONS.terms } });
    users.push(actor); return actor;
  };
  const context = async actor => {
    const target = await browser.newContext({ baseURL: base, viewport: result.viewport, reducedMotion: 'reduce', serviceWorkers: 'block', extraHTTPHeaders: { Origin: base } });
    contexts.push(target); target.setDefaultTimeout(15000); target.setDefaultNavigationTimeout(30000);
    await target.addInitScript(() => { localStorage.setItem('fakturo_onboarding_completed_v2', 'true'); });
    if (actor) {
      const token = randomBytes(32).toString('base64url');
      await db.session.create({ data: { userId: actor.id, sessionToken: 'sha256:' + createHash('sha256').update(token).digest('hex'), authenticatedAt: new Date(), expiresAt: new Date(Date.now() + 3600000) } });
      await target.addCookies([{ name: 'auth_session', value: token, url: base, httpOnly: true, sameSite: 'Lax' }]);
    }
    const page = await target.newPage(); page.on('pageerror', error => pageErrors.push(error.message));
    return { target, page };
  };
  const open = async (page, invitation) => {
    await page.goto('/invite/' + invitation.token);
    await expect(page.getByRole('heading', { name: 'Zaproszenie do zespołu', exact: true })).toBeVisible();
    await expect(page.getByText('Weryfikacja zaproszenia...', { exact: true })).toHaveCount(0);
    const reject = page.getByRole('button', { name: 'Odrzuć opcjonalne', exact: true });
    if (await reject.isVisible()) await reject.click();
  };
  try {
    const owner = await user('owner');
    const company = await db.companyProfile.create({ data: { userId: owner.id, nip: '5260301706', companyName: `Firma zapraszająca Żółć ${marker}` } });
    const invite = email => db.teamInvitation.create({ data: { companyId: company.id, userId: owner.id, email, role: 'employee', token: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 3600000), status: 'pending' } });
    const submit = async (page, invitation, name) => {
      const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/invite/' + invitation.token && response.request().method() === 'POST');
      await page.getByRole('button', { name, exact: true }).click();
      const response = await responsePromise; return { response, data: await response.json() };
    };
    const assertJoined = async (page, actor) => {
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(page.locator('main h1').first()).toBeVisible();
      await expect(page.locator('header').getByRole('button', { name: /(?:Wybierz firmę:|Ustawienia firmy:)/ })).toContainText(company.companyName);
      assert.ok(await db.companyMember.findUnique({ where: { companyId_userId: { companyId: company.id, userId: actor.id } } }));
    };

    const existing = await user('existing');
    await db.companyProfile.create({ data: { userId: existing.id, nip: '5250001003', companyName: 'Dotychczasowa firma odbiorcy', isDefault: true } });
    const existingInvite = await invite(existing.email), anonymous = await context();
    await open(anonymous.page, existingInvite);
    await expect(anonymous.page.getByText(company.companyName, { exact: true })).toBeVisible();
    await expect(anonymous.page.getByText('Pracownik / Sprzedawca', { exact: true })).toBeVisible();
    await expect(anonymous.page.getByLabel('Wpisz hasło do swojego konta', { exact: true })).toBeVisible();
    await expect(anonymous.page.getByRole('checkbox')).toHaveCount(0);
    await anonymous.page.getByLabel('Wpisz hasło do swojego konta', { exact: true }).fill('SyntheticWrong123!');
    const wrong = await submit(anonymous.page, existingInvite, 'Zaloguj się i dołącz');
    assert.equal(wrong.response.status(), 401);
    await expect(anonymous.page.getByRole('alert').filter({ hasText: 'Nieprawidłowe hasło.' })).toBeVisible();
    assert.equal((await db.teamInvitation.findUnique({ where: { id: existingInvite.id } })).status, 'pending');
    checks.push('Valid flat GET DTO renders company, role and existing-account form; wrong password shows error without consuming invitation');
    await anonymous.page.getByLabel('Wpisz hasło do swojego konta', { exact: true }).fill(password);
    const accepted = await submit(anonymous.page, existingInvite, 'Zaloguj się i dołącz');
    assert.equal(accepted.response.status(), 200, JSON.stringify(accepted.data));
    assert.equal(accepted.data.companyId, company.id);
    await assertJoined(anonymous.page, existing);
    assert.ok((await anonymous.target.cookies()).some(cookie => cookie.name === 'auth_session'));
    assert.equal(await db.legalConsent.count({ where: { userId: existing.id, context: 'invite_accept' } }), 0);
    checks.push('Existing anonymous recipient logs in, joins, receives session and selects response companyId over a previous default company');

    const newEmail = `invitation-browser-new-${marker}@example.invalid`; newEmails.push(newEmail);
    const newInvite = await invite(newEmail), fresh = await context();
    await open(fresh.page, newInvite);
    await fresh.page.getByLabel('Twoje imię i nazwisko', { exact: true }).fill('Nowy użytkownik Łódź Żółć');
    await fresh.page.getByLabel('Utwórz hasło do nowego konta', { exact: true }).fill(password);
    const postRequests = [];
    fresh.page.on('request', request => { if (new URL(request.url()).pathname === '/api/invite/' + newInvite.token && request.method() === 'POST') postRequests.push(request); });
    await fresh.page.getByRole('button', { name: 'Załóż konto i dołącz', exact: true }).click();
    assert.equal(postRequests.length, 0, 'Missing terms must be blocked before POST');
    assert.equal(await db.user.findUnique({ where: { email: newEmail } }), null);
    await expect.poll(() => fresh.page.getByRole('checkbox').evaluate(element => element.validity.valueMissing)).toBe(true);
    await fresh.page.getByRole('checkbox').check();
    const registered = await submit(fresh.page, newInvite, 'Załóż konto i dołącz');
    assert.equal(registered.response.status(), 200, JSON.stringify(registered.data));
    const created = await db.user.findUniqueOrThrow({ where: { email: newEmail } });
    await assertJoined(fresh.page, created);
    assert.equal(created.name, 'Nowy użytkownik Łódź Żółć'); assert.ok(created.emailVerificationRequiredAt);
    const proof = await db.legalConsent.findMany({ where: { userId: created.id, context: 'invite_accept' } });
    assert.equal(proof.length, 1); assert.equal(proof[0].accepted, true); assert.equal(proof[0].documentVersion, LEGAL_VERSIONS.terms);
    checks.push('New recipient cannot submit without terms; explicit checked terms create account, legal proof and company membership through the real API');

    const recipient = await user('foreign-recipient'), outsider = await user('wrong-account');
    const foreignInvite = await invite(recipient.email), foreign = await context(outsider);
    await open(foreign.page, foreignInvite);
    await expect(foreign.page.getByText('Niezgodność adresu e-mail', { exact: true })).toBeVisible();
    await expect(foreign.page.getByText(outsider.email, { exact: true })).toBeVisible();
    await expect(foreign.page.getByText(recipient.email, { exact: true })).toBeVisible();
    await expect(foreign.page.getByRole('button', { name: 'Wyloguj się i dołącz z właściwego konta', exact: true })).toBeVisible();
    await expect(foreign.page.locator('form')).toHaveCount(0);
    const forbidden = await foreign.target.request.post('/api/invite/' + foreignInvite.token, { data: {} });
    assert.equal(forbidden.status(), 403);
    assert.equal((await db.teamInvitation.findUnique({ where: { id: foreignInvite.id } })).status, 'pending');
    assert.equal(await db.companyMember.count({ where: { companyId: company.id, userId: outsider.id } }), 0);
    assert.equal(await db.companyMember.count({ where: { companyId: company.id, userId: recipient.id } }), 0);
    checks.push('Authenticated wrong account sees explicit email mismatch and no acceptance form; server denies forged acceptance without membership or invitation consumption');

    assert.deepEqual(pageErrors, [], 'Invitation workflows must not throw JavaScript errors');
    result.status = 'passed';
    if (outputPath) await writeFile(outputPath, JSON.stringify(result, null, 2) + '\n');
    console.log(`[invitation-browser] PASS ${checks.length} synthetic invitation interaction scenarios`);
    return result;
  } catch (error) {
    result.status = 'failed'; result.error = error.message; result.pageErrors = pageErrors;
    if (outputPath) await writeFile(outputPath, JSON.stringify(result, null, 2) + '\n');
    throw error;
  } finally {
    for (const target of contexts) await target.close();
    for (const email of newEmails) { const created = await db.user.findUnique({ where: { email } }); if (created) await db.user.delete({ where: { id: created.id } }); }
    for (const actor of users.reverse()) await db.user.delete({ where: { id: actor.id } });
  }
}
