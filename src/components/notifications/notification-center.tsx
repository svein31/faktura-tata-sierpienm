"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bell, BellRing } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useToast } from "@/components/toast";
import { playNotificationSound, unlockAudio } from "@/lib/sound";
import type { AppNotification } from "@/lib/types";
import { containModalFocus } from "@/lib/overlay-focus";

const POLL_INTERVAL_MS = 20_000; // 20 s (wymagane 15–30 s)
// The closed bell must not download the full preferences/list panel.
const NotificationPanel = React.lazy(() => import("./notification-panel").then(module => ({ default: module.NotificationPanel })));

/** A failed optional chunk must leave the rest of the workspace usable. */
class NotificationPanelBoundary extends React.Component<{ children: React.ReactNode; onClose: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div role="alert" className="space-y-3 p-6 text-sm">
      <p>Nie udało się wczytać powiadomień. Odśwież stronę i spróbuj ponownie.</p>
      <button type="button" className="rounded-lg border px-3 py-2" onClick={this.props.onClose}>Zamknij</button>
    </div>;
    return this.props.children;
  }
}

export function NotificationBell() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [markingRead, setMarkingRead] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const popupId = React.useId();
  const seenRef = React.useRef<Set<string>>(new Set());
  const soundUnlockedRef = React.useRef(false);

  const notifications = useAppStore((s) => s.notifications);
  const prefs = useAppStore((s) => s.notificationPrefs);
  const hydrated = useAppStore((s) => s.hydrated);
  const unread = notifications.filter((n) => !n.read).length;
  React.useLayoutEffect(() => {
    if (!open || !panelRef.current) return;
    return containModalFocus(panelRef.current, () => setOpen(false));
  }, [open]);

  /* ── Wsparcie Notification API ─────────────────────────────────────── */
  const notifSupported = React.useMemo(
    () => typeof window !== "undefined" && "Notification" in window,
    []
  );

  React.useEffect(() => {
    // Odblokowanie audio po pierwszym geście użytkownika (polityka autoplay).
    const unlock = () => {
      if (!soundUnlockedRef.current) {
        soundUnlockedRef.current = unlockAudio();
      }
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  /* ── Obsługa nowego powiadomienia (toast + dźwięk + browser) ───────── */
  const handleNew = React.useCallback(
    (n: AppNotification) => {
      if (seenRef.current.has(n.id)) return;
      seenRef.current.add(n.id);

      toast("info", n.title, n.body ?? "");

      if (prefs.soundEnabled) playNotificationSound();

      if (
        notifSupported &&
        prefs.browserEnabled &&
        Notification.permission === "granted" &&
        document.visibilityState === "visible"
      ) {
        try {
          const ntf = new Notification(n.title, { body: n.body ?? "", icon: "/icon.svg", tag: n.id });
          ntf.onclick = () => {
            window.focus();
            if (n.link) router.push(n.link);
            ntf.close();
          };
        } catch {
          /* ignorujemy */
        }
      }
    },
    [toast, notifSupported, prefs.browserEnabled, prefs.soundEnabled, router]
  );

  /* ── Polling 20 s ──────────────────────────────────────────────────── */
  React.useEffect(() => {
    if (!hydrated) return;

    const first = useAppStore.getState().notifications;
    for (const n of first) seenRef.current.add(n.id);
    let controller = new AbortController();
    let running = false;
    const pause = () => controller.abort();
    const resume = () => { if (controller.signal.aborted) controller = new AbortController(); };

    const poll = async () => {
      if (running || controller.signal.aborted) return;
      running = true;
      const signal = controller.signal;
      try {
        const state = useAppStore.getState();
        const before = new Set(state.notifications.map((n) => n.id));
        await state.fetchNotifications(signal);
        if (signal.aborted) return;
        const after = useAppStore.getState().notifications;
        for (const n of after) {
          if (!before.has(n.id) && !n.read) handleNew(n);
        }
      } catch {
        /* sieć chwilowo niedostępna — następna iteracja */
      } finally {
        running = false;
      }
    };

    const interval = window.setInterval(() => void poll(), POLL_INTERVAL_MS);
    window.addEventListener("pagehide", pause);
    window.addEventListener("pageshow", resume);
    return () => {
      window.clearInterval(interval);controller.abort();
      window.removeEventListener("pagehide", pause);window.removeEventListener("pageshow", resume);
    };
  }, [hydrated, handleNew]);

  /* ── UI ────────────────────────────────────────────────────────────── */

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={open ? popupId : undefined}
        aria-haspopup="dialog"
        aria-label={`Powiadomienia${unread ? ` (${unread} nieprzeczytanych)` : ""}`}
        className="relative rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {unread > 0 ? <BellRing className="h-[18px] w-[18px] text-primary" /> : <Bell className="h-[18px] w-[18px]" />}
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && <>
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
        <div
          ref={panelRef}
          id={popupId}
          role="dialog"
          aria-modal="true"
          aria-label="Powiadomienia"
          data-state="open"
          tabIndex={-1}
          className="ui-popup fixed inset-x-2.5 top-14 mx-auto w-auto max-w-[calc(100vw-20px)] sm:max-w-[380px] sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[380px] z-50 overflow-hidden"
        >
          <NotificationPanelBoundary onClose={() => setOpen(false)}>
          <React.Suspense fallback={<p role="status" className="p-6 text-sm text-muted-foreground">Wczytywanie powiadomień…</p>}>
            <NotificationPanel notifSupported={notifSupported} handleNew={handleNew} onClose={() => setOpen(false)} busy={busy} setBusy={setBusy} markingRead={markingRead} setMarkingRead={setMarkingRead} />
          </React.Suspense>
          </NotificationPanelBoundary>
        </div>
      </>}
    </div>
  );
}
