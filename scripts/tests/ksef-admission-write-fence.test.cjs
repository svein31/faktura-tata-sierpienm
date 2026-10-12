require('../register-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const crypto = require('node:crypto');
const companyWrite = require('../../src/lib/company-write.ts');

const userId = 'a'.repeat(24), companyId = 'b'.repeat(24), invoiceId = 'c'.repeat(24);
const memberId = 'd'.repeat(24), ownerId = 'e'.repeat(24), contractorId = 'f'.repeat(24);
const request = (path, body = { invoiceId }) => new Request(`http://127.0.0.1/api/ksef/${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

function loadRoute(path, mocks) {
  const original = Module._load;
  Module._load = function (name, parent, main) {
    return Object.hasOwn(mocks, name) ? mocks[name] : original.call(this, name, parent, main);
  };
  try {
    const resolved = require.resolve(`../../src/app/api/ksef/${path}/route.ts`);
    delete require.cache[resolved];
    return require(resolved);
  } finally { Module._load = original; }
}

// Exercise the real membership/MFA/fence helper with distinct transaction delegates.
// The HTTP preflight deliberately sees granted access before this live access row.
function authorization(tx, writes, checks, state = {}) {
  tx.companyProfile = {
    async aggregateRaw() {
      return [{ company: { id: companyId, userId: ownerId, companyName: 'Synthetic company', nip: '1234567890' },
        members: state.removed ? [] : [{ id: memberId, role: 'employee', canIssueInvoices: !state.issueRevoked, canSendKsef: !state.sendRevoked }],
        policies: [{ requireMfa: !!state.requireMfa }], mfaEnabled: !!state.mfaEnabled }];
    },
    async findUnique() { return { updatedAt: new Date('2999-01-01T00:00:00.000Z') }; },
    async update({ data }) {
      assert.equal(data.updatedAt.getTime(), new Date('2999-01-01T00:00:00.000Z').getTime() + 1);
      writes.fence++;
      return { id: companyId };
    },
  };
  return Object.fromEntries(['companyAccess', 'companyWriteAccess'].map(name => [name, async (supplied, actor, company, permission) => {
    assert.equal(supplied, tx, 'Admission must use the business transaction');
    assert.equal(actor, userId); assert.equal(company, companyId);
    checks.push({ name, permission });
    return companyWrite[name](supplied, actor, company, permission);
  }]));
}

function common(db, tx, writes, checks, state) {
  return {
    '@/lib/db': { prisma: db },
    '@/lib/auth': { getSessionUser: async () => ({ id: userId, email: 'synthetic@example.invalid', role: 'employee' }) },
    '@/lib/permissions': { requireCompanyAccess: async () => ({ ok: true }) },
    '@/lib/company-write': authorization(tx, writes, checks, state),
    '@/lib/accounting-period': { assertAccountingPeriodsOpen: async supplied => assert.equal(supplied, tx) },
    '@/lib/audit': { recordAuditLog: async ({ client }) => { assert.equal(client, tx); writes.audit++; } },
    '@/lib/invoice-quota': { claimInvoiceQuota: async supplied => { assert.equal(supplied, tx); writes.quota++; return new Date('2026-10-10T00:00:00Z'); } },
    '@/lib/dto': { invoiceToDto: value => value, companyProfileToDto: value => value, contractorToDto: value => value },
    '@/lib/pdf/invoice-print': { captureInvoicePrint: async supplied => { assert.equal(supplied, tx); writes.print++; } },
  };
}

function queueFixture(state = {}) {
  const writes = { fence: 0, queue: 0, invoice: 0, quota: 0, audit: 0 }, checks = [];
  const invoice = { id: invoiceId, userId, sellerCompanyId: state.personal ? null : companyId,
    status: 'draft', type: 'sale', issueDate: '2026-10-10', version: 1 };
  const task = { id: 'synthetic-task', status: 'queued' };
  const tx = { ksefQueueTask: {
    findUnique: async () => state.previousTask ? task : null,
    create: async ({ data }) => { writes.queue++; return { ...task, ...data }; },
  }, invoice: { update: async () => { writes.invoice++; return invoice; } } };
  const db = { invoice: { findFirst: async () => invoice }, ksefQueueTask: { findFirst: async () => null },
    $transaction: async callback => callback(tx) };
  const route = loadRoute('queue', common(db, tx, writes, checks, state));
  return { route, writes, checks };
}

test('queue revocation after granted preflight prevents quota, task, invoice and audit writes', async t => {
  for (const state of [{ sendRevoked: true }, { removed: true }, { requireMfa: true }]) {
    await t.test(JSON.stringify(state), async () => {
      const f = queueFixture(state), response = await f.route.POST(request('queue'));
      assert.equal(response.status, 403);
      assert.deepEqual(f.checks, [{ name: 'companyWriteAccess', permission: 'canSendKsef' }]);
      assert.deepEqual(f.writes, { fence: 0, queue: 0, invoice: 0, quota: 0, audit: 0 });
    });
  }
});

test('authorized queue admission uses one fence before issuing a draft and preserves idempotent replay', async () => {
  const f = queueFixture(), response = await f.route.POST(request('queue'));
  assert.equal(response.status, 200);
  assert.deepEqual(f.writes, { fence: 1, queue: 1, invoice: 1, quota: 1, audit: 1 });
  const replay = queueFixture({ previousTask: true });
  assert.equal((await replay.route.POST(request('queue'))).status, 200);
  assert.deepEqual(replay.writes, { fence: 1, queue: 0, invoice: 0, quota: 0, audit: 0 });
  const revokedReplay = queueFixture({ previousTask: true, sendRevoked: true });
  assert.equal((await revokedReplay.route.POST(request('queue'))).status, 403);
  assert.deepEqual(revokedReplay.writes, { fence: 0, queue: 0, invoice: 0, quota: 0, audit: 0 });
});

test('personal legacy queue admission preserves owner access without a company fence', async () => {
  const f = queueFixture({ personal: true });
  assert.equal((await f.route.POST(request('queue'))).status, 200);
  assert.deepEqual(f.checks, []);
  assert.deepEqual(f.writes, { fence: 0, queue: 1, invoice: 1, quota: 1, audit: 1 });
});

const certificate = Buffer.from('synthetic offline certificate');
class SyntheticCertificate {
  constructor(raw) { assert.deepEqual(raw, certificate); }
  serialNumber = 'SYNTHETIC';
  fingerprint256 = crypto.createHash('sha256').update(certificate).digest('hex');
  toString() { return 'synthetic certificate PEM'; }
}
async function offlineRequest(route) {
  const previousSigner = process.env.KSEF_OFFLINE_SIGNERS_JSON, previousFetch = global.fetch;
  process.env.KSEF_OFFLINE_SIGNERS_JSON = JSON.stringify({ [companyId]: {
    environment: 'test', certificateBase64: certificate.toString('base64'), privateKeyPem: 'synthetic private key',
  } });
  let providerCalls = 0;
  global.fetch = async (url, options) => {
    assert.match(url, /\/certificates\/retrieve$/); assert.equal(options.method, 'POST');
    providerCalls++;
    return Response.json({ certificates: [{ certificateSerialNumber: 'SYNTHETIC', certificateType: 'Offline', certificate: certificate.toString('base64') }] });
  };
  try {
    const response = await route.POST(request('offline/issue'));
    assert.equal(providerCalls, 1, 'Existing certificate verification stays outside and before admission');
    return response;
  } finally {
    if (previousSigner === undefined) delete process.env.KSEF_OFFLINE_SIGNERS_JSON;
    else process.env.KSEF_OFFLINE_SIGNERS_JSON = previousSigner;
    global.fetch = previousFetch;
  }
}

function offlineFixture(state = {}) {
  const writes = { fence: 0, invoice: 0, quota: 0, audit: 0, print: 0 }, checks = [];
  const invoice = { id: invoiceId, userId, sellerCompanyId: companyId,
    sellerCompany: { id: companyId, userId: ownerId, nip: '1234567890' }, contractorId,
    status: 'draft', type: 'sale', isOffline: true, issueDate: '2026-10-10', version: 1,
    offlineDeadline: '2026-10-11', offlineReason: 'offline24' };
  const tx = { invoice: {
    updateMany: async () => { writes.invoice++; return { count: 1 }; },
    findUniqueOrThrow: async () => ({ ...invoice, status: 'issued' }),
  } };
  const db = { invoice: { findUnique: async () => invoice },
    ksefSettings: { findUnique: async () => ({ environment: 'test' }) },
    ksefSession: { findFirst: async () => ({ accessToken: 'synthetic scoped token' }) },
    contractor: { findUnique: async () => ({ id: contractorId }) }, $transaction: async callback => callback(tx) };
  const mocks = { ...common(db, tx, writes, checks, state),
    'node:crypto': { createHash: crypto.createHash, X509Certificate: SyntheticCertificate },
    '@/lib/ksef/xmlBuilder': { buildFa3Xml: () => '<synthetic/>', validateFa3Xml: () => ({ ok: true }) },
    '@/lib/ksef/qr': { buildKsefVerificationUrl: () => 'synthetic QR I', buildKsefOfflineCertUrl: () => 'synthetic QR II' },
  };
  return { route: loadRoute('offline/issue', mocks), writes, checks };
}

test('offline issuance rechecks both permissions and MFA before quota or invoice writes', async t => {
  for (const state of [{ issueRevoked: true }, { sendRevoked: true }, { requireMfa: true }]) {
    await t.test(JSON.stringify(state), async () => {
      const f = offlineFixture(state), response = await offlineRequest(f.route);
      assert.equal(response.status, 403);
      assert.deepEqual(f.writes, { fence: 0, invoice: 0, quota: 0, audit: 0, print: 0 });
      assert.equal(f.checks[0].permission, 'canIssueInvoices');
      if (state.sendRevoked) assert.deepEqual(f.checks[1], { name: 'companyWriteAccess', permission: 'canSendKsef' });
    });
  }
});

test('authorized offline issuance checks both current permissions and takes exactly one fence', async () => {
  const f = offlineFixture(), response = await offlineRequest(f.route);
  assert.equal(response.status, 200);
  assert.deepEqual(f.checks, [{ name: 'companyAccess', permission: 'canIssueInvoices' },
    { name: 'companyWriteAccess', permission: 'canSendKsef' }]);
  assert.deepEqual(f.writes, { fence: 1, invoice: 1, quota: 1, audit: 1, print: 1 });
});

function incomingFixture(state = {}) {
  const writes = { fence: 0, reservation: 0, importLink: 0, invoice: 0, contractor: 0, print: 0, cleanup: 0, cursor: 0 }, checks = [];
  const contractorReads = [], createdContractors = [], updatedContractorIds = [];
  const catalog = (state.contractors || (state.existingContractor
    ? [{ id: contractorId, companyId: state.personal ? null : companyId, userId, nip: '9876543210' }] : [])).map(row => ({ ...row }));
  let inTransaction = false, downloads = 0;
  const profile = state.personal ? null : { id: companyId, userId: ownerId, nip: '1234567890', ksefEnvironment: 'test' };
  const reservationDelegate = { create: async ({ data }) => {
    if (state.duplicate) throw Object.assign(new Error('Already reserved'), { code: 'P2002' });
    writes.reservation++; return { id: 'synthetic-reservation', ...data };
  } };
  const tx = { ksefIncomingImport: { ...reservationDelegate,
    update: async () => { writes.importLink++; return {}; } },
    contractor: { findFirst: async ({ where }) => {
      contractorReads.push(where);
      return catalog.find(row => row.nip === where.nip
        && (where.userId === undefined || row.userId === where.userId)
        && (where.companyId === undefined || row.companyId === where.companyId)
        && (!where.OR || where.OR.some(branch => branch.companyId === null ? row.companyId === null
          : branch.companyId?.isSet === false && !Object.hasOwn(row, 'companyId')))) || null;
    },
      create: async ({ data }) => {
        writes.contractor++; createdContractors.push(data);
        const row = { id: contractorId, ...data }; catalog.push(row); return row;
      },
      update: async ({ where, data }) => {
        writes.contractor++; updatedContractorIds.push(where.id);
        const row = catalog.find(entry => entry.id === where.id); assert.ok(row);
        Object.assign(row, data); return row;
      } },
    invoice: { create: async ({ data }) => { writes.invoice++; return { id: invoiceId, ...data }; } } };
  const db = { companyProfile: { findUnique: async () => profile, findFirst: async () => profile },
    companySettings: { findUnique: async () => ({ nip: '1234567890' }) },
    ksefSettings: { findUnique: async () => ({ environment: 'test' }), upsert: async () => { writes.cursor++; } },
    ksefSession: { findFirst: async () => ({ id: 'synthetic-session', accessToken: 'synthetic scoped token' }) },
    invoice: { findMany: async () => [] },
    ksefIncomingImport: { ...reservationDelegate, deleteMany: async () => ({ count: 0 }),
      delete: async () => { writes.cleanup++; } }, notification: { create: async () => ({}) },
    $transaction: async callback => {
      assert.equal(inTransaction, false); inTransaction = true;
      try { return await callback(tx); } finally { inTransaction = false; }
    },
  };
  const mocks = { ...common(db, tx, writes, checks, state),
    '@/lib/email/sender': { sendEmail: async () => ({}) },
    '@/lib/email/verification': { isEmailVerifiedForSending: () => false },
    '@/lib/ksef/client': { KsefApiError: class extends Error {}, KsefClient: class {
      environment = 'test';
      async queryIncomingInvoices() {
        assert.equal(inTransaction, false, 'Provider queries stay outside database transactions');
        return { invoiceHeaders: [{ ksefNumber: 'SYNTHETIC-KSEF-1' }], hasMore: false };
      }
      async downloadInvoiceXml() {
        assert.equal(inTransaction, false, 'Provider downloads stay outside database transactions'); downloads++;
        if (state.revokeDuringDownload) state.sendRevoked = true;
        return '<synthetic incoming invoice/>';
      }
    } },
    '@/lib/ksef/incomingInvoice': { parseFa3IncomingInvoice: () => ({ number: 'SYNTHETIC/1', issueDate: '2026-10-10',
      seller: { nip: '9876543210', name: 'Synthetic seller', address: {} }, lines: [], currency: 'PLN' }) },
  };
  return { route: loadRoute('sync-incoming', mocks), writes, checks, catalog, contractorReads,
    createdContractors, updatedContractorIds, downloads: () => downloads };
}
const incomingRequest = personal => request(`sync-incoming${personal ? '' : `?companyId=${companyId}`}`);

test('incoming sync denial after preflight creates no reservation, contractor, invoice or import link', async t => {
  for (const state of [{ sendRevoked: true }, { removed: true }, { requireMfa: true }]) {
    await t.test(JSON.stringify(state), async () => {
      const f = incomingFixture(state), response = await f.route.POST(incomingRequest());
      assert.equal(response.status, 403); assert.equal(f.downloads(), 0);
      assert.deepEqual(f.checks, [{ name: 'companyWriteAccess', permission: 'canSendKsef' }]);
      assert.deepEqual(f.writes, { fence: 0, reservation: 0, importLink: 0, invoice: 0, contractor: 0, print: 0, cleanup: 0, cursor: 0 });
    });
  }
});

test('revocation during provider download denies import writes and releases the previously admitted reservation', async () => {
  const f = incomingFixture({ revokeDuringDownload: true }), response = await f.route.POST(incomingRequest());
  assert.equal(response.status, 403); assert.equal(f.downloads(), 1); assert.equal(f.checks.length, 2);
  assert.deepEqual(f.writes, { fence: 1, reservation: 1, importLink: 0, invoice: 0, contractor: 0, print: 0, cleanup: 1, cursor: 0 });
});

test('authorized incoming sync fences reservation and contractor/invoice/link writes separately', async t => {
  for (const existingContractor of [false, true]) {
    await t.test(`existing contractor: ${existingContractor}`, async () => {
      const f = incomingFixture({ existingContractor }), response = await f.route.POST(incomingRequest());
      const result = await response.json();
      assert.equal(response.status, 200, JSON.stringify(result)); assert.equal(result.importedCount, 1);
      assert.equal(f.downloads(), 1);
      assert.deepEqual(f.checks, Array(2).fill({ name: 'companyWriteAccess', permission: 'canSendKsef' }));
      assert.deepEqual(f.writes, { fence: 2, reservation: 1, importLink: 1, invoice: 1, contractor: 1, print: 1, cleanup: 0, cursor: 0 });
    });
  }
});

test('incoming duplicate reservations still skip download and invoice mutation', async () => {
  const f = incomingFixture({ duplicate: true }), response = await f.route.POST(incomingRequest());
  assert.equal(response.status, 200); assert.equal((await response.json()).importedCount, 0);
  assert.equal(f.downloads(), 0); assert.equal(f.writes.invoice, 0); assert.equal(f.writes.contractor, 0);
});

test('incoming legacy personal imports retain cursor updates without a company fence', async () => {
  const f = incomingFixture({ personal: true }), response = await f.route.POST(incomingRequest(true));
  assert.equal(response.status, 200); assert.equal(f.downloads(), 1); assert.deepEqual(f.checks, []);
  assert.deepEqual(f.writes, { fence: 0, reservation: 1, importLink: 1, invoice: 1, contractor: 1, print: 1, cleanup: 0, cursor: 1 });
  assert.equal(f.createdContractors[0].companyId, null);
  assert.equal(f.createdContractors[0].userId, userId);
});

test('company A incoming import never updates company B seller with the same NIP and actor', async () => {
  const foreign = { id: '1'.repeat(24), companyId: '2'.repeat(24), userId,
    nip: '9876543210', name: 'Company B catalog seller', address: { city: 'Original city' } };
  const f = incomingFixture({ contractors: [foreign] }), response = await f.route.POST(incomingRequest());
  assert.equal(response.status, 200);
  assert.deepEqual(f.catalog[0], foreign, 'The other company catalog entry remains unchanged');
  assert.deepEqual(f.updatedContractorIds, []);
  assert.equal(f.createdContractors.length, 1);
  assert.equal(f.createdContractors[0].companyId, companyId);
  assert.equal(f.createdContractors[0].userId, userId);
  assert.deepEqual(f.contractorReads, [{ companyId, nip: foreign.nip }]);
});

test('personal legacy incoming sync updates only actor global sellers, including absent companyId', async t => {
  for (const globalCompany of [{ companyId: null }, {}]) {
    await t.test(Object.hasOwn(globalCompany, 'companyId') ? 'explicit null company' : 'absent company', async () => {
      const foreign = { id: '1'.repeat(24), companyId: '2'.repeat(24), userId, nip: '9876543210', name: 'Company catalog seller' };
      const globalSeller = { id: contractorId, userId, nip: foreign.nip, name: 'Legacy global seller', ...globalCompany };
      const otherActor = { id: '3'.repeat(24), userId: ownerId, nip: foreign.nip, name: 'Other actor global seller', companyId: null };
      const f = incomingFixture({ personal: true, contractors: [foreign, otherActor, globalSeller] });
      assert.equal((await f.route.POST(incomingRequest(true))).status, 200);
      assert.deepEqual(f.catalog[0], foreign); assert.deepEqual(f.catalog[1], otherActor);
      assert.deepEqual(f.updatedContractorIds, [contractorId]); assert.deepEqual(f.createdContractors, []);
      assert.equal(f.catalog[2].name, 'Synthetic seller');
      assert.deepEqual(f.contractorReads, [{ userId, nip: foreign.nip, OR: [{ companyId: null }, { companyId: { isSet: false } }] }]);
    });
  }
});
