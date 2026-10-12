const test = require('node:test');
const assert = require('node:assert/strict');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { PrismaClient, Prisma } = require('@prisma/client');
require('../register-ts.cjs');
const { reportUnexpectedError } = require('../../src/lib/error-report.ts');

const marker = 'synthetic-private-invoice-log-marker';

async function captureConsole(callback) {
  const original = { log: console.log, error: console.error, warn: console.warn };
  const lines = [];
  for (const method of Object.keys(original)) console[method] = (...args) => lines.push(args.map(String).join(' '));
  try { return { result: await callback(), lines }; }
  finally { Object.assign(console, original); }
}

async function eventFor(error) {
  const { result: incident, lines } = await captureConsole(() => reportUnexpectedError(error));
  assert.equal(lines.length, 1);
  const event = JSON.parse(lines[0]);
  assert.equal(event.incident, incident);
  assert.match(incident, /^[0-9a-f-]{36}$/);
  assert.equal(event.event, 'application_error');
  assert.equal(event.severity, 'error');
  assert.match(event.fingerprint, /^[0-9a-f]+$/);
  assert.ok(Number.isFinite(Date.parse(event.timestamp)));
  assert.equal(lines[0].includes(marker), false);
  assert.deepEqual(Object.keys(event).sort(), ['event', 'fingerprint', 'incident', 'severity', 'timestamp', ...(event.errorCode ? ['errorCode'] : [])].sort());
  return event;
}

test('native Prisma validation reproduces argument exposure with the old logger and the application client suppresses it', { timeout: 90000 }, async () => {
  // Never use inherited connection credentials. This request uses a fresh local
  // database and an invalid password type, so no user record can be inserted.
  const mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', ...(process.platform !== 'win32' ? { args: ['--nounixsocket'] } : {}) } });
  const uri = mongo.getUri('error_log_safety');
  assert.match(uri, /^mongodb:\/\/127\.0\.0\.1:/);
  const noisy = new PrismaClient({ datasources: { db: { url: uri } }, log: ['error'] });
  const previousUrl = process.env.DATABASE_URL, previousClient = globalThis.prisma;
  const modulePath = require.resolve('../../src/lib/prisma.ts');
  let safe;
  try {
    process.env.DATABASE_URL = uri;
    delete globalThis.prisma;
    delete require.cache[modulePath];
    safe = require(modulePath).prisma;
    const invalidCreate = async client => {
      await assert.rejects(client.user.create({ data: { email: 'log-qa@example.invalid', password: 123, name: marker } }), error => {
        assert.ok(error instanceof Prisma.PrismaClientValidationError);
        assert.equal(error.message.includes(marker), true);
        return true;
      });
    };
    const old = await captureConsole(() => invalidCreate(noisy));
    assert.equal(old.lines.some(line => line.includes(marker)), true);
    const fixed = await captureConsole(() => invalidCreate(safe));
    assert.deepEqual(fixed.lines, []);
    assert.equal(await safe.user.count(), 0);
  } finally {
    await safe?.$disconnect();
    await noisy.$disconnect();
    delete require.cache[modulePath];
    if (previousClient === undefined) delete globalThis.prisma;
    else globalThis.prisma = previousClient;
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    await mongo.stop();
  }
});

test('actual known Prisma errors retain only their allowlisted diagnostic code', async () => {
  const error = new Prisma.PrismaClientKnownRequestError(marker, { code: 'P2028', clientVersion: marker, meta: { query: marker, password: marker } });
  const event = await eventFor(error);
  assert.equal(event.errorCode, 'P2028');
});

test('known Prisma errors with unbounded, malformed or injected codes omit the code', async () => {
  for (const code of ['', 'P2028\n' + marker, 'P2028\n', 'P2028 ' , 'P２０２８', 'P202', 'P20288', 'p2028', marker]) {
    const error = new Prisma.PrismaClientKnownRequestError(marker, { code, clientVersion: 'synthetic' });
    assert.equal(Object.hasOwn(await eventFor(error), 'errorCode'), false);
  }
});

test('client shaped objects and ordinary Error properties cannot forge Prisma diagnostic codes', async () => {
  for (const error of [{ code: 'P2028', message: marker, name: marker }, Object.assign(new Error(marker), { code: 'P2028', name: marker })]) {
    assert.equal(Object.hasOwn(await eventFor(error), 'errorCode'), false);
  }
});

test('structured telemetry never reads or emits Prisma metadata', async () => {
  const error = new Prisma.PrismaClientKnownRequestError(marker, { code: 'P2002', clientVersion: 'synthetic' });
  Object.defineProperty(error, 'meta', { get() { throw new Error('metadata must not be read'); } });
  assert.equal((await eventFor(error)).errorCode, 'P2002');
});

test('non Error throwables produce a safe incident without serializing the thrown value', async () => {
  for (const value of [null, undefined, marker, 123, Symbol(marker), { toJSON() { throw new Error('thrown object must not be serialized'); } }]) {
    assert.equal(Object.hasOwn(await eventFor(value), 'errorCode'), false);
  }
});
