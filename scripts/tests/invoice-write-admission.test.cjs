require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const { InvoiceWriteAdmission } = require('../../src/lib/invoice-write-admission.ts');
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

test('invoice admission bounds active transactions and preserves FIFO after successful and failed commits', async () => {
  const gate = new InvoiceWriteAdmission(2, 8, 1000), barriers = Array.from({ length: 5 }, deferred), events = [];
  let active = 0, maximum = 0;
  const jobs = barriers.map((barrier, index) => gate.run(async () => {
    events.push(index); active++; maximum = Math.max(maximum, active);
    try { await barrier.promise; if (index === 1) throw new Error('synthetic transaction rollback'); return index; }
    finally { active--; }
  }));
  const outcomes = Promise.allSettled(jobs);
  await Promise.resolve(); assert.deepEqual(events, [0, 1]);
  barriers[1].resolve(); await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(events, [0, 1, 2]);
  barriers[0].resolve(); await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(events, [0, 1, 2, 3]);
  barriers[2].resolve(); await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(events, [0, 1, 2, 3, 4]);
  barriers[3].resolve(); barriers[4].resolve();
  assert.equal((await outcomes)[1].status, 'rejected'); assert.equal(maximum, 2);
  assert.equal(await gate.run(async () => 'after failures'), 'after failures');
});

test('bounded admission rejects overflow before any business callback executes', async () => {
  const gate = new InvoiceWriteAdmission(1, 1, 1000), hold = deferred(); let rejectedWork = 0;
  const first = gate.run(() => hold.promise), second = gate.run(async () => 'queued');
  await assert.rejects(gate.run(async () => rejectedWork++), error => error.status === 503 && error.code === 'WRITE_ADMISSION_BUSY');
  assert.equal(rejectedWork, 0); hold.resolve(); await first; assert.equal(await second, 'queued');
});

test('queued abort cleans its timer/listener and does not block the next transaction', async () => {
  const gate = new InvoiceWriteAdmission(1, 2, 1000), hold = deferred(), controller = new AbortController(); let cancelledWork = 0;
  const first = gate.run(() => hold.promise), cancelled = gate.run(async () => cancelledWork++, controller.signal), third = gate.run(async () => 'next');
  const rejection = assert.rejects(cancelled, error => error.status === 408 && error.code === 'REQUEST_ABORTED');
  controller.abort(); await rejection; hold.resolve(); await first; assert.equal(await third, 'next'); assert.equal(cancelledWork, 0);
  assert.equal(await gate.run(async () => 'after abort'), 'after abort');
});

test('queued deadline expires before any business callback and frees bounded queue capacity', async () => {
  const gate = new InvoiceWriteAdmission(1, 1, 15), hold = deferred(); let expiredWork = 0;
  const first = gate.run(() => hold.promise), expired = gate.run(async () => expiredWork++);
  await assert.rejects(expired, error => error.status === 503 && error.code === 'WRITE_ADMISSION_BUSY');
  assert.equal(expiredWork, 0); const next = gate.run(async () => 'next'); hold.resolve(); await first; assert.equal(await next, 'next');
});

test('permission revoked while waiting is checked when the admitted business transaction starts', async () => {
  const gate = new InvoiceWriteAdmission(1, 1, 1000), hold = deferred(); let permitted = true, businessWrites = 0;
  const first = gate.run(() => hold.promise), pending = gate.run(async () => {
    if (!permitted) throw Object.assign(new Error('revoked'), { status: 403 });
    businessWrites++;
  });
  const rejection = assert.rejects(pending, error => error.status === 403);
  permitted = false; hold.resolve(); await first; await rejection; assert.equal(businessWrites, 0);
});

test('abort immediately after slot reservation releases the slot without starting its transaction', async () => {
  const gate = new InvoiceWriteAdmission(1, 1, 1000), controller = new AbortController(); let writes = 0;
  const pending = gate.run(async () => writes++, controller.signal); controller.abort();
  await assert.rejects(pending, error => error.code === 'REQUEST_ABORTED');
  assert.equal(writes, 0); assert.equal(await gate.run(async () => 'released'), 'released');
});

test('wall-clock adjustment does not prematurely expire a queued transaction', async () => {
  const gate = new InvoiceWriteAdmission(1, 1, 1000), hold = deferred();
  const first = gate.run(() => hold.promise), pending = gate.run(async () => 'queued');
  const originalNow = Date.now;
  try {
    Date.now = () => originalNow() + 86400000;
    hold.resolve(); await first; assert.equal(await pending, 'queued');
  } finally { Date.now = originalNow; }
});
