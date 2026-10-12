require('../register-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const userId = 'a'.repeat(24), companyId = 'b'.repeat(24), invoiceId = 'c'.repeat(24);
const ownerId = 'd'.repeat(24), memberId = 'e'.repeat(24), contractorId = 'f'.repeat(24);
const createdId = '1'.repeat(24), deliveryId = '2'.repeat(24);
const routes = {
  recurrence: 'src/app/api/invoices/[id]/recurrence/route.ts',
  settlement: 'src/app/api/invoice-settlements/route.ts',
  reminders: 'src/app/api/due-reminders/route.ts',
};
function accessRow(overrides = {}) {
  return { company: { id: companyId, userId: ownerId, companyName: 'Synthetic company', nip: '5261040828' },
    members: [{ id: memberId, role: 'employee', canIssueInvoices: true, canSendKsef: true }],
    policies: [], mfaEnabled: false, ...overrides };
}

// Load the real route, permission preflight, access reader and transaction fence
// into one fixture-local module graph. No inherited database or provider is used.
function application(route, replacements) {
  const cache = new Map();
  const load = filename => {
    if (replacements.has(filename)) return replacements.get(filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = new Module(filename);
    mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename)); cache.set(filename, mod);
    mod.require = request => {
      if (request === 'server-only') return {};
      if (request.startsWith('@/') || request.startsWith('.')) {
        const base = request.startsWith('@/') ? path.join(root, 'src', request.slice(2)) : path.resolve(path.dirname(filename), request);
        const resolved = require.resolve(base);
        if (resolved.startsWith(path.join(root, 'src') + path.sep) && /\.tsx?$/.test(resolved)) return load(resolved);
        return require(resolved);
      }
      return require(request);
    };
    mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText, filename);
    return mod.exports;
  };
  return load(path.join(root, routes[route]));
}

