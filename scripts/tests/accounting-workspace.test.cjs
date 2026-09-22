require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const { accountingWorkspaceId, changeAccountingTask } = require('../../src/lib/accounting-workspace.ts');
test('shared month identities separate companies and reject invalid months', () => {
  assert.notEqual(accountingWorkspaceId('a', '2026-09'), accountingWorkspaceId('b', '2026-09'));
  assert.notEqual(accountingWorkspaceId('a', '2026-09'), accountingWorkspaceId('a', '2026-10'));
  assert.throws(() => accountingWorkspaceId('a', '2026-13'));
});
test('accounting task changes preserve unrelated tasks and keep authorship', () => {
  const initial = changeAccountingTask([], { action: 'add', title: 'Brak FV', kind: 'missing' }, 'a');
  const second = changeAccountingTask(initial, { action: 'add', title: 'Sprawdź VAT', kind: 'check' }, 'a');
  const updated = changeAccountingTask(second, { action: 'done', itemId: initial[0].id, done: true }, 'b');
  assert.equal(updated[0].done, true); assert.equal(updated[0].changedBy, 'b'); assert.deepEqual(updated[1], second[1]);
  assert.equal(initial[0].done, false);
  assert.throws(() => changeAccountingTask(second, { action: 'done', itemId: 'missing', done: true }, 'b'));
  assert.throws(() => changeAccountingTask(second, { action: 'done', itemId: initial[0].id, done: 'true' }, 'b'));
});
