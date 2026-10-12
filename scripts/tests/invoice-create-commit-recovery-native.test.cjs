const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');

test('actual invoice handler passes disposable native commit-recovery and personal-role regressions', { timeout: 180000 }, () => {
  const root = path.resolve(__dirname, '../..');
  const files = ['src/app/api/invoices/route.ts', 'src/lib/invoice-write-admission.ts', 'scripts/invoice-create-commit-recovery-native.mjs', 'scripts/company-write-fence-regression.mjs', 'scripts/fixtures/invoice-post-before-company-fence.txt'];
  const hashes = () => files.map(file => createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex'));
  const before = hashes();
  // A nested node --test must start its own test runner and produce actual TAP.
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'scripts/invoice-create-commit-recovery-native.mjs'], { cwd: root, env, encoding: 'utf8', timeout: 160000, maxBuffer: 4 * 1024 * 1024 });
  assert.deepEqual(hashes(), before, 'The tested route, helper, loader and fixtures remain unchanged during the native run');
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.signal, null, result.stderr);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /# tests 8\s/);
  assert.match(result.stdout, /# pass 8\s/);
  assert.match(result.stdout, /# fail 0\s/);
  for (const name of ['P2028 after actual commit', 'an unclassified error after actual commit', 'revocation after business commit', 'a P2028 before callback completion', 'personal viewer', 'personal owner', 'personal accountant']) assert.ok(result.stdout.includes(name), `Native result includes ${name}`);
});
