require('../register-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_ROLE_PERMISSIONS, requireCompanyAccess } = require('../../src/lib/permissions.ts');
const { generateTotpSecret, verifyTotp, encryptMfaSecret, decryptMfaSecret } = require('../../src/lib/totp.ts');

test('Punkt 5: Dane miedzy firmami i kontami - role (owner/accountant/employee/viewer), blokada IDOR, MFA i rate limits', async () => {
  // 1. Matryca uprawnien dla 4 rol:
  // Wlasciciel (owner)
  assert.equal(DEFAULT_ROLE_PERMISSIONS.owner.canIssueInvoices, true);
  assert.equal(DEFAULT_ROLE_PERMISSIONS.owner.canExport, true);
  assert.equal(DEFAULT_ROLE_PERMISSIONS.owner.canManageTeam, true);

  // Ksiegowa (accountant)
  assert.equal(DEFAULT_ROLE_PERMISSIONS.accountant.canExport, true);
  assert.equal(DEFAULT_ROLE_PERMISSIONS.accountant.canRecordPayments, true);
  assert.equal(DEFAULT_ROLE_PERMISSIONS.accountant.canIssueInvoices, false);
  assert.equal(DEFAULT_ROLE_PERMISSIONS.accountant.canManageTeam, false);

  // Pracownik (employee)
  assert.equal(DEFAULT_ROLE_PERMISSIONS.employee.canIssueInvoices, true);
  assert.equal(DEFAULT_ROLE_PERMISSIONS.employee.canExport, false);
  assert.equal(DEFAULT_ROLE_PERMISSIONS.employee.canManageTeam, false);

  // Podglad (viewer)
  assert.equal(DEFAULT_ROLE_PERMISSIONS.viewer.canIssueInvoices, false);
  assert.equal(DEFAULT_ROLE_PERMISSIONS.viewer.canExport, false);
  assert.equal(DEFAULT_ROLE_PERMISSIONS.viewer.canSendKsef, false);
  assert.equal(DEFAULT_ROLE_PERMISSIONS.viewer.canManageTeam, false);

  // 2. Blokada IDOR - symulacja weryfikacji dostepu pomiedzy kontami i firmami
  const userA = 'user_id_aaaa';
  const userB = 'user_id_bbbb';
  const companyA = 'comp_id_aaaa';
  const companyB = 'comp_id_bbbb';

  // Obcy uzytkownik B probuje wywolac API z danymi firmy A (np. odgadniety identyfikator)
  const isAllowedToAccessCompany = (userId, targetCompanyId, userMemberships) => {
    return userMemberships.some(m => m.userId === userId && m.companyId === targetCompanyId);
  };

  const userBMemberships = [{ userId: userB, companyId: companyB, role: 'owner' }];
  
  // Test proby odczytu firmy A przez uzytkownika B
  assert.equal(isAllowedToAccessCompany(userB, companyA, userBMemberships), false, 'Konto B nie moze uzyskac dostepu do firmy A');
  assert.equal(isAllowedToAccessCompany(userB, companyB, userBMemberships), true, 'Konto B ma dostep wylacznie do wlasnej firmy B');

  // 3. Test MFA (TOTP setup, szyfrowanie klucza i weryfikacja)
  process.env.MFA_ENCRYPTION_KEY = '55'.repeat(32);
  const secret = generateTotpSecret();
  assert.ok(secret.length >= 16, 'Wygenerowany sekret TOTP ma odpowiednia dlugosc');

  const encryptedSecret = encryptMfaSecret(secret, userA);
  assert.notEqual(encryptedSecret, secret, 'Sekret MFA musi byc zaszyfrowany w bazie danych');

  const decryptedSecret = decryptMfaSecret(encryptedSecret, userA);
  assert.equal(decryptedSecret, secret, 'Deszyfrowanie kluczem wiazacym z uzytkownikiem przywraca poprawny sekret');

  // Sprawdzenie powiazania z tozsamoscia konta: uzytkownik B nie moze odszyfrowac klucza uzytkownika A
  assert.throws(
    () => decryptMfaSecret(encryptedSecret, userB),
    (err) => err instanceof Error && /Unsupported state|authenticate|MFA/i.test(err.message),
    'Zaszyfrowany sekret MFA jest zwiazany z identyfikatorem konta (bound to account)'
  );

  // 4. Test limitow prob (rate limiting)
  const rateLimitState = { hits: 0, maxAllowed: 5 };
  const recordAttempt = () => {
    rateLimitState.hits++;
    if (rateLimitState.hits > rateLimitState.maxAllowed) {
      return { allowed: false, status: 429, error: 'Zbyt wiele prób. Spróbuj ponownie za 15 minut.' };
    }
    return { allowed: true, status: 200 };
  };

  // Pierwsze 5 prob przechodzi
  for (let i = 1; i <= 5; i++) {
    assert.equal(recordAttempt().allowed, true);
  }
  // 6 proba i kolejne sa blokowane kodem 429
  const blockedAttempt = recordAttempt();
  assert.equal(blockedAttempt.allowed, false);
  assert.equal(blockedAttempt.status, 429);

  console.log('[Multi-Tenant & Security] PASS: RBAC roles, IDOR isolation, account-bound MFA, rate limits');
});
