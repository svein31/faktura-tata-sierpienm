require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
let unavailable = false;
Module._load = function(request, parent, main) {
  if (request === '@/lib/prisma') return { prisma: { user: { count: async () => { if (unavailable) throw new Error('private database connection details'); return 1; } } } };
  return originalLoad.call(this, request, parent, main);
};
const { GET } = require('../../src/app/api/health/route.ts');
Module._load = originalLoad;

test('health reports the built source revision even when the database is unavailable', async () => {
  const previous = process.env.APP_BUILD_REVISION;
  try {
    process.env.APP_BUILD_REVISION = 'a'.repeat(40);
    for (const failure of [false, true]) {
      unavailable = failure;
      const response = await GET(), body = await response.json();
      assert.equal(response.status, failure ? 503 : 200);
      assert.equal(body.revision, 'a'.repeat(40));
      assert.equal(body.ok, !failure);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.ok(!JSON.stringify(body).includes('private database'));
    }
  } finally {
    unavailable = false;
    if (previous === undefined) delete process.env.APP_BUILD_REVISION;
    else process.env.APP_BUILD_REVISION = previous;
  }
});
