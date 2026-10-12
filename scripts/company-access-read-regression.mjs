import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BSON, ObjectId } from 'mongodb';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ts = require('typescript');
const permissionKeys = ['canIssueInvoices', 'canCreateCorrections', 'canRecordPayments', 'canExport', 'canSendKsef', 'canManageBankAccounts', 'canManageTeam', 'canManageIntegrations'];
const schemaDefaults = Object.fromEntries(permissionKeys.map(key => [key, key === 'canIssueInvoices']));
const roles = ['owner', 'admin', 'sales', 'accountant', 'employee', 'viewer'];

// Load the actual application modules with the supplied real Prisma client.
// This private module cache avoids changing the application's global client or
// importing an inherited DATABASE_URL. Database results are never mocked.
function applicationModules(db) {
  const cache = new Map();
  const load = filename => {
    if (['db.ts', 'prisma.ts'].some(name => filename === path.join(root, 'src/lib', name))) return { prisma: db, default: db };
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = new Module(filename);
    mod.filename = filename;
    mod.paths = Module._nodeModulePaths(path.dirname(filename));
    cache.set(filename, mod);
    mod.require = request => {
      if (request === 'server-only') return {};
      if (request.startsWith('@/') || request.startsWith('.')) {
        const base = request.startsWith('@/') ? path.join(root, 'src', request.slice(2)) : path.resolve(path.dirname(filename), request);
        const resolved = require.resolve(base);
        if (resolved.startsWith(path.join(root, 'src') + path.sep) && /\.tsx?$/.test(resolved)) return load(resolved);
        return require(resolved);
      }
      return require(request);
    };
    mod._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText, filename);
    return mod.exports;
  };
  require('./register-ts.cjs');
  return {
    ...load(path.join(root, 'src/lib/company-access-read.ts')),
    ...load(path.join(root, 'src/lib/permissions.ts')),
    ...load(path.join(root, 'src/lib/company-write.ts')),
  };
}

function denied(code) {
  return Object.assign(new Error('Legacy company access denied'), { status: 403, ...(code ? { code } : {}) });
}

// Preserve the previous read sequence and expressions, using actual Prisma
// findUnique decoding so missing/null BSON fields exercise native defaults.
async function legacyMfa(db, userId, companyId) {
  const policy = await db.companySecurityPolicy.findUnique({ where: { id: companyId } });
  if (!policy?.requireMfa) return;
  const mfa = await db.userMfa.findUnique({ where: { userId }, select: { enabledAt: true } });
  if (!mfa?.enabledAt) throw denied('COMPANY_MFA_REQUIRED');
}
async function legacyMembership(db, userId, companyId, defaults) {
  const company = await db.companyProfile.findUnique({ where: { id: companyId }, select: { id: true, userId: true, companyName: true, nip: true } });
  if (!company) return null;
  const member = await db.companyMember.findUnique({ where: { companyId_userId: { companyId, userId } } });
  if (member) {
    await legacyMfa(db, userId, companyId);
    if (!Object.hasOwn(defaults, member.role)) return null;
    const permissions = member.role === 'owner' ? { ...defaults.owner } : Object.fromEntries(permissionKeys.map(key => [key, member[key] ?? defaults[member.role][key]]));
    return { company, role: member.role, permissions, memberId: member.id };
  }
  if (company.userId !== userId) return null;
  await legacyMfa(db, userId, companyId);
  return { company, role: 'owner', permissions: { ...defaults.owner } };
}
async function legacyWriteAccess(db, userId, companyId, permission, defaults) {
  const company = await db.companyProfile.findUnique({ where: { id: companyId }, select: { id: true, userId: true } });
  if (!company) throw denied();
  const member = await db.companyMember.findUnique({ where: { companyId_userId: { companyId, userId } } });
  const role = member?.role || (company.userId === userId ? 'owner' : '');
  if (!role || !Object.hasOwn(defaults, role)) throw denied();
  if (permission && role !== 'owner' && !(member?.[permission] ?? defaults[role][permission])) throw denied();
  await legacyMfa(db, userId, company.id);
  return { company, role };
}
async function outcome(fn) {
  try { return { value: await fn() }; }
  catch (error) { return { error: { code: error.code || null, status: error.status || null } }; }
}
const membershipValue = value => value && ({ company: value.company, role: value.role, permissions: value.permissions });
const writeValue = value => ({ company: { id: value.company.id, userId: value.company.userId }, role: value.role });
const normalizeOutcome = (result, normalize) => result.error ? result : { value: normalize(result.value) };

