require('../register-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createImmutablePdfCache } = require('../../src/lib/pdf/immutable-pdf-cache.ts');
const pdf = (id, bytes = '1234') => ({ versionId: id, sourceHash: 'hash-' + id, buffer: Buffer.from(bytes), sha256: 'digest', number: 'FV/' + id });

test('immutable PDF byte cache is bounded, LRU and keyed by the complete source hash', () => {
  const cache = createImmutablePdfCache(10, 2);
  cache.put(pdf('a')); cache.put(pdf('b'));
  assert.equal(cache.read('a', 'changed-source'), undefined);
  assert.ok(cache.read('a', 'hash-a'));
  cache.put(pdf('c'));
  assert.equal(cache.read('b', 'hash-b'), undefined, 'Least recently used bytes are evicted');
  cache.put(pdf('large', 'x'.repeat(11)));
  assert.deepEqual(cache.size(), { entries: 2, bytes: 8 });
  cache.put(pdf('a', '1234567'));
  assert.equal(cache.read('c', 'hash-c'), undefined, 'The byte budget evicts even below entry count');
  assert.deepEqual(cache.size(), { entries: 1, bytes: 7 });
});

test('cached PDF buffers cannot be modified by the producer or a previous reader', () => {
  const cache = createImmutablePdfCache(10, 2), original = pdf('a');
  cache.put(original); original.buffer[0] = 0;
  const result = cache.read('a', 'hash-a');
  assert.equal(result.buffer.toString(), '1234');
  result.buffer[0] = 0;
  assert.equal(cache.read('a', 'hash-a').buffer.toString(), '1234');
  assert.equal(createImmutablePdfCache(10, 0).read('a', 'hash-a'), undefined);
});
