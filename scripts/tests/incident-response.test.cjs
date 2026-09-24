const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('../register-ts.cjs');

const { POST: sendHandler } = require('../../src/app/api/ksef/send/route.ts');
const { POST: queueProcessHandler } = require('../../src/app/api/ksef/queue/process/route.ts');

test('Monitoring & Incident Response (Checklist Item 7)', async (t) => {
  await t.test('circuit breaker KSEF_PAUSE_DISPATCH=true rejects direct send with 503', async () => {
    const origEnv = process.env.KSEF_PAUSE_DISPATCH;
    process.env.KSEF_PAUSE_DISPATCH = 'true';

    try {
      const dummyReq = new Request('http://localhost/api/ksef/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ invoiceId: '507f1f77bcf86cd799439011' }),
      });

      const res = await sendHandler(dummyReq);
      assert.equal(res.status, 503, 'Should respond with HTTP 503');

      const data = await res.json();
      assert.equal(data.code, 'KSEF_DISPATCH_PAUSED');
      assert.ok(data.error.includes('wstrzymana'), 'Error message should inform about paused dispatch');
    } finally {
      process.env.KSEF_PAUSE_DISPATCH = origEnv;
    }
  });

  await t.test('circuit breaker KSEF_PAUSE_DISPATCH=true halts queue processing worker with 503', async () => {
    const origEnv = process.env.KSEF_PAUSE_DISPATCH;
    process.env.KSEF_PAUSE_DISPATCH = 'true';

    try {
      const dummyReq = new Request('http://localhost/api/ksef/queue/process', {
        method: 'POST',
        headers: { authorization: 'Bearer test-cron-secret' },
      });

      const res = await queueProcessHandler(dummyReq);
      assert.equal(res.status, 503, 'Should respond with HTTP 503');

      const data = await res.json();
      assert.equal(data.paused, true);
      assert.equal(data.processed, 0);
    } finally {
      process.env.KSEF_PAUSE_DISPATCH = origEnv;
    }
  });

  await t.test('docs/INCIDENT-RESPONSE.md exists and covers all operational recovery requirements', () => {
    const docPath = path.resolve(__dirname, '../../docs/INCIDENT-RESPONSE.md');
    assert.ok(fs.existsSync(docPath), 'docs/INCIDENT-RESPONSE.md must exist');

    const content = fs.readFileSync(docPath, 'utf8');

    // Incident responsibilities & recipient
    assert.ok(content.includes('faktura.prosto@gmail.com'), 'Must list operator contact email');
    assert.ok(content.includes('DevOps') || content.includes('Inżynier'), 'Must specify on-call DevOps/engineer role');

    // Circuit breaker instructions
    assert.ok(content.includes('KSEF_PAUSE_DISPATCH=true'), 'Must document circuit breaker variable');

    // verify_needed reconciliation
    assert.ok(content.includes('verify_needed'), 'Must cover verify_needed status');
    assert.ok(content.includes('zakaz') || content.includes('Zakaz') || content.includes('ZAKAZ'), 'Must strictly prohibit blind resending');

    // Rollback procedure
    assert.ok(content.includes('Netlify'), 'Must document Netlify rollback');
    assert.ok(content.includes('Publish deploy') || content.includes('rollback'), 'Must mention Netlify 1-click rollback');
    assert.ok(content.includes('migrate'), 'Must document database migration rollback');
  });
});
