import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { expect } from '@playwright/test';

const require = createRequire(import.meta.url);
require('../register-ts.cjs');
const { LEGAL_VERSIONS } = require('../../src/lib/legal/config.ts');

/** Real team page and invitation API; synthetic local tenant; clipboard is controlled. */
export async function auditTeamClipboardBrowser(browser, { base, db, outputPath } = {}) {
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname), 'Team clipboard QA requires an isolated local target');
  const marker = randomBytes(8).toString('hex'), contexts = [], checks = [], pageErrors = [];
  const result = { scope: 'isolated-loopback-synthetic', viewport: { width: 390, height: 844 }, checks };
  const owner = await db.user.create({ data: {
    email: `team-clipboard-owner-${marker}@example.invalid`, password: 'unusable-synthetic-fixture', name: 'Test schowka Żółć',
    termsAcceptedAt: new Date(), termsAcceptedVersion: LEGAL_VERSIONS.terms,
    // Sending is forbidden for this synthetic account, independently of provider configuration.
    emailVerificationRequiredAt: new Date(), emailVerifiedAt: null,
  } });
  let company;
  try {
    company = await db.companyProfile.create({ data: { userId: owner.id, nip: '5260301706', companyName: 'Test schowka zespołu', isDefault: true } });
    for (const scenario of ['denied', 'unavailable', 'success']) {
      const context = await browser.newContext({ baseURL: base, viewport: result.viewport, reducedMotion: 'reduce', serviceWorkers: 'block', extraHTTPHeaders: { Origin: base } });
      contexts.push(context); context.setDefaultTimeout(15000); context.setDefaultNavigationTimeout(30000);
      await context.addInitScript(() => { localStorage.setItem('fakturo_onboarding_completed_v2', 'true'); });
      const token = randomBytes(32).toString('base64url');
      await db.session.create({ data: { userId: owner.id, sessionToken: 'sha256:' + createHash('sha256').update(token).digest('hex'), authenticatedAt: new Date(), expiresAt: new Date(Date.now() + 3600000) } });
      await context.addCookies([{ name: 'auth_session', value: token, url: base, httpOnly: true, sameSite: 'Lax' }]);
      const page = await context.newPage(); page.on('pageerror', error => pageErrors.push(error.message));
      await page.goto('/settings/team');
      await page.waitForFunction(() => document.documentElement.dataset.uiReady === 'true');
      const reject = page.getByRole('button', { name: 'Odrzuć opcjonalne', exact: true });
      if (await reject.isVisible()) await reject.click();
      const email = `team-clipboard-${scenario}-${marker}@example.invalid`;
      await page.getByPlaceholder('ksiegowa@twojafirma.pl', { exact: true }).fill(email);
      const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/team' && response.request().method() === 'POST');
      await page.getByRole('button', { name: 'Wyślij zaproszenie', exact: true }).click();
      const response = await responsePromise, data = await response.json();
      assert.equal(response.status(), 200, JSON.stringify(data));
      assert.equal(data.emailDelivery, 'verification_required', 'Synthetic invitation must not be delivered externally');
      assert.match(data.inviteUrl, /^\/invite\/[a-f0-9]{64}$/);
      assert.equal(await db.teamInvitation.count({ where: { companyId: company.id, email, status: 'pending' } }), 1);
      const row = page.locator('.divide-y > div').filter({ hasText: email });
      const copy = row.getByRole('button', { name: 'Kopiuj link', exact: true });
      await expect(copy).toBeEnabled();
      await page.evaluate(mode => {
        window.__qaCopiedInvitationLinks = [];
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: mode === 'unavailable' ? undefined : {
          writeText: value => {
            if (mode === 'denied') return Promise.reject(new DOMException('Synthetic clipboard denied', 'NotAllowedError'));
            window.__qaCopiedInvitationLinks.push(value);
            return new Promise(resolve => { window.__qaResolveInvitationCopy = resolve; });
          },
        } });
      }, scenario);
      await copy.click();
      if (scenario === 'success') {
        await expect.poll(() => page.evaluate(() => window.__qaCopiedInvitationLinks.length)).toBe(1);
        assert.deepEqual(await page.evaluate(() => window.__qaCopiedInvitationLinks), [new URL(data.inviteUrl, base).href]);
        await expect(row.getByRole('button', { name: 'Skopiowano', exact: true })).toHaveCount(0);
        await expect(page.getByText('Skopiowano link', { exact: true })).toHaveCount(0);
        await page.evaluate(() => window.__qaResolveInvitationCopy());
        await expect(row.getByRole('button', { name: 'Skopiowano', exact: true })).toBeVisible();
        await expect(page.getByText('Skopiowano link', { exact: true })).toBeVisible();
        checks.push('Successful clipboard write receives the actual API invitation URL; copied state and success appear only after the write resolves');
      } else {
        await expect(page.getByText('Nie udało się skopiować linku', { exact: true })).toBeVisible();
        await expect(copy).toHaveText('Kopiuj link');
        await expect(row.getByRole('button', { name: 'Skopiowano', exact: true })).toHaveCount(0);
        await expect(page.getByText('Skopiowano link', { exact: true })).toHaveCount(0);
        await page.waitForTimeout(100);
        checks.push(`${scenario === 'denied' ? 'Denied' : 'Unavailable'} clipboard shows an explicit error without copied state, success notification or unhandled rejection`);
      }
      assert.deepEqual(pageErrors, [], 'Team clipboard scenarios must not throw browser errors');
      await context.close();
    }
    result.status = 'passed';
    if (outputPath) await writeFile(outputPath, JSON.stringify(result, null, 2) + '\n');
    console.log(`[team-clipboard-browser] PASS ${checks.length} synthetic clipboard scenarios`);
    return result;
  } catch (error) {
    result.status = 'failed'; result.error = error.message; result.pageErrors = pageErrors;
    if (outputPath) await writeFile(outputPath, JSON.stringify(result, null, 2) + '\n');
    throw error;
  } finally {
    for (const context of contexts) await context.close();
    if (company) await db.auditLog.deleteMany({ where: { companyId: company.id } });
    await db.user.delete({ where: { id: owner.id } });
  }
}