function fixture(route, { currentAccess = accessRow(), fenceConflict = false, versionConflict = false, replay = false } = {}) {
  const events = [], businessWrites = [], fenceWrites = [], audit = [];
  let transactions = 0, current;
  const invoice = { id: invoiceId, userId, sellerCompanyId: companyId, contractorId, type: 'sale',
    isProforma: route === 'settlement', isCorrection: false, documentKind: 'vat', documentStatus: 'issued',
    number: 'SYNTHETIC/ORDER', issueDate: '2026-01-01', saleDate: '2026-01-01', dueDate: '2026-01-15',
    paymentTermDays: 14, paymentMethod: 'transfer', currency: 'PLN', language: 'PL', version: 1,
    recurringAutoSend: false, recurringPaused: false,
    lines: [{ id: 'synthetic-line', name: 'Synthetic item', quantity: 1, unit: 'szt.', netPrice: 100, vatRate: '23' }] };
  current = { ...invoice };
  const write = (model, operation, args) => { events.push(`business:${model}.${operation}`); businessWrites.push({ model, operation, args }); };
  const tx = {
    companyProfile: {
      aggregateRaw: async () => { events.push('access:transaction'); return currentAccess ? [currentAccess] : []; },
      findUnique: async () => { events.push('fence:timestamp'); return { updatedAt: new Date('2999-01-01T00:00:00.000Z') }; },
      update: async args => {
        events.push('fence:write'); fenceWrites.push(args);
        if (fenceConflict) throw Object.assign(new Error('Synthetic fence contention'), { code: 'P2034' });
        return { id: companyId };
      },
    },
    invoice: {
      updateMany: async args => { write('invoice', 'updateMany', args); current = { ...current, ...args.data }; return { count: versionConflict ? 0 : 1 }; },
      count: async () => 0,
      create: async args => { write('invoice', 'create', args); return { id: createdId, ...args.data }; },
      findUniqueOrThrow: async () => current,
    },
    invoiceSettlement: { create: async args => { write('invoiceSettlement', 'create', args); return { id: 'synthetic-settlement', ...args.data }; } },
    dueReminderSetting: { upsert: async args => { write('dueReminderSetting', 'upsert', args); return { id: 'synthetic-setting', ...args.create }; } },
    dueReminderDelivery: { updateMany: async args => { write('dueReminderDelivery', 'updateMany', args); return { count: 1 }; } },
  };
  const db = {
    companyProfile: { aggregateRaw: async () => { events.push('access:preflight'); return [accessRow()]; } },
    companyMember: { create: async () => { throw new Error('The valid membership preflight must not create a member'); } },
    contractor: { findUnique: async () => ({ id: contractorId, companyId, userId: ownerId }) },
    invoice: { findUnique: async () => invoice, findUniqueOrThrow: async () => ({ id: createdId, number: 'REPLAY/1' }),
      findFirst: async () => invoice, findMany: async () => [] },
    invoiceSettlement: { findUnique: async () => replay ? { sourceId: invoiceId, kind: 'advance', invoiceId: createdId } : null, findMany: async () => [] },
    dueReminderSetting: { findMany: async () => [{ id: 'setting', invoiceId, enabled: true, channels: ['email'] }] },
    dueReminderDelivery: { findMany: async () => [{ id: deliveryId, channel: 'email', status: 'failed' }] },
    $transaction: async callback => { transactions++; events.push('transaction:start'); return callback(tx); },
  };
  const replace = (name, value) => [path.join(root, 'src/lib', name), value];
  const replacements = new Map([
    replace('db.ts', { prisma: db }), replace('auth.ts', { getSessionUser: async () => ({ id: userId, name: 'Synthetic actor', email: 'synthetic@example.invalid' }) }),
    replace('dto.ts', { invoiceToDto: value => value }),
    replace('accounting-period.ts', { assertAccountingPeriodsOpen: async supplied => { assert.equal(supplied, tx); events.push('accounting:check'); } }),
    replace('invoice-quota.ts', { claimInvoiceQuota: async supplied => { assert.equal(supplied, tx); write('quota', 'claim', {}); return new Date('2026-01-01T00:00:00Z'); } }),
    replace('pdf/invoice-print.ts', { captureInvoicePrint: async supplied => { assert.equal(supplied, tx); write('print', 'capture', {}); } }),
    replace('audit.ts', { recordAuditLog: async args => { assert.equal(args.client, tx); audit.push(args); write('audit', 'create', args); } }),
  ]);
  return { route: application(route, replacements), events, businessWrites, fenceWrites, audit, transactions: () => transactions };
}
const bodyFor = branch => branch === 'recurrence' ? { interval: 'monthly', nextDate: '2026-11-15', paused: false }
  : branch === 'settlement' ? { sourceId: invoiceId, requestId: 'synthetic-request-1234', kind: 'advance', amountNet: 25, number: 'SYNTHETIC/ADVANCE', issueDate: '2026-01-01', receivedDate: '2026-01-01', receiptConfirmed: true }
  : branch === 'retry' ? { companyId, action: 'retry', id: deliveryId }
  : { companyId, invoiceId, enabled: true, channels: ['email'] };
async function call(f, branch, patch = {}) {
  const req = new Request('http://127.0.0.1/api/synthetic', { method: branch === 'recurrence' ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...bodyFor(branch), ...patch }) });
  return branch === 'recurrence' ? f.route.PATCH(req, { params: Promise.resolve({ id: invoiceId }) }) : f.route.POST(req);
}
const branches = ['recurrence', 'settlement', 'retry', 'settings'];
const moduleFor = branch => ['retry', 'settings'].includes(branch) ? 'reminders' : branch;

