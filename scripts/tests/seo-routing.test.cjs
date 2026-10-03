require('../register-ts.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const { NextRequest } = require('next/server');
const { middleware } = require('../../src/middleware.ts');

test('unknown public URLs reach Next 404 handling rather than the login page', () => {
  for (const path of ['/nieistniejaca-strona', '/login-typo', '/faktury/nieistniejacy-poradnik']) {
    const response = middleware(new NextRequest('https://fakturaprosto.pl' + path));
    assert.equal(response.headers.get('location'), null, path);
    assert.equal(response.headers.get('x-middleware-next'), '1', path);
  }
});

test('all current application pages retain the anonymous login gate', () => {
  const root = join(__dirname, '../../src/app/(app)');
  function visit(directory, segments = []) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) visit(join(directory, entry.name), [...segments, entry.name]);
      else if (entry.name === 'page.tsx') {
        const path = '/' + segments.map(segment => segment.startsWith('[') ? 'test-id' : segment).join('/');
        const response = middleware(new NextRequest('https://fakturaprosto.pl' + path));
        assert.equal(response.status, 307, path);
        const target = new URL(response.headers.get('location'));
        assert.equal(target.pathname, '/login', path);
        assert.equal(target.searchParams.get('next'), path);
      }
    }
  }
  visit(root);
});
