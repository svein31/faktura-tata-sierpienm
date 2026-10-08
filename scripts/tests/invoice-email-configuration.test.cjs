require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict'), Module = require('node:module');
const originalLoad = Module._load;
const { createHash } = require('node:crypto');
const { ApiError } = require('../../src/lib/api.ts');
const routePath = require.resolve('../../src/app/api/invoices/send-email/route.ts');

function fixture(overrides = {}) {
  const user = { id: '507f191e810c19729de860ea', role: 'owner', email: 'owner@example.test', name: 'Owner' };
  const invoice = {
    id: '507f191e810c19729de860eb', userId: user.id, sellerCompanyId: '507f191e810c19729de860ec', contractorId: '507f191e810c19729de860ed', number: 'FV/1', type: 'sale', status: 'issued',
    issueDate: '2026-10-07', saleDate: '2026-10-07', dueDate: '2026-10-21', lines: [], currency: 'PLN', createdAt: new Date(), ksefNumber: null,
    sellerCompany: { id: '507f191e810c19729de860ec', userId: user.id, companyName: 'Seller', nip: '5260301706', createdAt: new Date(), updatedAt: new Date() }, ...overrides,
  };
  const sends = [], configurations = [], logs = [], scopes = [];
  const deliveries = new Map();
  let holdSend, startedSend;
  const sendStarted = new Promise(resolve => { startedSend = resolve; });
  const db = {
    invoice: { findFirst: async query => { scopes.push(query.where); return invoice; }, update: async query => ({ ...invoice, ...query.data }) },
    contractor: { findFirst: async () => null },
    invoiceEmailLog: { create: async query => { const value = { id: 'synthetic-log', ...query.data }; logs.push(value); return value; }, findUnique: async () => logs.at(-1) },
    notification: { create: async () => ({}) },
  };
  Module._load = function(request, parent, main) {
    if (request === '@/lib/db') return { prisma: db };
    if (request === '@/lib/auth') return { getSessionUser: async () => user };
    if (request === '@/lib/email/verification') return { requireVerifiedEmailForSending: async () => {} };
    if (request === '@/lib/rate-limit') return { rateLimitSubject: async () => ({ allowed: true }) };
    if (request === '@/lib/email/manual-delivery') return {
      manualEmailDigest: value => createHash('sha256').update(JSON.stringify(value)).digest('hex'),
      DELIVERY_UNCERTAIN_MESSAGE: 'Delivery requires verification',
      claimManualEmail: async input => {
        const prior = deliveries.get(input.key);
        if (prior?.status === 'accepted') return { ...prior, replay: prior.response };
        if (prior) throw new ApiError(409, 'Sending in progress', 'DUPLICATE_REQUEST');
        const value = { id: '507f191e810c19729de860ef', userId: input.userId, invoiceId: input.invoiceId, token: input.key, status: 'preparing' };
        deliveries.set(input.key, value); return value;
      },
      startManualEmail: async (lease, log) => { logs.push({ id: lease.id, invoiceId: lease.invoiceId, ...log, status: 'queued' }); },
      finishManualEmail: async (lease, result) => { Object.assign(deliveries.get(lease.token), result); Object.assign(logs.at(-1) ?? {}, result); },
    };
    if (request === '@/lib/company-scope') return { accessibleCompanyIds: async () => [invoice.sellerCompanyId] };
    if (request === '@/lib/document-scope') return { requireDocumentWrite: async () => {} };
    if (request === '@/lib/email/auto-send') return { configureKsefAutoEmail: async (...args) => { configurations.push(args); } };
    if (request === '@/lib/pdf/invoice-print') return { invoicePdf: async () => ({ buffer: Buffer.from('%PDF-synthetic') }) };
    if (request === '@/lib/ksef/index') return { buildFa3Xml: () => { throw new Error('Accepted XML must never be regenerated'); } };
    if (request === '@/lib/email/sender') {
      const validation = require('../../src/lib/email/validation.ts');
      return { ...validation, getEmailConfigStatus: () => ({ configured: true, provider: 'smtp' }), sendEmail: async payload => {
        sends.push(payload); startedSend(); if (holdSend) await holdSend;
        return { success: true, provider: 'smtp', messageId: 'synthetic-message' };
      } };
    }
    return originalLoad.call(this, request, parent, main);
  };
  delete require.cache[routePath];
  const { POST } = require(routePath);
  // The production route loads PDF lazily; keep the controlled renderer available after Module._load is restored.
  const pdfPath = require.resolve('../../src/lib/pdf/invoice-print.ts');
  require.cache[pdfPath] = { id: pdfPath, filename: pdfPath, loaded: true, exports: { invoicePdf: async () => ({ buffer: Buffer.from('%PDF-synthetic') }) } };
  Module._load = originalLoad;
  const request = body => new Request('http://localhost/api/invoices/send-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceId: invoice.id, ...body }) });
  return { POST, request, invoice, configurations, sends, logs, scopes, sendStarted, hold: promise => { holdSend = promise; } };
}

test('automatic email can be cancelled after KSeF acceptance without sending any manual email', async () => {
  const value = fixture({ ksefNumber: 'KSEF', upoXml: null, autoSendEmailOnKsef: true, autoKsefEmailStatus: 'queued' });
  const response = await value.POST(value.request({ action: 'cancel-auto-ksef' }));
  assert.equal(response.status, 200); assert.deepEqual(value.configurations, [[value.invoice.id, null]]);
  assert.equal(value.sends.length, 0); assert.equal(value.logs.length, 0);
  assert.equal(value.scopes[0].id, value.invoice.id); assert.deepEqual(value.scopes[0].OR[0].sellerCompanyId.in, [value.invoice.sellerCompanyId]);
});
test('accepted manual invoice email requires the exact original XML and requested UPO', async () => {
  const xml = fixture({ ksefNumber: 'KSEF', ksefXml: null });
  const xmlResponse = await xml.POST(xml.request({ recipientEmail: 'selected@example.test', attachPdf: false, attachXml: true }));
  assert.equal(xmlResponse.status, 409); assert.equal(xml.sends.length, 0);
  const upo = fixture({ ksefNumber: 'KSEF', upoXml: null });
  const upoResponse = await upo.POST(upo.request({ recipientEmail: 'selected@example.test', attachPdf: false, attachUpo: true }));
  assert.equal(upoResponse.status, 409); assert.equal(upo.sends.length, 0);
});
test('duplicate rejection keeps the original in-flight lock until its owner completes', async () => {
  const value = fixture();
  let release;
  value.hold(new Promise(resolve => { release = resolve; }));
  const body = { recipientEmail: 'selected@example.test', attachPdf: true, idempotencyKey: 'same-double-click' };
  const first = value.POST(value.request(body));
  await value.sendStarted;
  const second = await value.POST(value.request(body));
  assert.equal(second.status, 409);
  const third = value.POST(value.request(body));
  await new Promise(setImmediate);
  assert.equal(value.sends.length, 1, 'A duplicate request must not remove the first request lock');
  release();
  assert.equal((await first).status, 200); assert.equal((await third).status, 409);
});
