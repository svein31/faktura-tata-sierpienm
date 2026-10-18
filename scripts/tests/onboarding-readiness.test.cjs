const test = require('node:test');
const assert = require('node:assert/strict');
require('../register-ts.cjs');
const { onboardingReadiness, onboardingPreferenceKey } = require('../../src/components/onboarding/progress.ts');
const { hasCompletedOnboarding, markOnboardingSeen } = require('../../src/components/onboarding/events.ts');

const company = {
  id: 'company-a', userId: 'owner', companyName: 'Pracownia', nip: '5261040828',
  street: 'Testowa 1', city: 'Warszawa', postalCode: '00-001',
  currentUserRole: 'owner', ksefTokenSet: false, ksefEnvironment: 'demo',
};
const ksef = { environment: 'demo', tokenSet: false, certName: '', autoValidate: true };
const doc = { id: 'document-a', number: 'FV/1', companyId: 'company-a' };
function setStorage(t, value) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage; });
}

test('company readiness requires real saved identity and address, not only any NIP', () => {
  assert.equal(onboardingReadiness(company, ksef).companyReady, true);
  for (const patch of [{ id: '' }, { nip: '0000000000' }, { nip: '5261040829' }, { companyName: ' ' }, { street: '' }, { city: ' ' }, { postalCode: '' }]) {
    assert.equal(onboardingReadiness({ ...company, ...patch }, ksef).companyReady, false, JSON.stringify(patch));
  }
  assert.equal(onboardingReadiness({ ...company, bankAccount: '' }, ksef).companyReady, true, 'a bank account is not mandatory for cash payments');
});

test('a document from another company cannot complete the document step or expose a preview link', () => {
  assert.equal(onboardingReadiness(company, ksef, doc).savedDocument, doc);
  assert.equal(onboardingReadiness({ ...company, id: 'company-b' }, ksef, doc).savedDocument, null);
  assert.equal(onboardingReadiness(null, ksef, doc).savedDocument, null);
  assert.equal(onboardingReadiness(company, ksef, { ...doc, id: '' }).savedDocument, null);
});

test('a certificate description or account-level token does not claim company authentication', () => {
  const result = onboardingReadiness(company, { ...ksef, tokenSet: true, certName: 'Mój certyfikat' });
  assert.equal(result.tokenSaved, false);
  assert.equal(onboardingReadiness({ ...company, ksefTokenSet: true }, ksef).tokenSaved, true);
});

test('company environment takes precedence and never promotes a test token to production', () => {
  assert.equal(onboardingReadiness(company, { ...ksef, environment: 'production' }).environment, 'demo');
  assert.equal(onboardingReadiness({ ...company, ksefEnvironment: 'test', ksefTokenSet: true }, ksef).environment, 'test');
});

test('owner and explicit member grants determine creation/integration actions separately', () => {
  assert.equal(onboardingReadiness(company, ksef).canCreate, true);
  assert.equal(onboardingReadiness(company, ksef).canManageKsef, true);
  const viewer = { ...company, currentUserRole: 'viewer', currentUserPermissions: { canIssueInvoices: false, canManageIntegrations: false } };
  assert.equal(onboardingReadiness(viewer, ksef).canCreate, false);
  assert.equal(onboardingReadiness(viewer, ksef).canManageKsef, false);
  assert.equal(onboardingReadiness({ ...viewer, currentUserPermissions: { canIssueInvoices: true } }, ksef).canCreate, true);
  assert.equal(onboardingReadiness({ ...viewer, currentUserPermissions: { canIssueInvoices: true } }, ksef).canManageKsef, false);
  assert.equal(onboardingReadiness(null, ksef).canCreate, false);
});

test('guide and banner preferences are distinct per account and company with no anonymous shared fallback', () => {
  const first = onboardingPreferenceKey('guide-seen', 'user-a', 'company-a');
  assert.notEqual(first, onboardingPreferenceKey('guide-seen', 'user-b', 'company-a'));
  assert.notEqual(first, onboardingPreferenceKey('guide-seen', 'user-a', 'company-b'));
  assert.notEqual(first, onboardingPreferenceKey('banner-dismissed', 'user-a', 'company-a'));
  assert.notEqual(onboardingPreferenceKey('guide-seen', 'a:b', 'c'), onboardingPreferenceKey('guide-seen', 'a', 'b:c'));
  assert.equal(onboardingPreferenceKey('guide-seen', '', 'company-a'), null);
});

test('closing a guide never completes setup and its seen flag does not bleed across identities', t => {
  const data = new Map();
  setStorage(t, { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) });
  markOnboardingSeen('user-a', 'company-a');
  assert.equal(hasCompletedOnboarding('user-a', 'company-a'), true);
  assert.equal(hasCompletedOnboarding('user-b', 'company-a'), false);
  assert.equal(hasCompletedOnboarding('user-a', 'company-b'), false);
  assert.equal(onboardingReadiness(null, null).companyReady, false);
  assert.equal(onboardingReadiness(null, null).savedDocument, null);
  markOnboardingSeen('', 'company-a');
  assert.equal(data.size, 1);
});

test('blocked browser storage leaves the guide usable and makes no completion claim', t => {
  setStorage(t, { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
  assert.doesNotThrow(() => markOnboardingSeen('user-a', 'company-a'));
  assert.equal(hasCompletedOnboarding('user-a', 'company-a'), false);
});
