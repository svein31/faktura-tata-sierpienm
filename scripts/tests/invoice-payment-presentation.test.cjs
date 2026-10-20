const test = require('node:test');
const assert = require('node:assert/strict');
require('../register-ts.cjs');
const { invoicePaymentPresentation: present } = require('../../src/lib/invoice-payment-presentation.ts');
const invoice = { status: 'issued', paymentStatus: 'unpaid', dueDate: '2026-10-22', paidAmount: 0 };
const today = '2026-10-20';

test('KSeF acceptance and rejection never imply payment', () => {
  for (const ksef of [{ status: 'ACTIVE', number: 'accepted' }, { status: 'REJECTED' }, { status: 'SENT' }]) {
    assert.equal(present({ ...invoice, ksef }, today).label, 'Do zapłaty');
  }
});
test('canonical paid state wins over a past deadline and legacy transmission status', () => {
  assert.equal(present({ ...invoice, status: 'ksef_active', paymentStatus: 'paid', dueDate: '2026-09-01' }, today).label, 'Opłacona');
  assert.equal(present({ ...invoice, status: 'paid', dueDate: '2026-09-01' }, today).label, 'Opłacona');
});
test('partial payments remain distinct before and after the due date', () => {
  assert.equal(present({ ...invoice, paymentStatus: 'partially_paid' }, today).label, 'Częściowo opłacona');
  assert.equal(present({ ...invoice, paidAmount: 10, dueDate: '2026-10-19' }, today).label, 'Częściowo · po terminie');
});
test('a due date is not overdue on the due day', () => {
  assert.equal(present({ ...invoice, dueDate: today }, today).label, 'Do zapłaty');
  assert.equal(present({ ...invoice, dueDate: '2026-10-19' }, today).label, 'Po terminie');
});
test('drafts, cancelled documents and correction settlements do not invent a debt', () => {
  assert.equal(present({ ...invoice, status: 'draft', dueDate: '2020-01-01' }, today).label, 'Szkic');
  assert.equal(present({ ...invoice, documentStatus: 'cancelled' }, today).label, 'Anulowana');
  assert.equal(present({ ...invoice, isCorrection: true, totalGross: -100, dueDate: '2020-01-01' }, today).label, 'Rozliczenie korekty');
});
