/** Register after page load and idle; the worker never stores business data. */
export function registerStaticWorker(): void {
  if (!window.isSecureContext || !("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {});
}
