require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict'), Module = require('node:module');
const { ApiError } = require('../../src/lib/api.ts');
const secret = 'synthetic-db-password-and-private-invoice-body';
const privateError = () => Object.assign(new Error(`mongodb://synthetic:${secret}@example.invalid/private?invoice=${secret}`), { code: 'P2034' });
function fixture(options = {}) {
  const calls = { provider: 0, finishes: [], logs: [] }, originalLoad = Module._load;
  const mocks = {
    '@/lib/auth': { getSessionUser: async () => ({ id: 'a'.repeat(24), email: 'qa@example.invalid' }) },
    '@/lib/db': { prisma: {} }, '@/lib/company-scope': {}, '@/lib/document-scope': {}, '@/lib/dto': {},
    '@/lib/email/invoice-template': { buildEmailHtml: () => '<p>Synthetic invoice</p>' },
    '@/lib/email/auto-send': {}, '@/lib/email/verification': { requireVerifiedEmailForSending: async () => {} },
    '@/lib/rate-limit': { rateLimitSubject: async () => ({ allowed: true }) },
    '@/lib/email/manual-delivery': {
      DELIVERY_UNCERTAIN_MESSAGE: 'Nie można potwierdzić wyniku wysyłki. Sprawdź historię u dostawcy poczty.',
      manualEmailDigest: () => 'synthetic-hash',
      claimManualEmail: async () => { if (Object.hasOwn(options, 'claimError')) throw options.claimError; return { id: 'b'.repeat(24), userId: 'a'.repeat(24), token: 'synthetic-lease' }; },
      startManualEmail: async () => { if (options.startError) throw options.startError; },
      finishManualEmail: async (_lease, result) => { calls.finishes.push(result); },
    },
    '@/lib/email/sender': {
      getEmailConfigStatus: () => ({ configured: true, provider: 'synthetic' }),
      isValidEmail: value => value.endsWith('@example.invalid'), parseEmailList: value => value ? value.split(',') : [],
      sendEmail: async () => { calls.provider++; if (options.providerError) throw options.providerError; return { success: true, provider: 'synthetic' }; },
    },
  };
  Module._load = function(request, parent, isMain) { return Object.hasOwn(mocks, request) ? mocks[request] : originalLoad.call(this, request, parent, isMain); };
  try {
    const path = require.resolve('../../src/app/api/invoices/send-email/route.ts'); delete require.cache[path];
    return { route: require(path), calls };
  } finally { Module._load = originalLoad; }
}
async function invoke(f) {
  const originalError = console.error;
  console.error = (...args) => f.calls.logs.push(args);
  try {
    const response = await f.route.POST(new Request('http://localhost/api/invoices/send-email', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientEmail: 'recipient@example.invalid', attachPdf: false, invoice: { number: 'QA/EMAIL/1', lines: [] } }),
    }));
    return { response, body: await response.json() };
  } finally { console.error = originalError; }
}
test('email handler never exposes an unknown database exception or contacts SMTP before claiming delivery', async () => {
  for (const claimError of [privateError(), null]) {
    const f = fixture({ claimError }), { response, body } = await invoke(f);
    assert.equal(response.status, 500); assert.equal(body.error, 'EMAIL_SEND_FAILED');
    assert.equal(body.message, body.details); assert.ok(body.message.length > 0);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(f.calls.provider, 0); assert.equal(f.calls.finishes.length, 0);
    assert.doesNotMatch(JSON.stringify({ body, logs: f.calls.logs }), /synthetic-db-password|mongodb:|private-invoice-body/);
    assert.ok(f.calls.logs.every(args => args.every(value => typeof value === 'string')), 'Log identity only, never an exception object or stack');
  }
});
test('email preparation failure stores only a public safe message and never contacts SMTP', async () => {
  const f = fixture({ startError: privateError() }), { response, body } = await invoke(f);
  assert.equal(response.status, 500); assert.equal(body.error, 'EMAIL_SEND_FAILED'); assert.equal(f.calls.provider, 0);
  assert.deepEqual(f.calls.finishes, [{ status: 'failed', error: body.message }]);
  assert.doesNotMatch(JSON.stringify({ body, calls: f.calls }), /synthetic-db-password|mongodb:|private-invoice-body/);
});
test('documented ApiError status, message and code remain available at the email boundary', async () => {
  for (const status of [403, 409, 429]) {
    const error = new ApiError(status, 'Jawny komunikat użytkownika.', 'DOCUMENTED_EMAIL_ERROR');
    const f = fixture({ startError: error }), { response, body } = await invoke(f);
    assert.equal(response.status, status);
    assert.deepEqual(body, { error: error.code, message: error.message, details: error.message });
    assert.deepEqual(f.calls.finishes, [{ status: 'failed', error: error.message }]); assert.equal(f.calls.provider, 0);
  }
});
test('an uncertain provider result keeps safe 409 and durable verification instead of retrying delivery', async () => {
  const f = fixture({ providerError: privateError() }), { response, body } = await invoke(f);
  assert.equal(response.status, 409); assert.equal(body.error, 'EMAIL_DELIVERY_UNCERTAIN'); assert.equal(f.calls.provider, 1);
  assert.deepEqual(f.calls.finishes, [{ status: 'verify_needed', error: body.message }]);
  assert.doesNotMatch(JSON.stringify({ body, calls: f.calls }), /synthetic-db-password|mongodb:|private-invoice-body/);
});
