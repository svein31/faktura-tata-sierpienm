import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { recordBrowserScenario } from './browser-control-inventory.mjs';

/** No account mutations: the reset request is intercepted and receives a marked negative-test response. */
export async function auditPasswordResetLinks(publicPage, engine) {
  const token = 'a'.repeat(64), requests = [];
  const handler = async route => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ status: 400, contentType: 'application/json', headers: { 'x-qa-fixture': 'password-reset-invalid-token' }, body: JSON.stringify({ error: 'Kontrolowany nieprawidłowy link testowy QA.' }) });
  };
  await publicPage.route('**/api/auth/reset-password', handler);
  try {
    for (const [name, path] of [['fragment', `/reset-password#token=${token}`], ['legacy-query', `/reset-password?token=${token}&email=za%C5%BC%C3%B3%C5%82%C4%87%40example.invalid`]]) {
      const response = await publicPage.goto(path);
      assert.equal(response.status(), 200);
      assert.equal(response.headers()['referrer-policy'], 'no-referrer');
      await expect(publicPage).toHaveURL(/\/reset-password$/);
      assert.equal(await publicPage.locator('meta[name="referrer"]').getAttribute('content'), 'no-referrer');
      await expect(publicPage.getByRole('button', { name: 'Zapisz nowe hasło' })).toBeEnabled();
      await publicPage.getByLabel('Nowe hasło (min. 8 znaków)', { exact: true }).fill('SyntheticPassword123!');
      await publicPage.getByLabel('Powtórz nowe hasło', { exact: true }).fill('SyntheticPassword123!');
      await publicPage.getByRole('button', { name: 'Zapisz nowe hasło' }).click();
      await expect(publicPage.getByRole('alert').filter({ hasText: 'Kontrolowany nieprawidłowy link' })).toContainText('Kontrolowany nieprawidłowy link');
      assert.equal(requests.at(-1).token, token, 'Removing the URL credential must preserve the form token');
      recordBrowserScenario({ engine }, 'password-reset-' + name, { route: '/reset-password', queryAndFragmentRemoved: true, tokenPreservedForSubmission: true, expectedApiStatus: 400 });
    }
    await publicPage.goto('/reset-password');
    await expect(publicPage.getByRole('button', { name: 'Zapisz nowe hasło' })).toBeDisabled();
    await expect(publicPage.getByText('Brak tokena resetującego.', { exact: false })).toBeVisible();
    assert.equal(requests.length, 2);
    recordBrowserScenario({ engine }, 'password-reset-missing-link-disabled', { route: '/reset-password', apiRequests: 0 });
  } finally { await publicPage.unroute('**/api/auth/reset-password', handler); }
}
