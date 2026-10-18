/** Distinguish required metadata from observed application navigation requests. */
function isRouteRequest(request) {
  if (request.path === '/icon.svg') {
    // Chromium can report its metadata favicon as "other". Exempt only that
    // ordinary image read; navigation, fetch and prefetch evidence stay strict.
    return !(['GET', 'HEAD'].includes(request.method)
      && ['other', 'image'].includes(request.resourceType)
      && /(?:^|,)\s*image\//i.test(request.selectedHeaders?.accept || '')
      && request.hints?.length === 0);
  }
  // WebKit classifies the document's PWA manifest as "other". It is required
  // metadata, not an unrelated application route or navigation warmup.
  return request.path !== '/manifest.webmanifest'
    && !request.path.startsWith('/_next/') && !/^\/api(?:\/|$)/.test(request.path)
    && ['document', 'fetch', 'xhr', 'other'].includes(request.resourceType);
}

exports.isRouteRequest = isRouteRequest;
