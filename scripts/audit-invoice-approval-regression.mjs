import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';

/** Only new synthetic tenants against a loopback fixture application; no external provider or production data. */
export async function checkInvoiceApprovalHttp(base, db) {
  assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
  const users = [], suffix = randomBytes(8).toString('hex');
  try {
    const owner = await db.user.create({ data: { email: `approval-owner-${suffix}@example.invalid`, password: 'fixture-hash' } }); users.push(owner);
    const employee = await db.user.create({ data: { email: `approval-employee-${suffix}@example.invalid`, password: 'fixture-hash' } }); users.push(employee);
    const company = await db.companyProfile.create({ data: { userId: owner.id, nip: '5260301706', companyName: 'Synthetic approval QA company' } });
    await db.companyMember.create({ data: { companyId: company.id, userId: employee.id, role: 'employee', canIssueInvoices: true, canExport: false, canRecordPayments: false } });
    const contractor = await db.contractor.create({ data: { userId: owner.id, companyId: company.id, name: 'Synthetic approval seller', nip: '5250001003', address: { street: 'Testowa', city: 'Test', postal: '00-001', country: 'PL' } } });
    const token = randomBytes(32).toString('base64url');
    await db.session.create({ data: { userId: employee.id, sessionToken: 'sha256:' + createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3600000) } });
    const call = async (method, path, body) => {
      const response = await fetch(base + path, { method, headers: { Cookie: 'auth_session=' + token, Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return { response, data: await response.json() };
    };
    const payload = { sellerCompanyId: company.id, contractorId: contractor.id, number: `QA/APPROVAL/${suffix}`, type: 'purchase', status: 'issued', issueDate: '2026-10-08', saleDate: '2026-10-08', dueDate: '2026-10-22', currency: 'PLN', paymentMethod: 'transfer', paymentTermDays: 14, lines: [{ name: 'Synthetic line', quantity: 1, unit: 'szt.', netPrice: 100, vatRate: '23' }], approvalStatus: 'approved' };
    const created = await call('POST', '/api/invoices', payload);
    assert.equal(created.response.status, 201);
    assert.equal(created.data.invoice.approvalStatus, 'pending');
    assert.equal((await call('POST', '/api/invoices/approve', { invoiceId: created.data.invoice.id })).response.status, 403);
    for (const fields of [{ status: 'paid' }, { paidAmount: 123 }, { paymentStatus: 'paid' }, { paymentStatus: 'partially_paid' }]) {
      const number = `QA/FORGED-PAID/${suffix}/${Object.keys(fields)[0]}/${Object.values(fields)[0]}`;
      assert.equal((await call('POST', '/api/invoices', { ...payload, number: number.slice(-49), ...fields })).response.status, 409);
      assert.equal(await db.invoice.count({ where: { sellerCompanyId: company.id, number: number.slice(-49) } }), 0);
    }
    const draft = await db.invoice.create({ data: { userId: owner.id, sellerCompanyId: company.id, contractorId: contractor.id, number: `QA/DRAFT/${suffix}`, type: 'sale', status: 'draft', documentStatus: 'draft', issueDate: '2026-10-08', saleDate: '2026-10-08', dueDate: '2026-10-22', currency: 'PLN', lines: payload.lines, totalNet: 100, totalVat: 23, totalGross: 123 } });
    assert.equal((await call('PUT', `/api/invoices/${draft.id}`, { ...payload, number: draft.number, status: 'draft', version: 1 })).response.status, 409);
    assert.equal((await db.invoice.findUnique({ where: { id: draft.id } })).type, 'sale');
    assert.equal((await call('PUT', `/api/invoices/${draft.id}`, { ...payload, number: draft.number, type: 'sale', status: 'draft', version: 1 })).response.status, 409);
    const accepted = await db.invoice.create({ data: { userId: owner.id, sellerCompanyId: company.id, contractorId: contractor.id, number: `QA/KSEF/${suffix}`, type: 'sale', status: 'ksef_sent', documentStatus: 'issued', ksefStatus: 'accepted', ksefNumber: 'SYNTHETIC-NOT-MF-KSEF-NUMBER', issueDate: '2026-10-08', saleDate: '2026-10-08', dueDate: '2026-10-22', currency: 'PLN', lines: payload.lines, totalNet: 100, totalVat: 23, totalGross: 123 } });
    assert.equal((await call('PUT', `/api/invoices/${accepted.id}`, { notes: 'Synthetic approved note', approvalStatus: 'pending' })).response.status, 200);
    for (const body of [{ approvalStatus: 'invalid-state' }, { notes: { invalid: true } }, { notes: 'x'.repeat(4001) }]) assert.equal((await call('PUT', `/api/invoices/${accepted.id}`, body)).response.status, 400);
    assert.equal((await call('PUT', `/api/invoices/${accepted.id}`, { approvalStatus: 'approved' })).response.status, 409);
    console.log('[approval-audit] PASS: no fabricated initial payments, cost preapproval or draft-type conversion; accepted KSeF approval/notes validation retained');
  } finally { for (const user of users.reverse()) await db.user.delete({ where: { id: user.id } }); }
}
