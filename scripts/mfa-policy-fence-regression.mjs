import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ObjectId } from 'mongodb';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ts = require('typescript');
const policyFile = path.join(root, 'src/app/api/companies/[id]/security/route.ts');
const sha = source => createHash('sha256').update(source).digest('hex');
const fixedTouch = ', updatedAt: new Date(Math.max(Date.now(), mfa.updatedAt.getTime() + 1))';
const fixedComment = '// Advance even within one clock millisecond so this write contends with MFA disabling.';
const previousComment = '// Contend on the same row as MFA disabling; a policy cannot race its proof.';
const baselinePolicyRouteSha256 = '60358b12e6e72f8d0a7dcb22cac5639ae021ac84fa42b235cf62832600b63be8';

function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
async function bounded(promise, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Barrier timed out: ${label}`)), 10000); })]); }
  finally { clearTimeout(timer); }
}

// Use the actual routes, security checks, company fence, audit and session writes.
// Browser identity and the already-verified password/MFA proof are synthetic;
// this avoids unrelated out-of-transaction code consumption changing the row.
function application(db, user, sessionId, { baseline = false, clock } = {}) {
  const cache = new Map();
  const load = filename => {
    if (filename === path.join(root, 'src/lib/db.ts')) return { prisma: db };
    if (filename === path.join(root, 'src/lib/auth.ts')) return { getSessionUser: async () => user, getSession: async () => ({ user, sessionId }), verifyPassword: async password => password === 'fixture-password' };
    if (filename === path.join(root, 'src/lib/mfa.ts')) return { consumeMfaCode: async () => ({ record: await db.userMfa.findUniqueOrThrow({ where: { userId: user.id } }) }) };
    if (filename === path.join(root, 'src/lib/rate-limit.ts')) return { rateLimitSubject: async () => ({ allowed: true }) };
    if (filename === path.join(root, 'src/lib/error-report.ts')) return { reportUnexpectedError: error => { throw error; } };
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = new Module(filename); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename)); cache.set(filename, mod);
    mod.require = request => {
      if (request === 'server-only') return {};
      if (request.startsWith('@/') || request.startsWith('.')) {
        const base = request.startsWith('@/') ? path.join(root, 'src', request.slice(2)) : path.resolve(path.dirname(filename), request);
        const sourcePath = [base, `${base}.ts`, `${base}.tsx`].find(candidate => existsSync(candidate) && /\.tsx?$/.test(candidate));
        const resolved = sourcePath || require.resolve(base);
        if (resolved.startsWith(path.join(root, 'src') + path.sep) && /\.tsx?$/.test(resolved)) return load(resolved);
        return require(resolved);
      }
      return require(request);
    };
    let source = readFileSync(filename, 'utf8');
    if (baseline && filename === policyFile) {
      assert.equal(source.split(fixedTouch).length, 2, 'Reconstruct only the captured pre-fix MFA touch');
      source = source.replace(fixedTouch, '').replace(fixedComment, previousComment);
      assert.equal(sha(source), baselinePolicyRouteSha256, 'The baseline is the exact captured pre-fix policy route');
    }
    const frozen = clock !== undefined && [policyFile, path.join(root, 'src/lib/company-write.ts')].includes(filename)
      ? `const Date = class extends globalThis.Date { constructor(...args) { super(...(args.length ? args : [${clock}])); } static now() { return ${clock}; } };\n` : '';
    mod._compile(frozen + ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
    return mod.exports;
  };
  return { policy: load(policyFile), mfa: load(path.join(root, 'src/app/api/auth/mfa/route.ts')) };
}

function observedDb(db, { collisionTimestamp, afterRead, afterTouch, afterDisable } = {}) {
  const state = { attempts: 0, conflicts: [], explicitTouches: [] };
  const wrap = (target, transactional = false) => new Proxy(target, { get(client, key) {
    if (key === '$transaction') return async (callback, options) => {
      state.attempts++;
      try { return await client.$transaction(tx => callback(wrap(tx, true)), options); }
      catch (error) { if (error.code === 'P2034') state.conflicts.push(error.code); throw error; }
    };
    const value = client[key];
    if (!value || typeof value !== 'object' || !('findUnique' in value)) return typeof value === 'function' ? value.bind(client) : value;
    return new Proxy(value, { get(delegate, operation) {
      const fn = delegate[operation];
      if (typeof fn !== 'function') return fn;
      return async (...args) => {
        if (transactional && key === 'userMfa' && operation === 'update') {
          state.explicitTouches.push(args[0].data.updatedAt?.getTime() ?? null);
          // Prisma generates @updatedAt in its native engine. Inject the exact
          // persisted millisecond ONLY if the route omits it, to deterministically
          // simulate that implicit engine clock collision. The native Mongo write
          // then really is a no-op; fixed explicit timestamps bypass this control.
          if (collisionTimestamp && !Object.hasOwn(args[0].data, 'updatedAt')) args[0] = { ...args[0], data: { ...args[0].data, updatedAt: collisionTimestamp } };
        }
        const result = await fn.apply(delegate, args);
        if (transactional && key === 'userMfa' && operation === 'findUnique' && afterRead) await afterRead(result);
        if (transactional && key === 'userMfa' && operation === 'update' && afterTouch) await afterTouch(result);
        if (transactional && key === 'userMfa' && operation === 'updateMany' && args[0].data.enabledAt === null && afterDisable) await afterDisable(result);
        return result;
      };
    } });
  } });
  return { db: wrap(db), state };
}

/** Native, controlled policy-versus-MFA transactions on caller-supplied isolated MongoDB. */
export async function checkMfaPolicyFence({ db, mongoDb }) {
  const marker = randomBytes(6).toString('hex'), ownerId = new ObjectId(), companyId = new ObjectId(), mfaId = new ObjectId(), sessionId = new ObjectId(), siblingId = new ObjectId();
  const ids = { owner: ownerId.toHexString(), company: companyId.toHexString(), session: sessionId.toHexString() };
  const user = { id: ids.owner, name: 'Synthetic MFA policy owner', email: `mfa-policy-${marker}@example.invalid`, password: 'synthetic-hash' };
  const timestamp = new Date('2026-01-01T00:00:00.000Z'), clock = timestamp.getTime(), outcomes = [];
  const initialMfa = { _id: mfaId, userId: ownerId, encryptedSecret: 'unchanged-fixture-secret', enabledAt: timestamp, setupExpiresAt: null, lastUsedStep: 123, recoveryHashes: ['unchanged-recovery-hash'], failedAttempts: 0, lockedUntil: null, createdAt: timestamp, updatedAt: timestamp };
  const initialSession = id => ({ _id: id, userId: ownerId, sessionToken: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 3600000), authenticatedAt: new Date(), mfaVerifiedAt: timestamp, createdAt: timestamp, updatedAt: timestamp });
  let activeRelease;
  const reset = async (mfaTimestamp = timestamp) => {
    await mongoDb.collection('UserMfa').replaceOne({ _id: mfaId }, { ...initialMfa, updatedAt: mfaTimestamp }, { upsert: true });
    await mongoDb.collection('CompanyProfile').updateOne({ _id: companyId }, { $set: { updatedAt: timestamp } });
    await mongoDb.collection('CompanySecurityPolicy').replaceOne({ _id: companyId }, { _id: companyId, requireMfa: false, updatedAt: timestamp }, { upsert: true });
    await mongoDb.collection('AuditLog').deleteMany({ userId: ownerId });
    await mongoDb.collection('Session').deleteMany({ userId: ownerId });
    await mongoDb.collection('Session').insertMany([initialSession(sessionId), initialSession(siblingId)]);
  };
  const put = async app => app.policy.PUT(new Request(`http://127.0.0.1/api/companies/${ids.company}/security`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requireMfa: true }) }), { params: Promise.resolve({ id: ids.company }) });
  const disable = async app => app.mfa.POST(new Request('http://127.0.0.1/api/auth/mfa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'disable', password: 'fixture-password', code: 'already-verified-fixture-code' }) }));
  const evidence = async () => ({ requireMfa: (await db.companySecurityPolicy.findUnique({ where: { id: ids.company } }))?.requireMfa || false, enabled: Boolean((await db.userMfa.findUnique({ where: { userId: ids.owner } }))?.enabledAt), sessions: await db.session.count({ where: { userId: ids.owner } }), policyAudit: await db.auditLog.count({ where: { userId: ids.owner, action: 'company.security.changed' } }), disableAudit: await db.auditLog.count({ where: { userId: ids.owner, action: 'mfa_disable' } }) });
  try {
    // A first concurrent transactional collection creation would introduce a
    // catalog/snapshot conflict unrelated to the MFA row under test.
    if (!await mongoDb.listCollections({ name: 'AuditLog' }).hasNext()) await mongoDb.createCollection('AuditLog');
    await mongoDb.collection('User').insertOne({ _id: ownerId, email: user.email, password: user.password, name: user.name, createdAt: timestamp, updatedAt: timestamp });
    await mongoDb.collection('CompanyProfile').insertOne({ _id: companyId, userId: ownerId, companyName: 'Isolated MFA policy fixture', nip: '5261040828', createdAt: timestamp, updatedAt: timestamp });
    // Policy touches first. The captured baseline's real no-op releases its
    // fence, letting disabling commit before its stale policy can commit.
    for (const baseline of [true, false]) {
      await reset();
      const reached = deferred(), release = deferred(); activeRelease = release;
      const policyDb = observedDb(db, { collisionTimestamp: timestamp, afterTouch: async () => { reached.resolve(); await bounded(release.promise, 'release policy MFA touch'); } });
      const disableDb = observedDb(db), policyApp = application(policyDb.db, user, ids.session, { baseline, clock }), disableApp = application(disableDb.db, user, ids.session);
      const pending = put(policyApp); await bounded(reached.promise, 'policy touched MFA');
      const disabled = await bounded(disable(disableApp), 'disable while policy touch is held');
      release.resolve(); activeRelease = undefined;
      const policy = await bounded(pending, 'policy commit after held MFA touch');
      assert.equal(policy.status, 200, JSON.stringify(await policy.json()));
      assert.equal(disabled.status, baseline ? 200 : 409, JSON.stringify(await disabled.json()));
      assert.deepEqual(disableDb.state.conflicts, baseline ? [] : ['P2034']);
      assert.deepEqual(policyDb.state.explicitTouches, baseline ? [null] : [clock + 1]);
      assert.deepEqual(await evidence(), baseline ? { requireMfa: true, enabled: false, sessions: 1, policyAudit: 1, disableAudit: 1 } : { requireMfa: true, enabled: true, sessions: 2, policyAudit: 1, disableAudit: 0 });
      if (!baseline) {
        const row = await mongoDb.collection('UserMfa').findOne({ _id: mfaId });
        assert.deepEqual(row, { ...initialMfa, updatedAt: new Date(clock + 1) });
        assert.equal((await db.session.findUnique({ where: { id: ids.session } })).mfaVerifiedAt.getTime(), clock);
        const retry = await disable(application(db, user, ids.session)); assert.equal(retry.status, 409, 'Committed policy rejects a later disable and rolls back its MFA write');
        assert.deepEqual(await evidence(), { requireMfa: true, enabled: true, sessions: 2, policyAudit: 1, disableAudit: 0 });
      }
      outcomes.push({ mode: baseline ? 'captured-baseline-same-ms-no-op' : 'fixed-policy-first-same-ms', policyStatus: policy.status, disableStatus: disabled.status, disableConflicts: disableDb.state.conflicts, explicitTouch: policyDb.state.explicitTouches, ...(await evidence()) });
    }
    // Disable holds the MFA write first. Its uncommitted row still appears
    // enabled to the policy snapshot, which must conflict when touching it.
    await reset();
    {
      const reached = deferred(), release = deferred(); activeRelease = release;
      const disableDb = observedDb(db, { afterDisable: async () => { reached.resolve(); await bounded(release.promise, 'release disable MFA write'); } }), policyDb = observedDb(db, { collisionTimestamp: timestamp });
      const pending = disable(application(disableDb.db, user, ids.session)); await bounded(reached.promise, 'disable wrote MFA');
      const policy = await bounded(put(application(policyDb.db, user, ids.session, { clock })), 'policy while disabling holds MFA');
      assert.equal(policy.status, 409, JSON.stringify(await policy.json())); assert.deepEqual(policyDb.state.conflicts, ['P2034']);
      release.resolve(); activeRelease = undefined; const disabled = await bounded(pending, 'disable commit'); assert.equal(disabled.status, 200);
      assert.deepEqual(await evidence(), { requireMfa: false, enabled: false, sessions: 1, policyAudit: 0, disableAudit: 1 });
      assert.equal((await db.companyProfile.findUnique({ where: { id: ids.company } })).updatedAt.getTime(), clock, 'Losing policy company fence rolls back');
      const retry = await put(application(db, user, ids.session, { clock })); assert.equal(retry.status, 409, 'A later policy cannot use disabled MFA');
      outcomes.push({ mode: 'fixed-disable-first-same-ms', policyStatus: policy.status, disableStatus: disabled.status, policyConflicts: policyDb.state.conflicts, ...(await evidence()) });
    }
    // The policy has read a proof, but disabling commits before its touch.
    await reset();
    {
      const reached = deferred(), release = deferred(); activeRelease = release;
      const policyDb = observedDb(db, { collisionTimestamp: timestamp, afterRead: async () => { reached.resolve(); await bounded(release.promise, 'release stale policy proof'); } });
      const pending = put(application(policyDb.db, user, ids.session, { clock })); await bounded(reached.promise, 'policy read enabled MFA');
      const disabled = await disable(application(db, user, ids.session)); assert.equal(disabled.status, 200);
      release.resolve(); activeRelease = undefined; const policy = await bounded(pending, 'policy uses stale enabled proof');
      assert.equal(policy.status, 409, JSON.stringify(await policy.json())); assert.deepEqual(policyDb.state.conflicts, ['P2034']);
      assert.deepEqual(await evidence(), { requireMfa: false, enabled: false, sessions: 1, policyAudit: 0, disableAudit: 1 });
      assert.equal((await db.companyProfile.findUnique({ where: { id: ids.company } })).updatedAt.getTime(), clock);
      outcomes.push({ mode: 'fixed-disable-commits-before-policy-touch', policyStatus: policy.status, disableStatus: disabled.status, policyConflicts: policyDb.state.conflicts, ...(await evidence()) });
    }
    // Clock rollback, a later clock, and repeated commands preserve an actual
    // strictly advancing write, without changing the MFA proof or secret.
    for (const previous of [clock + 50, clock - 50]) {
      await reset(new Date(previous));
      const app = application(db, user, ids.session, { clock });
      for (const expected of [Math.max(clock, previous + 1), Math.max(clock, previous + 1) + 1]) {
        const response = await put(app); assert.equal(response.status, 200, JSON.stringify(await response.json()));
        assert.deepEqual(await mongoDb.collection('UserMfa').findOne({ _id: mfaId }), { ...initialMfa, updatedAt: new Date(expected) });
      }
      outcomes.push({ mode: previous > clock ? 'clock-backwards-and-repeated' : 'clock-later-and-repeated', previous, clock, finalTimestamp: Math.max(clock, previous + 1) + 1 });
    }
    const fixedSource = readFileSync(policyFile, 'utf8'), baselineSource = fixedSource.replace(fixedTouch, '').replace(fixedComment, previousComment);
    const result = { status: 'passed', scope: 'isolated-loopback-native-Prisma-Mongo-synthetic-fixtures', cases: outcomes.length, controlledBarriers: true, externalProviders: false, implicitEngineClockCollisionInjectedOnlyWhenTimestampOmitted: true, baselinePolicyRouteSha256: sha(baselineSource), fixedPolicyRouteSha256: sha(fixedSource), outcomes };
    console.log(`[integration] PASS MFA policy fence: ${outcomes.length} native controlled cases; baseline no-op reproduced; forward/reverse P2034 rollback; monotonic clock and secrets preserved`);
    return result;
  } finally {
    activeRelease?.resolve();
    for (const collection of ['Session', 'AuditLog', 'UserMfa', 'CompanyMember']) await mongoDb.collection(collection).deleteMany({ userId: ownerId });
    await mongoDb.collection('CompanySecurityPolicy').deleteOne({ _id: companyId });
    await mongoDb.collection('CompanyProfile').deleteOne({ _id: companyId });
    await mongoDb.collection('User').deleteOne({ _id: ownerId });
  }
}
