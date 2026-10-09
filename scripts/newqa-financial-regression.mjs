import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

/** Actual HTTP/Mongo tests. Requires the integration harness's isolated database. */
export async function checkFinancialHttp({ api, db, owner, other, contractorId, companyId }) {
  const marker = `QA/${randomBytes(6).toString('hex')}`;
  const ids = [];
  const base = { type: 'sale', status: 'draft', sellerCompanyId: null, contractorId,
    issueDate: '2026-10-08', saleDate: '2026-10-08', dueDate: '2026-10-22', currency: 'PLN', paymentMethod: 'transfer', language: 'PL',
    lines: [{ id: 'financial-line', name: 'Żółć Łódź <&> "test"', quantity: 1, netPrice: 100, unit: 'szt.', vatRate: '23' }] };
  const create = async (body, cookie = owner.cookie) => {
    const response = await api('POST', '/api/invoices', body, cookie);
    assert.equal(response.res.status, 201, JSON.stringify(response.data));
    ids.push(response.data.invoice.id); return response.data.invoice;
  };
  let closedPeriod;
  try {
    const otherBuyer = await api('POST', '/api/contractors', { name: `${marker} foreign buyer`, nip: '5250001003', address: { country: 'PL', street: 'Test 2', city: 'Warszawa', postal: '00-001' } }, other.cookie);
    assert.equal(otherBuyer.res.status, 201, JSON.stringify(otherBuyer.data));
    const privateForeign = await create({ ...base, contractorId: otherBuyer.data.contractor.id, number: `${marker}/PRIVATE/SHARED` }, other.cookie);
    const privateOwn = await create({ ...base, number: `${marker}/PRIVATE/OLD` });
    const renamed = await api('PUT', `/api/invoices/${privateOwn.id}`, { ...privateOwn, number: privateForeign.number }, owner.cookie);
    assert.equal(renamed.res.status, 200, 'A number in another user’s unassigned records must not block this owner');
    assert.equal((await api('POST', '/api/invoices', { ...base, number: privateForeign.number }, owner.cookie)).res.status, 409, 'Own duplicates remain blocked');
    const legacy = await api('PUT', `/api/invoices/${privateOwn.id}`, { ...renamed.data.invoice, number: `${marker}/LEGACY` }, owner.cookie);
    assert.equal(legacy.res.status, 200);
    await db.invoice.update({ where: { id: privateOwn.id }, data: { sellerCompanyId: { unset: true } } });
    assert.equal((await api('POST', '/api/invoices', { ...base, number: `${marker}/LEGACY` }, owner.cookie)).res.status, 409, 'Missing legacy company fields remain inside this owner’s number scope');
    const issued = await create({ ...base, sellerCompanyId: companyId, number: `${marker}/ISSUED`, status: 'issued' });
    const payments = await Promise.all(Array.from({ length: 6 }, (_, index) => api('POST', `/api/invoices/${issued.id}/payments`, { amount: 20.5, method: 'transfer', paidAt: '2026-10-08', note: `${marker} unique actual payment ${index}` }, owner.cookie)));
    assert.ok(payments.every(result => result.res.status === 200), JSON.stringify(payments.map(result => result.data)));
    const paid = await db.invoice.findUniqueOrThrow({ where: { id: issued.id }, include: { payments: true } });
    assert.equal(paid.paidAmount, 123); assert.equal(paid.paymentStatus, 'paid'); assert.equal(paid.status, 'paid'); assert.equal(paid.version, issued.version + 6); assert.equal(paid.payments.length, 6);
    assert.equal(paid.payments.reduce((sum, payment) => sum + payment.amount, 0), paid.paidAmount);
    assert.equal(await db.auditLog.count({ where: { documentId: issued.id, action: 'payment_registered' } }), 6);
    assert.equal((await api('POST', `/api/invoices/${issued.id}/payments`, { amount: 1 }, owner.cookie)).res.status, 409, 'Another full-payment intent never creates an overpayment');
    const racing = await create({ ...base, sellerCompanyId: companyId, number: `${marker}/FULL-RACE`, status: 'issued' });
    const completePayments = await Promise.all([1, 2].map(() => api('POST', `/api/invoices/${racing.id}/payments`, { amount: 123 }, owner.cookie)));
    assert.deepEqual(completePayments.map(result => result.res.status).sort(), [200, 409]);
    const completed = await db.invoice.findUniqueOrThrow({ where: { id: racing.id }, include: { payments: true } });
    assert.equal(completed.paidAmount, 123); assert.equal(completed.payments.length, 1); assert.equal(completed.version, racing.version + 1);
    const partialLegacy = await create({ ...base, sellerCompanyId: companyId, number: `${marker}/PARTIAL-LEGACY`, status: 'issued' });
    await db.invoice.update({ where: { id: partialLegacy.id }, data: { paidAmount: 40, paymentStatus: 'partially_paid' } });
    const legacyPayment = await api('POST', `/api/invoices/${partialLegacy.id}/payments`, { amount: 10 }, owner.cookie);
    assert.equal(legacyPayment.res.status, 200, JSON.stringify(legacyPayment.data));
    assert.equal(legacyPayment.data.paidAmount, 50); assert.equal(legacyPayment.data.remainingAmount, 73); assert.equal(legacyPayment.data.invoice.payments.length, 1);
    const completeLegacy = await create({ ...base, sellerCompanyId: companyId, number: `${marker}/PAID-LEGACY`, status: 'issued' });
    await db.invoice.update({ where: { id: completeLegacy.id }, data: { paidAmount: 123, paymentStatus: 'paid', status: 'paid' } });
    assert.equal((await api('POST', `/api/invoices/${completeLegacy.id}/payments`, { amount: 1 }, owner.cookie)).res.status, 409);
    assert.equal(await db.paymentRecord.count({ where: { invoiceId: completeLegacy.id } }), 0, 'Legacy complete payments cannot be reset by a new entry');
    const paidResponse = await api('GET', `/api/invoices/${issued.id}`, undefined, owner.cookie);
    const paidDto = paidResponse.data.invoice;
    for (const patch of [{ paidAmount: 0 }, { paymentStatus: 'unpaid' }]) assert.equal((await api('PUT', `/api/invoices/${issued.id}`, { ...paidDto, ...patch }, owner.cookie)).res.status, 409, 'An invoice edit cannot forge the payment ledger');
    const increased = await api('PUT', `/api/invoices/${issued.id}`, { ...paidDto, lines: [{ ...base.lines[0], netPrice: 200 }] }, owner.cookie);
    assert.equal(increased.res.status, 200, JSON.stringify(increased.data));
    assert.equal(increased.data.invoice.paidAmount, 123); assert.equal(increased.data.invoice.paymentStatus, 'partially_paid'); assert.equal(increased.data.invoice.status, 'issued');
    const restored = await api('PUT', `/api/invoices/${issued.id}`, { ...increased.data.invoice, lines: base.lines }, owner.cookie);
    assert.equal(restored.res.status, 200, JSON.stringify(restored.data));
    assert.equal(restored.data.invoice.paidAmount, 123); assert.equal(restored.data.invoice.paymentStatus, 'paid');
    for (const patch of [{ paidAt: '2026-02-30' }, { paidAt: '2026-02-28T24:00:00Z' }, { method: 'invalid' }, { amount: '1e400' }, { amount: 0.004 }]) assert.equal((await api('POST', `/api/invoices/${issued.id}/payments`, { amount: 1, ...patch }, owner.cookie)).res.status, 400);
    assert.equal((await api('POST', `/api/invoices/${issued.id}/payments`, { amount: 1 }, other.cookie)).res.status, 404);
    assert.equal((await api('POST', `/api/invoices/${privateOwn.id}/payments`, { amount: 1 }, owner.cookie)).res.status, 409, 'A payment cannot silently issue a draft or bypass quota');
    closedPeriod = await db.accountingPeriod.findFirstOrThrow({ where: { companyId, month: '2026-10' } });
    await db.accountingPeriod.update({ where: { id: closedPeriod.id }, data: { status: 'closed' } });
    assert.equal((await api('POST', `/api/invoices/${issued.id}/payments`, { amount: 1 }, owner.cookie)).res.status, 409);
    assert.equal(await db.paymentRecord.count({ where: { invoiceId: issued.id } }), 6, 'Blocked writes leave neither a payment nor partial bookkeeping changes');
    await db.accountingPeriod.update({ where: { id: closedPeriod.id }, data: { status: closedPeriod.status } });
    closedPeriod = null;
    const correctionBase = { ...base, sellerCompanyId: companyId, status: 'issued', isCorrection: true, originalInvoiceId: issued.id,
      originalInvoiceNumber: 'FORGED', originalIssueDate: '1900-01-01', correctionReason: 'Zwrot / zmiana ceny <&>' };
    for (const [suffix, lines, net, vat, gross] of [
      ['NEGATIVE', [{ ...base.lines[0], quantity: -0.25 }], -25, -5.75, -30.75],
      ['MIXED', [{ ...base.lines[0], quantity: -1 }, { ...base.lines[0], id: 'changed-price', quantity: 1, netPrice: 80, vatRate: '8' }], -20, -16.6, -36.6],
    ]) {
      const correction = await create({ ...correctionBase, number: `${marker}/${suffix}`, lines });
      assert.equal(correction.totalNet, net); assert.equal(correction.totalVat, vat); assert.equal(correction.totalGross, gross);
      assert.equal(correction.originalInvoiceNumber, issued.number); assert.equal(correction.originalIssueDate, issued.issueDate);
      assert.deepEqual(correction.originalLines, issued.lines, 'Authoritative original is frozen separately from correction delta rows');
    }
    assert.equal((await api('POST', '/api/invoices', { ...correctionBase, number: `${marker}/FOREIGN`, originalInvoiceId: privateForeign.id, lines: [{ ...base.lines[0], quantity: -1 }] }, owner.cookie)).res.status, 404);
    assert.equal((await api('POST', '/api/invoices', { ...correctionBase, number: `${marker}/BAD-REASON`, correctionReason: '', lines: [{ ...base.lines[0], quantity: -1 }] }, owner.cookie)).res.status, 400);
    assert.equal((await db.invoice.findUniqueOrThrow({ where: { id: issued.id } })).totalGross, 123, 'Corrections never mutate the original financial values');
    console.log('[financial-qa] PASS HTTP two-owner/legacy numbering, six atomic concurrent payments, invalid payment dates/range, period fencing, negative/mixed correction deltas and foreign-source isolation');
  } finally {
    if (closedPeriod) await db.accountingPeriod.update({ where: { id: closedPeriod.id }, data: { status: closedPeriod.status } });
    // Only documents created by this test; issued fixtures are removed from the isolated
    // harness database directly, never through a production-facing destructive action.
    await db.invoice.deleteMany({ where: { id: { in: ids } } });
    await db.invoiceNumberClaim.deleteMany({ where: { id: { contains: marker } } });
  }
}
