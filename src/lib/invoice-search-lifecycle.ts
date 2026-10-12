type SearchWindow = EventTarget & {
  navigation?: EventTarget;
  NavigateEvent?: { prototype: object };
  stop?: () => void;
};
type SearchNavigationEvent = Event & {
  destination: { sameDocument: boolean };
  signal: AbortSignal;
  downloadRequest?: string | null;
};

/** Prevent a debounce from starting fetch in a document that is navigating away. */
export function createInvoiceSearchLifecycle(target: SearchWindow, onResume: () => void, onInterrupted: () => void) {
  const navigation = target.navigation;
  const modern = !!navigation && !!target.NavigateEvent && "signal" in target.NavigateEvent.prototype;
  let departing = false, hidden = false, disposed = false;
  let activeWork: { cancel: () => void } | undefined;
  let stopWatchingNavigation = () => {};

  const removeFallback = () => target.removeEventListener("beforeunload", beforeUnload);
  const pause = (interrupted = false) => {
    if (disposed) return;
    departing = true;
    const work = activeWork;
    activeWork = undefined;
    removeFallback();
    work?.cancel();
    if (interrupted && work) onInterrupted();
  };
  const resume = () => {
    if (disposed || hidden || !departing) return;
    departing = false;
    onResume();
  };
  const beforeUnload = () => pause(true);
  const pageHide = () => {
    hidden = true;
    stopWatchingNavigation();
    pause(!modern);
  };
  const pageShow = (event: Event) => {
    if (!(event as PageTransitionEvent).persisted || disposed) return;
    hidden = false;
    stopWatchingNavigation();
    departing = false;
    onResume();
  };
  const navigate = (event: Event) => {
    const next = event as SearchNavigationEvent;
    // Framework history replacements and downloads do not prove departure was canceled.
    if (next.destination.sameDocument || next.downloadRequest != null) return;
    stopWatchingNavigation();
    pause();
    const cancelled = () => { stopWatchingNavigation(); resume(); };
    stopWatchingNavigation = () => {
      next.signal.removeEventListener("abort", cancelled);
      stopWatchingNavigation = () => {};
    };
    next.signal.addEventListener("abort", cancelled, { once: true });
    if (next.signal.aborted) cancelled();
  };

  if (modern) navigation!.addEventListener("navigate", navigate);
  target.addEventListener("pagehide", pageHide);
  target.addEventListener("pageshow", pageShow);
  return {
    get departing() { return departing || hidden || disposed; },
    track(cancel: () => void) {
      if (departing || hidden || disposed) { cancel(); return () => {}; }
      const work = { cancel };
      activeWork = work;
      // Some full-document navigations do not emit a native navigate event.
      // Keep this fallback only while work is pending in every browser.
      target.addEventListener("beforeunload", beforeUnload);
      return () => {
        if (activeWork === work) { activeWork = undefined; removeFallback(); }
      };
    },
    retry(event?: { isTrusted?: boolean }) {
      if (!departing || !event?.isTrusted || disposed || hidden || typeof target.stop !== "function") return false;
      // The user explicitly stays here. Stop the pending document navigation
      // before admitting another request; a click alone does not prove cancellation.
      // Remove the old watcher so a synchronous abort cannot also trigger onResume.
      stopWatchingNavigation();
      try { target.stop(); } catch { return false; }
      if (disposed || hidden) return false;
      departing = false;
      return true;
    },
    dispose() {
      if (disposed) return;
      stopWatchingNavigation();
      pause();
      disposed = true;
      if (modern) navigation!.removeEventListener("navigate", navigate);
      target.removeEventListener("pagehide", pageHide);
      target.removeEventListener("pageshow", pageShow);
    },
  };
}
