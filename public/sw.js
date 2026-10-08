/* Cache only hashed public build assets and the generic offline page.
 * API responses, navigations, PDFs and business data never enter Cache Storage. */
const OFFLINE_CACHE = "fakturaprosto-offline-v1";
const ASSET_CACHE = "fakturaprosto-static-v1";
const MAX_ASSETS = 80;
let writes = Promise.resolve();
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(OFFLINE_CACHE).then(cache => cache.add("/offline.html")).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key =>
    (key.startsWith("fakturaprosto-offline-") && key !== OFFLINE_CACHE) ||
    (key.startsWith("fakturaprosto-static-") && key !== ASSET_CACHE)
  ).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(url).catch(() => client.focus());
          return;
        }
      }
      return self.clients.openWindow(url);
    })
  );
});


function isHashedAsset(request, url) {
  if (request.method !== "GET" || url.origin !== self.location.origin || url.search || request.headers.has("authorization")) return false;
  if (request.cache === "no-store" || request.headers.get("range")) return false;
  if (!/^\/_next\/static\/(?:chunks|css|media)\//.test(url.pathname)) return false;
  const filename = url.pathname.split("/").pop();
  return /(?:^|[-.])[0-9a-f]{8,}(?:[-.]|$)/i.test(filename) && /\.(?:js|css|woff2?|avif|webp|png|jpe?g|svg|ico)$/i.test(filename);
}

function canStore(response) {
  const policy = response.headers.get("cache-control") || "";
  const type = response.headers.get("content-type") || "";
  return response.ok && !response.redirected && response.type !== "opaque" &&
    /\bpublic\b/i.test(policy) && /\bimmutable\b/i.test(policy) && !/\b(?:private|no-store)\b/i.test(policy) &&
    /^(?:text\/(?:javascript|css)|application\/(?:javascript|x-javascript|font-woff|font-woff2)|font\/|image\/)/i.test(type);
}

async function cachedAsset(event) {
  let cache;
  try {
    cache = await caches.open(ASSET_CACHE);
    const hit = await cache.match(event.request);
    if (hit) return hit;
  } catch { /* Storage restrictions must not prevent network requests. */ }
  const response = await fetch(event.request);
  if (cache && canStore(response)) {
    const copy = response.clone();
    writes = writes.catch(() => {}).then(async () => {
      await cache.put(event.request, copy);
      const keys = await cache.keys();
      await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)).map(key => cache.delete(key)));
    });
    event.waitUntil(writes.catch(() => {}));
  }
  return response;
}

self.addEventListener("fetch", event => {
  const request = event.request, url = new URL(request.url);
  if (isHashedAsset(request, url)) { event.respondWith(cachedAsset(event)); return; }
  if (request.method !== "GET" || request.mode !== "navigate" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith(fetch(request).catch(async () => {
    try {
      const fallback = await (await caches.open(OFFLINE_CACHE)).match("/offline.html");
      if (fallback) return fallback;
    } catch { /* The browser may have evicted or disabled Cache Storage. */ }
    return new Response("Brak połączenia", { status: 503 });
  }));
});