for (const branch of branches) {
  for (const [name, row] of [
    ['issue permission revoked', accessRow({ members: [{ id: memberId, role: 'employee', canIssueInvoices: false }] })],
    ['membership removed', accessRow({ members: [] })],
    ['unknown role assigned', accessRow({ members: [{ id: memberId, role: 'unknown', canIssueInvoices: true }] })],
    ['company removed', null],
    ['MFA requirement enabled', accessRow({ policies: [{ requireMfa: true }] })],
  ]) {
    test(`${branch}: ${name} after allowed preflight denies before every business write`, async () => {
      const f = fixture(moduleFor(branch), { currentAccess: row });
      const response = await call(f, branch); const body = await response.json();
      assert.equal(response.status, 403, JSON.stringify(body));
      if (name.startsWith('MFA')) assert.equal(body.code, 'COMPANY_MFA_REQUIRED');
      assert.deepEqual(f.events, ['access:preflight', 'transaction:start', 'access:transaction']);
      assert.equal(f.transactions(), 1); assert.deepEqual(f.businessWrites, []); assert.deepEqual(f.fenceWrites, []);
    });
  }
  test(`${branch}: allowed transaction fences the same company before business operations`, async () => {
    const f = fixture(moduleFor(branch)); const response = await call(f, branch); const body = await response.json();
    assert.equal(response.status, branch === 'settlement' ? 201 : 200, JSON.stringify(body));
    assert.deepEqual(f.events.slice(0, 5), ['access:preflight', 'transaction:start', 'access:transaction', 'fence:timestamp', 'fence:write']);
    assert.equal(f.transactions(), 1); assert.equal(f.fenceWrites.length, 1); assert.equal(f.audit.length, 1);
    assert.deepEqual(f.fenceWrites[0].where, { id: companyId });
    assert.equal(f.fenceWrites[0].data.updatedAt.getTime(), new Date('2999-01-01T00:00:00.000Z').getTime() + 1);
    if (branch === 'recurrence') { assert.equal(body.invoice.isRecurring, true); assert.equal(body.invoice.version, 2); }
    if (branch === 'settlement') { assert.equal(body.invoice.totalGross, 30.75); assert.equal(body.invoice.paidAmount, 30.75); assert.equal(body.invoice.documentKind, 'advance'); }
    if (branch === 'retry') assert.equal(body.ok, true);
    if (branch === 'settings') { assert.equal(body.setting.enabled, true); assert.deepEqual(body.setting.channels, ['email']); }
  });
  test(`${branch}: fence write conflict remains one 409 attempt with zero business writes`, async () => {
    const f = fixture(moduleFor(branch), { fenceConflict: true }); const response = await call(f, branch);
    assert.equal(response.status, 409); assert.equal((await response.json()).code, 'CONFLICT');
    assert.equal(f.transactions(), 1); assert.equal(f.fenceWrites.length, 1); assert.deepEqual(f.businessWrites, []);
  });
}

test('recurrence: autoSend KSeF permission revoked after both preflights prevents invoice and audit writes', async () => {
  const f = fixture('recurrence', { currentAccess: accessRow({ members: [{ id: memberId, role: 'employee', canIssueInvoices: true, canSendKsef: false }] }) });
  const response = await call(f, 'recurrence', { autoSend: true });
  assert.equal(response.status, 403); assert.deepEqual(f.businessWrites, []); assert.equal(f.transactions(), 1);
  assert.deepEqual(f.events, ['access:preflight', 'access:preflight', 'transaction:start', 'access:transaction', 'fence:timestamp', 'fence:write', 'access:transaction']);
});
test('recurrence: disabling autoSend needs no KSeF permission and preserves version conflict handling', async () => {
  const row = accessRow({ members: [{ id: memberId, role: 'employee', canIssueInvoices: true, canSendKsef: false }] });
  const allowed = fixture('recurrence', { currentAccess: row });
  assert.equal((await call(allowed, 'recurrence', { autoSend: false })).status, 200);
  const conflict = fixture('recurrence', { currentAccess: row, versionConflict: true });
  assert.equal((await call(conflict, 'recurrence', { autoSend: false })).status, 409); assert.deepEqual(conflict.audit, []);
});
test('settlement: request replay preserves its read-only response without a business transaction', async () => {
  const f = fixture('settlement', { replay: true, currentAccess: null }); const response = await call(f, 'settlement');
  assert.equal(response.status, 200); assert.equal((await response.json()).invoice.number, 'REPLAY/1');
  assert.deepEqual(f.events, ['access:preflight']); assert.equal(f.transactions(), 0); assert.deepEqual(f.businessWrites, []); assert.deepEqual(f.fenceWrites, []);
});
for (const route of ['settlement', 'reminders']) {
  test(`${route}: GET remains read-only with no company fence or transaction`, async () => {
    const f = fixture(route); const response = await f.route.GET(new Request(`http://127.0.0.1/api/synthetic?companyId=${companyId}`));
    assert.equal(response.status, 200); assert.equal(f.transactions(), 0); assert.deepEqual(f.events, ['access:preflight']);
    assert.deepEqual(f.businessWrites, []); assert.deepEqual(f.fenceWrites, []);
  });
}
