require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const { nextRecurrence, warsawDate, addCalendarDays } = require('../../src/lib/scheduling.ts');
test('recurrence preserves month-end anchor across short months and leap years',()=>{
  assert.equal(nextRecurrence('2026-01-31','monthly',31),'2026-02-28');
  assert.equal(nextRecurrence('2026-02-28','monthly',31),'2026-03-31');
  assert.equal(nextRecurrence('2024-02-29','yearly',29),'2025-02-28');
  assert.equal(nextRecurrence('2027-02-28','yearly',29),'2028-02-29');
  assert.equal(nextRecurrence('2026-11-30','quarterly',30),'2027-02-28');
});
test('Warsaw schedule dates and calendar days survive UTC boundaries and DST',()=>{
  assert.equal(warsawDate(new Date('2026-03-28T23:30:00Z')),'2026-03-29');
  assert.equal(warsawDate(new Date('2026-07-01T22:30:00Z')),'2026-07-02');
  assert.equal(addCalendarDays('2026-03-28',2),'2026-03-30');
  assert.equal(nextRecurrence('2026-03-28','weekly',28),'2026-04-04');
  assert.throws(()=>nextRecurrence('2026-02-30','monthly',30));
});