/** Real Mongo/Prisma proof on synthetic records in an isolated loopback replica set. */
export async function checkCompanyAccessRead({ db, mongoDb }) {
  assert.ok(mongoDb?.client?.options.hosts?.length && mongoDb.client.options.hosts.every(address => ['127.0.0.1', 'localhost', '::1'].includes(address.host)), 'Company access regression requires an isolated loopback Mongo database');
  const marker = randomBytes(8).toString('hex'), now = new Date();
  const userId = new ObjectId(), ownerId = new ObjectId(), companyId = new ObjectId(), otherCompanyId = new ObjectId(), memberId = new ObjectId();
  const users = [userId, ownerId], companyIds = [companyId, otherCompanyId], memberIds = [memberId];
  const secrets = ['SYNTHETIC_KSEF_TOKEN_MUST_NOT_TRANSFER', 'SYNTHETIC_MFA_SECRET_MUST_NOT_TRANSFER'];
  const company = { id: companyId.toHexString(), userId: ownerId.toHexString(), companyName: `Company access Żółć ${marker}`, nip: '5260301706' };
  const uid = userId.toHexString(), cid = companyId.toHexString(), oid = ownerId.toHexString();
  let aggregateReads = 0, cases = 0;
  const commands = [], baselineErrors = new Set(), intentionalDifferences = new Set(), checks = [];
  const measured = tx => new Proxy(tx, {
    get(target, key) {
      if (key === 'companyProfile') return new Proxy(target.companyProfile, {
        get(delegate, operation) {
          if (operation === 'aggregateRaw') return async args => {
            aggregateReads++; commands.push(args);
            const rows = await delegate.aggregateRaw(args), wire = JSON.stringify(rows);
            for (const secret of secrets) assert.equal(wire.includes(secret), false, 'Mongo must exclude company/MFA credentials before transfer');
            for (const row of rows) {
              assert.deepEqual(Object.keys(row.company).sort(), ['companyName', 'id', 'nip', 'userId']);
              assert.ok(Object.keys(row).every(field => ['company', 'members', 'policies', 'mfaEnabled'].includes(field)), 'Only access data may cross the database boundary');
              for (const member of row.members) assert.ok(Object.keys(member).every(field => ['id', 'role', ...permissionKeys].includes(field)));
            }
            return rows;
          };
          const value = delegate[operation];
          return typeof value === 'function' ? value.bind(delegate) : value;
        },
      });
      const value = target[key];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const measuredDb = measured(db), app = applicationModules(measuredDb);
  const oneRead = async fn => {
    const before = aggregateReads, result = await outcome(fn);
    assert.equal(aggregateReads - before, 1, 'Every well-formed access check must use exactly one CompanyProfile aggregateRaw');
    return result;
  };
  const snapshot = async (user = uid, id = cid, tx = measuredDb) => {
    const result = await oneRead(() => app.readCompanyAccess(tx, user, id));
    assert.equal(result.error, undefined);
    return result.value;
  };
  const setMember = async changes => {
    const unset = Object.fromEntries(Object.entries(changes).filter(([, value]) => value === undefined).map(([key]) => [key, '']));
    const set = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
    const fields = { ...schemaDefaults, role: 'employee', ...set };
    for (const key of Object.keys(unset)) delete fields[key];
    await mongoDb.collection('CompanyMember').updateOne({ _id: memberId }, { $set: fields, ...(Object.keys(unset).length ? { $unset: unset } : {}) });
  };
  try {
    await mongoDb.collection('User').insertMany(users.map((id, index) => ({ _id: id, email: `company-native-${marker}-${index}@example.invalid`, password: 'synthetic', createdAt: now, updatedAt: now })));
    await mongoDb.collection('CompanyProfile').insertMany([
      { _id: companyId, userId: ownerId, companyName: company.companyName, nip: company.nip, ksefToken: secrets[0], createdAt: now, updatedAt: now },
      { _id: otherCompanyId, userId: userId, companyName: 'Other isolated company', nip: '5250001003', createdAt: now, updatedAt: now },
    ]);
    await mongoDb.collection('CompanyMember').insertOne({ _id: memberId, companyId, userId, role: 'employee', ...schemaDefaults, createdAt: now, updatedAt: now });
    await mongoDb.collection('CompanySecurityPolicy').insertOne({ _id: companyId, requireMfa: false, updatedAt: now });
    const decoys = Array.from({ length: 240 }, (_, index) => ({ _id: new ObjectId(), companyId: index % 2 ? companyId : new ObjectId(), userId: index % 2 ? new ObjectId() : userId, role: 'owner', ...Object.fromEntries(permissionKeys.map(key => [key, true])), createdAt: now, updatedAt: now }));
    memberIds.push(...decoys.map(row => row._id));
    await mongoDb.collection('CompanyMember').insertMany(decoys);
    const mfaDecoys = Array.from({ length: 120 }, () => ({ _id: new ObjectId(), userId: new ObjectId(), encryptedSecret: secrets[1], enabledAt: now }));
    await mongoDb.collection('UserMfa').insertMany(mfaDecoys);
    users.push(...mfaDecoys.map(row => row.userId));

    // Verify actual Prisma defaults before comparing the optimized path. Role
    // defaults must not replace missing BSON permission schema defaults.
    for (const role of roles) for (const permission of permissionKeys) for (const value of [true, false, undefined]) {
      cases++;
      await setMember({ role, [permission]: value });
      const legacy = await legacyMembership(db, uid, cid, app.DEFAULT_ROLE_PERMISSIONS);
      const read = await snapshot();
      assert.deepEqual(read.company, company);
      assert.equal(read.member.valid, true);
      assert.equal(read.member.role, role);
      assert.deepEqual(read.member.permissions, { ...schemaDefaults, [permission]: value === undefined ? schemaDefaults[permission] : value });
      const membership = await oneRead(() => app.getCompanyMembership(uid, cid));
      assert.deepEqual(normalizeOutcome(membership, membershipValue), { value: membershipValue(legacy) }, `${role}/${permission}/${String(value)} membership parity`);
      const oldWrite = await outcome(() => legacyWriteAccess(db, uid, cid, permission, app.DEFAULT_ROLE_PERMISSIONS));
      const write = await oneRead(() => app.companyAccess(measuredDb, uid, cid, permission));
      assert.deepEqual(normalizeOutcome(write, writeValue), normalizeOutcome(oldWrite, writeValue), `${role}/${permission}/${String(value)} transaction access parity`);
    }
    checks.push('144 native cases: all six roles × eight permissions × true/false/missing; actual old Prisma and both application wrappers agree');

    for (const role of roles) for (const permission of permissionKeys) for (const value of [null, 'true', 1, [], {}]) {
      cases++;
      await setMember({ role, [permission]: value });
      const old = await outcome(() => legacyMembership(db, uid, cid, app.DEFAULT_ROLE_PERMISSIONS));
      if (value === null) {
        assert.equal(old.error, undefined, 'Native Prisma applies schema defaults even to explicit null required booleans');
        const decoded = await db.companyMember.findUnique({ where: { companyId_userId: { companyId: cid, userId: uid } } });
        assert.equal(decoded[permission], schemaDefaults[permission]);
        intentionalDifferences.add('Explicit null permission booleans: legacy Prisma applies schema defaults; optimized access intentionally denies the whole malformed member');
      } else {
        assert.equal(old.error?.code, 'P2023', 'Legacy Prisma must reject nonboolean BSON permission data');
        baselineErrors.add('Nonboolean member permissions: native Prisma P2023');
      }
      assert.equal((await snapshot()).member.valid, false, 'Null/nonboolean permissions invalidate the whole member, including owner');
      assert.deepEqual(await oneRead(() => app.getCompanyMembership(uid, cid)), { value: null });
      const write = await oneRead(() => app.companyAccess(measuredDb, uid, cid, permission));
      assert.equal(write.error?.status, 403);
    }
    checks.push('240 malformed native cases: null/string/number/array/object flags deny every role, including owner; null schema-default hardening is explicitly recorded');

    await setMember({ role: undefined });
    assert.equal((await db.companyMember.findUnique({ where: { companyId_userId: { companyId: cid, userId: uid } } })).role, 'employee');
    assert.equal((await snapshot()).member.role, 'employee');
    for (const role of ['unknown', 'constructor', '__proto__', 'toString']) {
      await setMember({ role });
      assert.equal((await snapshot()).member.role, role);
      assert.deepEqual(await oneRead(() => app.getCompanyMembership(uid, cid)), { value: null });
      assert.equal((await oneRead(() => app.companyAccess(measuredDb, uid, cid))).error?.status, 403);
    }
    const ownerMemberId = new ObjectId(); memberIds.push(ownerMemberId);
    await mongoDb.collection('CompanyMember').insertOne({ _id: ownerMemberId, companyId, userId: ownerId, role: 'viewer', ...Object.fromEntries(permissionKeys.map(key => [key, false])), createdAt: now, updatedAt: now });
    const downgraded = await oneRead(() => app.getCompanyMembership(oid, cid));
    assert.equal(downgraded.value.role, 'viewer');
    assert.ok(permissionKeys.every(key => downgraded.value.permissions[key] === false));
    assert.equal((await oneRead(() => app.companyAccess(measuredDb, oid, cid, 'canIssueInvoices'))).error?.status, 403);
    await mongoDb.collection('CompanyMember').updateOne({ _id: ownerMemberId }, { $set: { role: 'unknown' } });
    assert.deepEqual(await oneRead(() => app.getCompanyMembership(oid, cid)), { value: null });
    assert.equal((await oneRead(() => app.companyAccess(measuredDb, oid, cid))).error?.status, 403);
    await mongoDb.collection('CompanyMember').updateOne({ _id: ownerMemberId }, { $set: { role: '' } });
    assert.equal((await legacyWriteAccess(db, oid, cid, 'canIssueInvoices', app.DEFAULT_ROLE_PERMISSIONS)).role, 'owner', 'The previous falsy-role expression elevated a founder with a present blank role');
    assert.deepEqual(await oneRead(() => app.getCompanyMembership(oid, cid)), { value: null });
    assert.equal((await oneRead(() => app.companyAccess(measuredDb, oid, cid, 'canIssueInvoices'))).error?.status, 403, 'A present blank member role must never fall back to founder ownership');
    intentionalDifferences.add('Present blank founder membership role: legacy transaction access falls back to owner through ||; optimized access denies the present invalid role');
    await mongoDb.collection('CompanyMember').deleteOne({ _id: ownerMemberId });
    assert.equal((await oneRead(() => app.companyAccess(measuredDb, oid, cid, 'canIssueInvoices'))).value.role, 'owner');
    assert.equal(await mongoDb.collection('CompanyMember').countDocuments({ companyId, userId: ownerId }), 0, 'Transactional owner fallback must not write membership rows');
    const fallback = await oneRead(() => app.getCompanyMembership(oid, cid));
    assert.equal(fallback.value.role, 'owner');
    assert.ok(fallback.value.memberId);
    memberIds.push(new ObjectId(fallback.value.memberId));
    const existingOwnerMember = await db.companyMember.findUnique({ where: { companyId_userId: { companyId: cid, userId: oid } } });
    assert.equal(existingOwnerMember.id, fallback.value.memberId, 'Read fallback creates the established owner membership');
    await mongoDb.collection('CompanyMember').deleteOne({ _id: new ObjectId(fallback.value.memberId) });
    const racedMemberId = new ObjectId(); memberIds.push(racedMemberId);
    let raced = false;
    const racingDb = new Proxy(measuredDb, { get(target, key) {
      if (key !== 'companyMember') return target[key];
      return new Proxy(target.companyMember, { get(delegate, operation) {
        if (operation === 'create') return async args => {
          assert.equal(raced, false, 'Owner creation must not be retried'); raced = true;
          await mongoDb.collection('CompanyMember').insertOne({ _id: racedMemberId, companyId, userId: ownerId, role: 'viewer', ...Object.fromEntries(permissionKeys.map(key => [key, false])), createdAt: now, updatedAt: now });
          return delegate.create(args); // Real compound-unique P2002, after a real competing insert.
        };
        const value = delegate[operation];
        return typeof value === 'function' ? value.bind(delegate) : value;
      } });
    } });
    const raceApp = applicationModules(racingDb), beforeRace = aggregateReads;
    const raceFallback = await outcome(() => raceApp.getCompanyMembership(oid, cid));
    assert.equal(aggregateReads - beforeRace, 2, 'A real failed owner insertion requires exactly one fresh access read');
    assert.equal(raceFallback.value.role, 'viewer', 'The same request must honor the competing downgrade');
    assert.equal(raceFallback.value.memberId, racedMemberId.toHexString());
    assert.ok(permissionKeys.every(key => raceFallback.value.permissions[key] === false));
    assert.equal(await mongoDb.collection('CompanyMember').countDocuments({ companyId, userId: ownerId }), 1);
    const permissionRace = await oneRead(() => raceApp.requireCompanyAccess(oid, cid, 'canIssueInvoices'));
    assert.equal(permissionRace.value.ok, false);
    assert.equal(permissionRace.value.code, 'FORBIDDEN_INSUFFICIENT_PERMISSIONS');
    await mongoDb.collection('CompanyMember').deleteOne({ _id: racedMemberId });
    let mfaRaced = false;
    const mfaRacingDb = new Proxy(measuredDb, { get(target, key) {
      if (key !== 'companyMember') return target[key];
      return new Proxy(target.companyMember, { get(delegate, operation) {
        if (operation === 'create') return async args => {
          assert.equal(mfaRaced, false); mfaRaced = true;
          await mongoDb.collection('CompanyMember').insertOne({ _id: racedMemberId, companyId, userId: ownerId, role: 'viewer', ...schemaDefaults, createdAt: now, updatedAt: now });
          await mongoDb.collection('CompanySecurityPolicy').updateOne({ _id: companyId }, { $set: { requireMfa: true } });
          return delegate.create(args);
        };
        const value = delegate[operation];
        return typeof value === 'function' ? value.bind(delegate) : value;
      } });
    } });
    const beforeMfaRace = aggregateReads;
    const mfaRace = await outcome(() => applicationModules(mfaRacingDb).getCompanyMembership(oid, cid));
    assert.equal(aggregateReads - beforeMfaRace, 2);
    assert.equal(mfaRace.error?.code, 'COMPANY_MFA_REQUIRED', 'A policy enabled during the real insertion conflict is enforced by the fresh read');
    await mongoDb.collection('CompanyMember').deleteOne({ _id: racedMemberId });
    await mongoDb.collection('CompanySecurityPolicy').updateOne({ _id: companyId }, { $set: { requireMfa: false } });
    checks.push('Unknown/prototype roles fail closed; downgraded founder cannot regain ownership; real P2002 insertion races re-read once and enforce the competing viewer role and current MFA policy');

    await setMember({ role: 'employee', canIssueInvoices: true, canExport: false });
    await mongoDb.collection('CompanySecurityPolicy').updateOne({ _id: companyId }, { $set: { requireMfa: true } });
    assert.deepEqual(await snapshot(), { company, member: { id: memberId.toHexString(), role: 'employee', permissions: schemaDefaults, valid: true }, requireMfa: true, mfaEnabled: false });
    assert.equal((await oneRead(() => app.getCompanyMembership(uid, cid))).error?.code, 'COMPANY_MFA_REQUIRED');
    assert.equal((await oneRead(() => app.companyAccess(measuredDb, uid, cid, 'canIssueInvoices'))).error?.code, 'COMPANY_MFA_REQUIRED');
    assert.equal((await oneRead(() => app.companyAccess(measuredDb, uid, cid, 'canExport'))).error?.code, null, 'Write permission rejection precedes MFA');
    await setMember({ role: 'unknown' });
    assert.equal((await oneRead(() => app.getCompanyMembership(uid, cid))).error?.code, 'COMPANY_MFA_REQUIRED', 'Membership MFA rejection precedes unknown-role rejection');
    assert.equal((await oneRead(() => app.companyAccess(measuredDb, uid, cid))).error?.code, null, 'Write unknown-role rejection precedes MFA');
    await setMember({ role: 'employee' });
    await mongoDb.collection('UserMfa').insertOne({ _id: new ObjectId(), userId, encryptedSecret: secrets[1], enabledAt: null, createdAt: now, updatedAt: now });
    assert.equal((await snapshot()).mfaEnabled, false);
    await mongoDb.collection('UserMfa').updateOne({ userId }, { $unset: { enabledAt: '' } });
    assert.equal((await snapshot()).mfaEnabled, false);
    await mongoDb.collection('UserMfa').updateOne({ userId }, { $set: { enabledAt: now } });
    assert.equal((await snapshot()).mfaEnabled, true);
    assert.equal((await oneRead(() => app.getCompanyMembership(uid, cid))).value.role, 'employee');
    await mongoDb.collection('UserMfa').updateOne({ userId }, { $set: { enabledAt: 'malformed' } });
    assert.equal((await snapshot()).mfaEnabled, false);
    assert.equal((await oneRead(() => app.getCompanyMembership(uid, cid))).error?.code, 'COMPANY_MFA_REQUIRED');
    await mongoDb.collection('CompanySecurityPolicy').updateOne({ _id: companyId }, { $set: { requireMfa: false } });
    assert.equal((await snapshot()).mfaEnabled, false, 'MFA join is gated off when the current policy does not require it');
    assert.equal((await oneRead(() => app.getCompanyMembership(uid, cid))).value.role, 'employee');
    await mongoDb.collection('UserMfa').deleteOne({ userId });
    await mongoDb.collection('CompanyMember').deleteOne({ _id: memberId });
    assert.equal((await snapshot()).member, null);
    assert.deepEqual(await oneRead(() => app.getCompanyMembership(uid, cid)), { value: null });
    assert.equal((await oneRead(() => app.companyAccess(measuredDb, uid, cid))).error?.status, 403);
    await mongoDb.collection('CompanyMember').insertOne({ _id: memberId, companyId, userId, role: 'employee', ...schemaDefaults, createdAt: now, updatedAt: now });
    checks.push('Policy toggles, MFA missing/null/missing-date/enabled/malformed, and membership revocation are observed live; existing wrapper rejection ordering is preserved');

    const rollback = new Error('Rollback synthetic uncommitted access writes');
    await assert.rejects(db.$transaction(async tx => {
      await tx.companyMember.update({ where: { companyId_userId: { companyId: cid, userId: uid } }, data: { role: 'admin', canExport: true } });
      await tx.companySecurityPolicy.update({ where: { id: cid }, data: { requireMfa: true } });
      await tx.userMfa.create({ data: { userId: uid, encryptedSecret: secrets[1], enabledAt: now } });
      const uncommitted = await snapshot(uid, cid, measured(tx));
      assert.equal(uncommitted.member.role, 'admin');
      assert.equal(uncommitted.member.permissions.canExport, true);
      assert.equal(uncommitted.requireMfa, true);
      assert.equal(uncommitted.mfaEnabled, true, 'Transaction aggregate joins must see its own uncommitted MFA write');
      assert.equal((await oneRead(() => app.companyAccess(measured(tx), uid, cid, 'canExport'))).value.role, 'admin');
      const outside = await snapshot();
      assert.equal(outside.member.role, 'employee');
      assert.equal(outside.member.permissions.canExport, false);
      assert.equal(outside.requireMfa, false);
      throw rollback;
    }, { timeout: 15000 }), error => error === rollback);
    assert.equal((await snapshot()).member.role, 'employee');
    assert.equal((await snapshot()).requireMfa, false);
    assert.equal(await mongoDb.collection('UserMfa').countDocuments({ userId }), 0);
    checks.push('Actual interactive tx.aggregateRaw sees uncommitted member/policy/MFA writes while outside Prisma sees prior values; abort restores every fixture');

    const explain = async required => {
      await mongoDb.collection('CompanySecurityPolicy').updateOne({ _id: companyId }, { $set: { requireMfa: required } });
      // Explain embeds expressions such as {$type: 'date'}; Prisma's JSON
      // decoder mistakes those planner nodes for its own tagged result values.
      const plan = await mongoDb.command({ explain: { aggregate: 'CompanyProfile', pipeline: BSON.EJSON.deserialize(app.companyAccessPipeline(uid, cid)), cursor: {} }, verbosity: 'executionStats' });
      const joins = Object.fromEntries(plan.stages.filter(stage => stage.$lookup).map(stage => [stage.$lookup.from, stage]));
      const cursor = plan.stages.find(stage => stage.$cursor)?.$cursor;
      assert.equal(cursor.executionStats.nReturned, 1);
      assert.ok(cursor.executionStats.totalDocsExamined <= 1, 'Company scope must use its _id index');
      assert.ok(joins.CompanyMember.indexesUsed.some(name => name === 'CompanyMember_companyId_userId_key'), 'Membership join must use the compound companyId/userId index');
      assert.ok(joins.CompanyMember.totalDocsExamined <= 1, 'Membership lookup must not scan other company/user decoys');
      assert.ok(joins.CompanySecurityPolicy.indexesUsed.includes('_id_'));
      assert.ok(joins.CompanySecurityPolicy.totalDocsExamined <= 1);
      if (required) assert.ok(joins.UserMfa.indexesUsed.includes('UserMfa_userId_key'));
      else assert.equal(joins.UserMfa.totalDocsExamined, 0, 'No MFA records may be examined without a requiring policy');
      assert.ok(joins.UserMfa.totalDocsExamined <= 1);
      return Object.fromEntries(Object.entries(joins).map(([name, stage]) => [name, { indexesUsed: stage.indexesUsed, totalDocsExamined: stage.totalDocsExamined, totalKeysExamined: stage.totalKeysExamined }]));
    };
    const indexPlans = { policyDisabled: await explain(false), policyRequired: await explain(true) };
    checks.push('Native explain: company _id, compound membership companyId/userId, policy _id and required-MFA userId indexes; disabled policy examines zero MFA records');
    const beforeMalformed = aggregateReads;
    for (const [user, id] of [['', cid], ['invalid', cid], [uid, 'invalid']]) assert.equal(await app.readCompanyAccess(measuredDb, user, id), null);
    assert.equal(aggregateReads, beforeMalformed, 'Malformed IDs must be rejected before database work');
    assert.equal(await snapshot(uid, new ObjectId().toHexString()), null);
    const result = { status: 'passed', scope: 'isolated-loopback-MongoMemoryReplSet-native-Prisma-synthetic-records', cases, aggregateReads, checks, schemaDefaults, baselineErrors: [...baselineErrors], intentionalDifferences: [...intentionalDifferences], indexPlans };
    console.log(`[integration] PASS company access ${cases} native role/flag cases; ${aggregateReads} one-command reads, actual legacy Prisma defaults, live MFA/revocation, transaction visibility and indexed explains`);
    return result;
  } finally {
    await mongoDb.collection('CompanyMember').deleteMany({ _id: { $in: memberIds } });
    await mongoDb.collection('CompanySecurityPolicy').deleteMany({ _id: { $in: companyIds } });
    await mongoDb.collection('CompanyProfile').deleteMany({ _id: { $in: companyIds } });
    await mongoDb.collection('UserMfa').deleteMany({ userId: { $in: users } });
    await mongoDb.collection('User').deleteMany({ _id: { $in: users } });
  }
}
