require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict'), Module = require('node:module');
const { LEGAL_VERSIONS } = require('../../src/lib/legal/config.ts');
function fixture(options = {}) {
  const originalLoad = Module._load, calls = [];
  const user = { id: '0123456789abcdef01234567', email: 'zażółć";filename=@example.invalid', name: 'Zażółć gęślą jaźń', companyProfiles: [], legalConsents: [] };
  const db = {
    user: { findUnique: async args => { calls.push(['profile', args]); return user; } },
    invoice: { count: async args => { calls.push(['invoices', args]); if (options.countError) throw new Error('Synthetic database failure'); return 1250; } },
    contractor: { count: async args => { calls.push(['contractors', args]); return 2345; } },
  };
  Module._load = function(request, parent, isMain) {
    if (request === '@/lib/auth') return { getSessionUser: async () => user };
    if (request === '@/lib/prisma') return { prisma: db };
    if (request === '@/lib/legal/record-consent') return { recordLegalConsent: async args => { calls.push(['consent', args]); return { success: !options.consentError }; } };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const paths = ['../../src/app/api/consents/route.ts', '../../src/app/api/user/export-data/route.ts'].map(require.resolve);
    for (const path of paths) delete require.cache[path];
    return { consents: require(paths[0]), exportData: require(paths[1]), calls };
  } finally { Module._load = originalLoad; }
}
const consentRequest = body => new Request('http://localhost/api/consents', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
test('optional consent rejects malformed JSON and nonboolean values without recording a withdrawal', async () => {
  const f = fixture();
  for (const accepted of ['true', 1, null, undefined]) assert.equal((await f.consents.POST(consentRequest({ documentType: 'cookie_analytics', accepted }))).status, 400);
  assert.equal((await f.consents.POST(new Request('http://localhost/api/consents', { method: 'POST', body: '{broken' }))).status, 400);
  assert.equal(f.calls.length, 0);
});
test('cookie consents record the cookie policy version; storage failures do not return success', async () => {
  const f = fixture();
  assert.equal((await f.consents.POST(consentRequest({ documentType: 'cookie_analytics', accepted: true }))).status, 200);
  assert.equal(f.calls[0][1].documentVersion, LEGAL_VERSIONS.cookies);
  const broken = fixture({ consentError: true });
  assert.equal((await broken.consents.POST(consentRequest({ documentType: 'marketing_email', accepted: false }))).status, 503);
});
test('personal export has safe ASCII filename and true counts beyond 1000 without loading secret fields or catalogs', async () => {
  const f = fixture();
  const response = await f.exportData.GET(new Request('http://localhost/api/user/export-data'));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-disposition'), /^attachment; filename="fakturaprosto-export-0123456789abcdef01234567-\d{4}-\d{2}-\d{2}\.json"$/);
  const data = await response.json();
  assert.equal(data.invoices_summary.count, 1250); assert.equal(data.contractors_count, 2345);
  assert.equal(data.profile.name, 'Zażółć gęślą jaźń');
  const projection = f.calls.find(call => call[0] === 'profile')[1].select;
  assert.equal(projection.password, undefined); assert.equal(projection.company, undefined); assert.equal(projection.ksef, undefined);
});
test('personal export refuses to report fabricated zero counts after a database failure', async () => {
  const f = fixture({ countError: true });
  const response = await f.exportData.GET(new Request('http://localhost/api/user/export-data'));
  assert.equal(response.status, 500);
  assert.equal((await response.json()).invoices_summary, undefined);
});
