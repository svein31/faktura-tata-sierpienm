/* FakturaProsto — minimalny service worker.
 *
 * Nie przechwytuje ruchu sieciowego (brak handlera fetch = domyślne zachowanie).
 * Obsługuje tylko kliknięcia w powiadomienia (Notification API) — dzięki temu
 * klik w powiadomienie otwiera/zaznacza właściwą kartę aplikacji.
 *
 * Uwaga: powiadomienia przy ZAMKNIĘTEJ aplikacji wymagają Web Push (VAPID) —
 * patrz README. Ten SW nie zastępuje Web Push.
 */
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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
