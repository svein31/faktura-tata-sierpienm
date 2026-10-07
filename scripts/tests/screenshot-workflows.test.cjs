require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict'), Module = require('node:module');
const { invoice, company, buyer } = require('../pdf-layout-fixture.cjs');
const { ksefProgress } = require('../../src/lib/ksef/progress.ts');
const { changedAcceptedInvoiceFields } = require('../../src/lib/invoice-policy.ts');
const { useAppStore } = require('../../src/lib/store.ts');
const { useInvoiceExports } = require('../../src/lib/invoice-actions.ts');

test('explicit new invoice resets identity and starts a fresh editor even on the same route', () => {
  const store = useAppStore.getState();
  store.setDraft(invoice, false);
  const previous = useAppStore.getState().invoiceEditorSession;
  store.setDraft(null, true);
  assert.equal(useAppStore.getState().draftInvoice, null);
  assert.equal(useAppStore.getState().draftInvoiceIsNew, true);
  assert.equal(useAppStore.getState().invoiceEditorSession, previous + 1);
  store.setDraft(null, true);
  assert.equal(useAppStore.getState().invoiceEditorSession, previous + 2);
  store.setDraft({ ...invoice, id: '123456789012345678901234' }, false, true);
  assert.equal(useAppStore.getState().invoiceEditorSession, previous + 2, 'Saving before a transport retry does not reset the form');
});
test('creator PDF uses current form values while the stored document opens the archived endpoint', () => {
  const previousWindow = global.window, previousTimeout = global.setTimeout, opened = [], html = [];
  global.setTimeout = () => 0;
  global.window = { open: url => { opened.push(url); return { document: { open() {}, write(value) { html.push(value); }, close() {} }, focus() {} }; } };
  try {
    const edited = { ...invoice, id: '123456789012345678901234', issueDate: '2032-01-03', saleDate: '2032-01-04', dueDate: '2032-01-17', bankAccountSnapshot: { accountNumber: 'PL61109010140000071219812874', beneficiaryName: 'Selected beneficiary', currency: 'PLN', bankName: 'Selected bank' } };
    useInvoiceExports(edited, buyer, company, 'preview').exportPdf();
    assert.equal(opened[0], '');
    assert.match(html[0], /03\.01\.2032/); assert.match(html[0], /04\.01\.2032/); assert.match(html[0], /17\.01\.2032/);
    assert.match(html[0], /Selected beneficiary/); assert.match(html[0], /Selected bank/); assert.match(html[0], /PL61109010140000071219812874/);
    useInvoiceExports(edited, buyer, company).exportPdf();
    assert.equal(opened[1], '/api/invoices/123456789012345678901234/pdf');
  } finally { global.window = previousWindow; global.setTimeout = previousTimeout; }
});
test('a KSeF number confirms acceptance but never pretends an absent UPO has been downloaded', () => {
  const accepted = { ...invoice, ksefNumber: 'KSEF', ksefStatus: 'accepted', upoXml: null };
  assert.equal(ksefProgress(accepted).accepted, true);
  assert.equal(ksefProgress(accepted).hasUpo, false);
  assert.equal(ksefProgress(accepted).polling, true);
  assert.equal(ksefProgress({ ...accepted, upoXml: '  ' }).hasUpo, false);
  assert.equal(ksefProgress({ ...accepted, upoXml: '<UPO/>' }).polling, false);
  assert.equal(ksefProgress({ ...invoice, ksefNumber: null, ksef: null, referenceNumber: 'submitted', ksefStatus: 'verify_needed' }).sending, true);
  assert.equal(ksefProgress({ ...invoice, ksefNumber: null, ksef: null, referenceNumber: null, ksefStatus: 'rejected' }).polling, false);
});
test('registered invoice date, account and line changes are identified, internal notes remain editable', () => {
  assert.deepEqual(changedAcceptedInvoiceFields({ issueDate: '2032-01-03', bankAccountId: 'other' }, { ...invoice, bankAccountId: 'original' }), ['issueDate', 'bankAccountId']);
  assert.deepEqual(changedAcceptedInvoiceFields({ notes: 'new', lines: invoice.lines.map(line => Object.fromEntries(Object.entries(line).reverse())) }, invoice), []);
  assert.deepEqual(changedAcceptedInvoiceFields({ lines: [{ name: 'changed' }] }, invoice), ['lines']);
});
const originalLoad = Module._load;
let mocks = {};
Module._load = function(request, parent, main) { return Object.hasOwn(mocks, request) ? mocks[request] : originalLoad.call(this, request, parent, main); };
function reconciliationFixture(result, overrides = {}, token = 'token') {
  for (const key of Object.keys(require.cache)) if (/[\\/]src[\\/]lib[\\/]ksef[\\/]reconcile-status/.test(key)) delete require.cache[key];
  const writes = [], sessions = [], calls = [], autoEmails = [];
  const db = { ksefSession: { findFirst: async query => { sessions.push(query.where); return token ? { accessToken: token } : null; } }, invoice: { updateMany: async query => { writes.push(query); return { count: 1 }; } }, ksefQueueTask: { updateMany: async () => ({ count: 1 }) }, $transaction: async callback => callback(db) };
  mocks = { '@/lib/db': { prisma: db }, '@/lib/audit': { recordAuditLog: async () => {} }, '@/lib/ksef/index': { KsefClient: class { async getInvoiceStatus(...args) { calls.push(args); return result; } async sendInvoiceEncrypted() { throw new Error('Reconciliation must never send'); } } } };
  mocks['@/lib/email/auto-send'] = { triggerAutoEmailOnKsef: async id => { autoEmails.push(id); return true; } };
  const value = { id: 'invoice', userId: 'owner', sellerCompanyId: 'company', sellerCompany: { nip: '5260301706' }, referenceNumber: 'original-element', ksefSession: null, ksefStatus: 'verify_needed', ksefNumber: null, upoXml: null, ksef: { environment: 'production', sessionReferenceNumber: 'original-session' }, ...overrides };
  return { reconcile: require('../../src/lib/ksef/reconcile-status.ts').reconcileKsefInvoice, value, writes, sessions, calls, autoEmails };
}
test('ambiguous submission is confirmed by reference without resend and without fabricating UPO', async () => {
  const state = reconciliationFixture({ status: 'ACCEPTED', ksefReferenceNumber: 'KSEF', processingCode: 200 });
  const result = await state.reconcile(state.value, { id: 'actor' });
  assert.deepEqual(state.calls, [['token', 'original-session', 'original-element']]);
  assert.equal(result.hasUpo, false); assert.equal(state.writes[0].data.ksefNumber, 'KSEF');
  assert.deepEqual(state.sessions[0].userId.in, ['actor', 'owner']); assert.equal(state.sessions[0].nip, '5260301706');
});
test('late UPO is persisted on an accepted paid invoice, preserving payment state', async () => {
  const state = reconciliationFixture({ status: 'ACCEPTED', ksefReferenceNumber: 'KSEF', processingCode: 200, upoXml: '<UPO/>' }, { ksefNumber: 'KSEF', ksefStatus: 'accepted', status: 'paid', paymentStatus: 'paid' });
  const result = await state.reconcile(state.value, { id: 'owner' });
  assert.equal(result.hasUpo, true); assert.equal(state.writes[0].data.upoXml, '<UPO/>'); assert.equal(state.writes[0].data.status, 'paid');
  assert.ok(state.writes[0].where.OR.some(condition => condition.ksefNumber === 'KSEF' && condition.ksefStatus === 'accepted'));
});
test('pending result and unavailable session do not modify or resend the invoice', async () => {
  const state = reconciliationFixture({ status: 'PENDING', processingCode: 100 });
  await state.reconcile(state.value, { id: 'owner' }); assert.equal(state.writes.length, 0);
  const unavailable = reconciliationFixture({}, {}, null);
  await assert.rejects(unavailable.reconcile(unavailable.value, { id: 'owner' }), /aktywnej sesji/);
  assert.equal(unavailable.calls.length, 0); assert.equal(unavailable.writes.length, 0);
});
test('complete UPO is returned locally without another MF request', async () => {
  const state = reconciliationFixture({}, { ksefNumber: 'KSEF', upoXml: '<UPO/>' });
  assert.equal((await state.reconcile(state.value, { id: 'owner' })).hasUpo, true);
  assert.equal(state.calls.length, 0); assert.equal(state.sessions.length, 0);
});
test('opted-in auto-email starts after persisted UPO and can recover on a later local status read', async () => {
  const pending = reconciliationFixture({ status: 'ACCEPTED', ksefReferenceNumber: 'KSEF' }, { autoSendEmailOnKsef: true });
  await pending.reconcile(pending.value, { id: 'owner' });
  assert.equal(pending.autoEmails.length, 0, 'KSeF number alone must not start email');
  const ready = reconciliationFixture({ status: 'ACCEPTED', ksefReferenceNumber: 'KSEF', upoXml: '<UPO/>' }, { autoSendEmailOnKsef: true });
  await ready.reconcile(ready.value, { id: 'owner' });
  assert.deepEqual(ready.autoEmails, ['invoice']); assert.equal(ready.writes[0].data.upoXml, '<UPO/>');
  const recovery = reconciliationFixture({}, { ksefNumber: 'KSEF', upoXml: '<UPO/>', autoSendEmailOnKsef: true });
  await recovery.reconcile(recovery.value, { id: 'owner' });
  assert.deepEqual(recovery.autoEmails, ['invoice']); assert.equal(recovery.calls.length, 0);
});
