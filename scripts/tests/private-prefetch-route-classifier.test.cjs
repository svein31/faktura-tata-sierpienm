const test = require('node:test');
const assert = require('node:assert/strict');

const { isRouteRequest } = require('../audit/private-prefetch-request.cjs');
// Actual Chromium 154 metadata request shape from the failed browser audit.
const favicon = overrides => ({
  phase: 'dashboard-load',
  path: '/icon.svg',
  sameOrigin: true,
  method: 'GET',
  resourceType: 'other',
  selectedHeaders: { accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8' },
  hints: [],
  ...overrides,
});

test('Chromium metadata favicon is an image dependency, including HEAD/image classification', () => {
  assert.equal(isRouteRequest(favicon()), false);
  assert.equal(isRouteRequest(favicon({ method: 'HEAD', resourceType: 'image' })), false);
  assert.equal(isRouteRequest(favicon({ resourceType: 'image' })), false);
});

test('favicon exemption never hides document, fetch, XHR, mutation or generic reads', () => {
  for (const resourceType of ['document', 'fetch', 'xhr']) {
    assert.equal(isRouteRequest(favicon({ resourceType })), true, resourceType);
  }
  assert.equal(isRouteRequest(favicon({ method: 'POST' })), true);
  assert.equal(isRouteRequest(favicon({ selectedHeaders: { accept: '*/*' } })), true);
});

test('RSC and every prefetch hint keep icon requests in the strict route audit', () => {
  for (const hint of ['rsc', '_rsc', 'next-router-prefetch', 'purpose', 'sec-purpose']) {
    for (const resourceType of ['other', 'image']) {
      assert.equal(isRouteRequest(favicon({ resourceType, hints: [hint] })), true, `${hint}/${resourceType}`);
    }
  }
});

test('image Accept does not exempt application routes or arbitrary SVG paths', () => {
  for (const path of ['/invoices', '/private.svg', '/icon.svg/child']) {
    assert.equal(isRouteRequest(favicon({ path })), true, path);
  }
  // Preserve the pre-existing manifest and framework/API classification.
  for (const path of ['/manifest.webmanifest', '/_next/static/chunks/app.js', '/api/invoices/search']) {
    assert.equal(isRouteRequest(favicon({ path })), false, path);
  }
});
