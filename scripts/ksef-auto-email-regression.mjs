import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('./register-ts.cjs');
const Module = require('node:module');

/** Real isolated MongoDB transactions; both SMTP and PDF are stubbed, with no external requests. */
export async function checkKsefAutoEmail(db) {
  const user = await db.user.create({ data: { email: `auto-ksef-${randomBytes(8).toString('hex')}@example.test`, password: 'synthetic-hash', role: 'owner' } });
  let originalLoad;
  const modulePath = require.resolve('../src/lib/email/auto-send.ts');
  const dependencyPaths = ['document-scope', 'permissions', 'company-scope', 'security-policy', 'auth', 'db', 'prisma', 'email/verification', 'email/manual-delivery', 'audit', 'pdf/invoice-print']
    .map(name => require.resolve(`../src/lib/${name}.ts`));
  const previousModules = new Map(dependencyPaths.map(path => [path, require.cache[path]]));
  const databasePaths = new Set(['db', 'prisma'].map(name => require.resolve(`../src/lib/${name}.ts`)));
  const sends = [];
  let pdfError = false, mailError = null, pdfPause = null, mailHang = false, pdfCalls = 0;
  try {
    const seller = await db.companyProfile.create({ data: { userId: user.id, nip: '5260301706', companyName: 'Isolated email seller', isDefault: true } });
    const contractor = await db.contractor.create({ data: { userId: user.id, name: 'Email buyer', nip: '5250001003', email: 'wrong-contractor@example.test', address: {} } });
    // Earlier regression hooks may have cached access helpers bound to a global Prisma client.
    // Reload the complete access chain against the injected isolated client, then restore it.
    for (const path of dependencyPaths) delete require.cache[path];
    // Dynamic imports run after Module._load is restored. Keep the fake PDF in the ordinary
    // module cache for this isolated hook, then restore the previous module in finally.
    const pdfPath = require.resolve('../src/lib/pdf/invoice-print.ts');
    const pdfModule = new Module(pdfPath);
    pdfModule.filename = pdfPath; pdfModule.loaded = true;
    pdfModule.exports = { invoicePdf: async () => {
      pdfCalls++;
      if (pdfError) throw new Error('Injected PDF generation failure');
      if (pdfPause) { const pause = pdfPause; pdfPause = null; pause.entered(); await pause.wait; }
      return { buffer: Buffer.from('%PDF-synthetic') };
    } };
    require.cache[pdfPath] = pdfModule;
    originalLoad = Module._load;
    Module._load = function(request, parent, main) {
      if (request === '@/lib/db' || request === '@/lib/prisma') return { prisma: db, default: db };
      if ((request === './db' || request === './prisma') && databasePaths.has(Module._resolveFilename(request, parent)))
        return { prisma: db, default: db };
      if (request === '@/lib/email/sender') return {
        getEmailConfigStatus: () => ({ configured: true, provider: 'smtp' }),
        sendEmail: async payload => {
          sends.push(payload);
          if (mailHang) return new Promise((_resolve, reject) => {
            const abort = () => reject(Object.assign(new Error('Synthetic provider deadline after submission'), { deliveryUncertain: true }));
            payload.signal.addEventListener('abort', abort, { once: true });
            if (payload.signal.aborted) abort();
          });
          if (mailError) throw mailError;
          return { success: true, provider: 'smtp', messageId: 'synthetic-message' };
        },
      };
      return originalLoad.call(this, request, parent, main);
    };
    delete require.cache[modulePath];
    const { triggerAutoEmailOnKsef, processKsefAutoEmails, configureKsefAutoEmail } = require(modulePath);
    const { claimManualEmail, startManualEmail, finishManualEmail, resolveManualEmail } = require('../src/lib/email/manual-delivery.ts');
    Module._load = originalLoad;
    const config = { userId: user.id, recipientEmail: 'selected-recipient@example.test', cc: 'copy@example.test', bcc: 'hidden@example.test', subject: 'Custom invoice subject', messageBody: 'Custom body', attachPdf: true, attachXml: true };
    const number = '5260301706-20261007-AABBCC-DD1122-33';
    const upo = `<Potwierdzenie><Dokument><NumerKSeFDokumentu>${number}</NumerKSeFDokumentu><DataNadaniaNumeruKSeF>2026-10-07T12:00:00Z</DataNadaniaNumeruKSeF></Dokument></Potwierdzenie>`;
    let counter = 0;
    async function fixture(overrides = {}) {
      return db.invoice.create({ data: {
        userId: user.id, sellerCompanyId: seller.id, contractorId: contractor.id, number: `AUTO/${++counter}`,
        type: 'sale', status: 'ksef_active', issueDate: '2026-10-07', saleDate: '2026-10-07', dueDate: '2026-10-21',
        lines: [], ksefStatus: 'accepted', ksef: { environment: 'production' }, ksefNumber: number,
        upoXml: upo, ksefXml: '<Faktura>original accepted XML</Faktura>',
        autoSendEmailOnKsef: true, autoKsefEmailConfig: config, autoKsefEmailStatus: 'queued', ...overrides,
      } });
    }
    for (const overrides of [{ upoXml: null }, { ksef: { environment: 'demo' } }, { ksefStatus: 'rejected' }, { upoXml: upo.replace(number, 'OTHER-INVOICE') }]) {
      assert.equal(await triggerAutoEmailOnKsef((await fixture(overrides)).id), false);
    }
    assert.equal(sends.length, 0, 'No email before genuine matching UPO, or after rejection/demo');

    const concurrent = await fixture();
    const results = await Promise.all(Array.from({ length: 8 }, () => triggerAutoEmailOnKsef(concurrent.id)));
    assert.equal(results.filter(Boolean).length, 1, 'Exactly one concurrent outbox winner');
    assert.equal(sends.length, 1);
    const payload = sends[0];
    assert.equal(payload.to, config.recipientEmail); assert.equal(payload.cc, config.cc); assert.equal(payload.bcc, config.bcc);
    assert.equal(payload.singleAttempt, true); assert.equal(payload.idempotencyKey, `ksef-auto-${concurrent.id}`);
    assert.deepEqual(payload.attachments.map(a => a.content.toString()), ['%PDF-synthetic', '<Faktura>original accepted XML</Faktura>', upo]);
    assert.match(payload.text, /Custom body/); assert.ok(payload.text.includes(number));
    assert.equal((await db.invoice.findUnique({ where: { id: concurrent.id } })).autoKsefEmailStatus, 'accepted');
    assert.equal(await db.invoiceEmailLog.count({ where: { invoiceId: concurrent.id, status: 'accepted' } }), 1);
    await triggerAutoEmailOnKsef(concurrent.id); await processKsefAutoEmails(user.id);
    assert.equal(sends.length, 1, 'Repeated status polling and empty queue processing must not resend');

    const pending = await fixture();
    pdfError = true;
    assert.equal(await triggerAutoEmailOnKsef(pending.id), false);
    assert.equal(sends.length, 1, 'A required PDF error never sends a partial email');
    assert.equal((await db.invoice.findUnique({ where: { id: pending.id } })).autoKsefEmailStatus, 'retry');
    pdfError = false;
    await db.invoice.update({ where: { id: pending.id }, data: { autoKsefEmailNextAttemptAt: new Date(0) } });
    assert.equal((await processKsefAutoEmails(user.id)).accepted, 1, 'Retry independently of KSeF dispatch');
    assert.equal(sends.length, 2);

    const definite = await fixture({ autoKsefEmailConfig: { ...config, attachPdf: false, attachXml: false } });
    const callsBeforeNoPdf = pdfCalls;
    mailError = Object.assign(new Error('Explicit SMTP refusal'), { deliveryUncertain: false });
    await triggerAutoEmailOnKsef(definite.id);
    assert.equal(pdfCalls, callsBeforeNoPdf, 'Unselected PDF never imports or invokes PDF generation');
    assert.equal(sends.at(-1).attachments.length, 1, 'Unselected PDF/XML are not added; UPO is always required');
    assert.equal((await db.invoice.findUnique({ where: { id: definite.id } })).autoKsefEmailStatus, 'retry');
    assert.equal(await db.invoiceEmailLog.count({ where: { invoiceId: definite.id, status: 'failed' } }), 1);
    mailError = null;
    await db.invoice.update({ where: { id: definite.id }, data: { autoKsefEmailNextAttemptAt: new Date(0) } });
    await processKsefAutoEmails(user.id);
    assert.equal((await db.invoice.findUnique({ where: { id: definite.id } })).autoKsefEmailStatus, 'accepted');

    const uncertain = await fixture();
    mailError = new Error('SMTP timeout after DATA');
    await triggerAutoEmailOnKsef(uncertain.id); mailError = null;
    assert.equal((await db.invoice.findUnique({ where: { id: uncertain.id } })).autoKsefEmailStatus, 'verify_needed');
    assert.equal(await db.invoiceEmailLog.count({ where: { invoiceId: uncertain.id, status: 'verify_needed' } }), 1);
    const beforeRecovery = sends.length;
    await triggerAutoEmailOnKsef(uncertain.id); await processKsefAutoEmails(user.id);
    assert.equal(sends.length, beforeRecovery, 'Ambiguous SMTP must never retry automatically');
    await assert.rejects(configureKsefAutoEmail(uncertain.id, config), /wymaga sprawdzenia/);

    const expiredToken = randomBytes(12).toString('hex');
    const expired = await fixture({ autoKsefEmailStatus: 'sending', autoKsefEmailLockedUntil: new Date(0), autoKsefEmailLeaseToken: expiredToken });
    await db.invoiceEmailLog.create({ data: { id: expiredToken, invoiceId: expired.id, userId: user.id, to: config.recipientEmail, subject: 'Interrupted send', provider: 'smtp', status: 'queued' } });
    await processKsefAutoEmails(user.id);
    assert.equal((await db.invoice.findUnique({ where: { id: expired.id } })).autoKsefEmailStatus, 'verify_needed');
    assert.equal((await db.invoiceEmailLog.findUnique({ where: { id: expiredToken } })).status, 'verify_needed');
    assert.equal(sends.length, beforeRecovery, 'Restart after sending does not repeat SMTP');

    const disabled = await fixture();
    await configureKsefAutoEmail(disabled.id, null);
    assert.equal(await triggerAutoEmailOnKsef(disabled.id), false);
    assert.equal((await db.invoice.findUnique({ where: { id: disabled.id } })).autoSendEmailOnKsef, false);

    const preparing = await fixture();
    let releasePdf, enteredPdf;
    const entered = new Promise(resolve => { enteredPdf = resolve; });
    pdfPause = { entered: enteredPdf, wait: new Promise(resolve => { releasePdf = resolve; }) };
    const cancelledAttempt = triggerAutoEmailOnKsef(preparing.id);
    await entered;
    const beforeCancel = sends.length;
    await configureKsefAutoEmail(preparing.id, null);
    releasePdf();
    assert.equal(await cancelledAttempt, false);
    assert.equal(sends.length, beforeCancel, 'Cancellation during attachment generation fences the old worker before SMTP');
    assert.equal((await db.invoice.findUnique({ where: { id: preparing.id } })).autoKsefEmailStatus, 'cancelled');

    const stale = await fixture();
    const enteredStale = new Promise(resolve => { enteredPdf = resolve; });
    pdfPause = { entered: enteredPdf, wait: new Promise(resolve => { releasePdf = resolve; }) };
    const oldAttempt = triggerAutoEmailOnKsef(stale.id);
    await enteredStale;
    const beforeStale = sends.length;
    await db.invoice.update({ where: { id: stale.id }, data: { autoKsefEmailLockedUntil: new Date(0) } });
    await processKsefAutoEmails(user.id);
    releasePdf();
    assert.equal(await oldAttempt, false);
    assert.equal(sends.length, beforeStale + 1, 'An expired preparing lease has one fresh winner; stale lease cannot send');
    assert.equal((await db.invoice.findUnique({ where: { id: stale.id } })).autoKsefEmailStatus, 'accepted');

    const legacy = await fixture({ autoKsefEmailConfig: {}, sentToEmail: 'legacy-selected@example.test' });
    await db.invoiceEmailLog.create({ data: { invoiceId: legacy.id, userId: user.id, to: 'legacy-selected@example.test', cc: 'legacy-copy@example.test', subject: 'Legacy custom subject', messageBody: 'Legacy custom body', provider: 'smtp', status: 'accepted', attachments: [{ filename: 'Faktura_legacy.pdf' }] } });
    assert.equal(await triggerAutoEmailOnKsef(legacy.id), true);
    assert.equal(sends.at(-1).to, 'legacy-selected@example.test');
    assert.equal(sends.at(-1).cc, 'legacy-copy@example.test');
    assert.equal(sends.at(-1).attachments.length, 2, 'Legacy opt-ins reuse original PDF choice plus UPO, not all attachments');

    await Promise.all(Array.from({ length: 55 }, () => fixture({ ksef: { environment: 'demo' }, updatedAt: new Date(0) })));
    const afterDemos = await fixture();
    assert.equal((await processKsefAutoEmails(user.id)).accepted, 1, 'Fifty older demo documents cannot starve genuine deliveries');
    assert.equal((await db.invoice.findUnique({ where: { id: afterDemos.id } })).autoKsefEmailStatus, 'accepted');

    const neverStarted = await fixture();
    const beforeBudget = sends.length;
    assert.equal(await triggerAutoEmailOnKsef(neverStarted.id, { deadlineAtMs: Date.now() - 1 }), false);
    assert.equal((await db.invoice.findUnique({ where: { id: neverStarted.id } })).autoKsefEmailAttempts, 0, 'Expired budget never claims a new outbox job');
    await configureKsefAutoEmail(neverStarted.id, null);

    const slowPdf = await fixture();
    const enteredSlow = new Promise(resolve => { enteredPdf = resolve; });
    pdfPause = { entered: enteredPdf, wait: new Promise(resolve => { releasePdf = resolve; }) };
    const timedPreparation = triggerAutoEmailOnKsef(slowPdf.id, { deadlineAtMs: Date.now() + 300 });
    await enteredSlow;
    assert.equal(await timedPreparation, false);
    releasePdf();
    assert.equal(sends.length, beforeBudget, 'Late PDF completion cannot cross the provider boundary');
    assert.equal((await db.invoice.findUnique({ where: { id: slowPdf.id } })).autoKsefEmailStatus, 'retry');
    await configureKsefAutoEmail(slowPdf.id, null);

    const slowProvider = await fixture({ autoKsefEmailConfig: { ...config, attachPdf: false } });
    mailHang = true;
    assert.equal(await triggerAutoEmailOnKsef(slowProvider.id, { deadlineAtMs: Date.now() + 300 }), false);
    mailHang = false;
    assert.equal((await db.invoice.findUnique({ where: { id: slowProvider.id } })).autoKsefEmailStatus, 'verify_needed');
    assert.equal(sends.length, beforeBudget + 1);
    await processKsefAutoEmails(user.id);
    assert.equal(sends.length, beforeBudget + 1, 'Worker deadline after provider submission never becomes an automatic retry');

    await db.user.update({ where: { id: user.id }, data: { emailVerificationRequiredAt: new Date(), emailVerifiedAt: null } });
    const unverified = await fixture();
    assert.equal(await triggerAutoEmailOnKsef(unverified.id), false);
    assert.equal(sends.length, beforeBudget + 1, 'Unverified new accounts cannot auto-email outside recipients');
    assert.equal((await db.invoice.findUnique({ where: { id: unverified.id } })).autoKsefEmailStatus, 'failed');
    await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    await configureKsefAutoEmail(unverified.id, config);
    assert.equal(await triggerAutoEmailOnKsef(unverified.id), true, 'Verified account can explicitly resume the saved auto-email');
    const manualFirst = await fixture();
    const manualLease = await claimManualEmail({ userId: user.id, invoiceId: manualFirst.id, key: 'manual-first', requestHash: 'manual-first', targetHash: manualFirst.id }, db);
    await startManualEmail(manualLease, { to: config.recipientEmail, subject: 'Manual fixture', messageBody: 'Synthetic', provider: 'smtp', attachments: [] }, db);
    const beforeCrossFence = sends.length;
    assert.equal(await triggerAutoEmailOnKsef(manualFirst.id), false);
    assert.equal(sends.length, beforeCrossFence, 'An active manual send fences the automatic provider boundary');
    await finishManualEmail(manualLease, { status: 'verify_needed' }, db);
    await configureKsefAutoEmail(manualFirst.id, config);
    assert.equal(await triggerAutoEmailOnKsef(manualFirst.id), false);
    assert.equal(sends.length, beforeCrossFence, 'An uncertain manual send blocks auto-email even after explicit reconfiguration');
    await resolveManualEmail({ userId: user.id, invoiceId: manualFirst.id, deliveryId: manualLease.id, result: 'not-sent' }, db);
    await configureKsefAutoEmail(manualFirst.id, config);
    assert.equal(await triggerAutoEmailOnKsef(manualFirst.id), true);
    assert.equal(sends.length, beforeCrossFence + 1, 'Explicit checked non-delivery allows one later automatic attempt');
    const autoFirst = await fixture();
    const enteredAuto = new Promise(resolve => { enteredPdf = resolve; });
    pdfPause = { entered: enteredPdf, wait: new Promise(resolve => { releasePdf = resolve; }) };
    const activeAuto = triggerAutoEmailOnKsef(autoFirst.id);
    await enteredAuto;
    await assert.rejects(claimManualEmail({ userId: user.id, invoiceId: autoFirst.id, key: 'auto-first', requestHash: 'auto-first', targetHash: autoFirst.id }, db), error => error.code === 'DUPLICATE_REQUEST');
    releasePdf();
    assert.equal(await activeAuto, true, 'A manual racing intent cannot duplicate an already preparing automatic send');
    console.log('[integration] PASS KSeF auto-email outbox: true UPO, selected recipient/attachments, one concurrent send, independent retry, bounded preparation/provider deadlines, verified sender and ambiguous-send recovery without duplication');
  } finally {
    if (originalLoad) Module._load = originalLoad;
    delete require.cache[modulePath];
    for (const [path, previous] of previousModules) {
      if (previous) require.cache[path] = previous;
      else delete require.cache[path];
    }
    await db.user.delete({ where: { id: user.id } });
  }
}
