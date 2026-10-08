"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  BellRing,
  CheckCheck,
  FlaskConical,
  Loader2,
  Megaphone,
  Receipt,
  Send,
  ShieldCheck,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useToast } from "@/components/toast";
import { playNotificationSound, unlockAudio, audioSupported } from "@/lib/sound";
import { formatDateTime } from "@/lib/format";
import type { AppNotification } from "@/lib/types";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 20_000; // 20 s (wymagane 15–30 s)
const kindIcon = (k: AppNotification["kind"]) => {
  switch (k) {
    case "invoice_purchase":
      return <Receipt className="h-3.5 w-3.5" />;
    case "ksef_status":
      return <ShieldCheck className="h-3.5 w-3.5" />;
    case "test":
      return <FlaskConical className="h-3.5 w-3.5" />;
    default:
      return <Megaphone className="h-3.5 w-3.5" />;
  }
};

export function NotificationBell() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [perm, setPerm] = React.useState<NotificationPermission | "unsupported">("unsupported");
  const seenRef = React.useRef<Set<string>>(new Set());
  const soundUnlockedRef = React.useRef(false);

  const notifications = useAppStore((s) => s.notifications);
  const prefs = useAppStore((s) => s.notificationPrefs);
  const hydrated = useAppStore((s) => s.hydrated);
  const unread = notifications.filter((n) => !n.read).length;

  /* ── Wsparcie Notification API ─────────────────────────────────────── */
  const notifSupported = React.useMemo(
    () => typeof window !== "undefined" && "Notification" in window,
    []
  );

  const refreshPermission = React.useCallback(() => {
    if (!notifSupported) {
      setPerm("unsupported");
      return;
    }
    setPerm(Notification.permission);
  }, [notifSupported]);

  React.useEffect(() => {
    refreshPermission();
    // Odblokowanie audio po pierwszym geście użytkownika (polityka autoplay).
    const unlock = () => {
      if (!soundUnlockedRef.current) {
        soundUnlockedRef.current = unlockAudio();
      }
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, [refreshPermission]);

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

    const poll = async () => {
      try {
        const state = useAppStore.getState();
        const before = new Set(state.notifications.map((n) => n.id));
        await state.fetchNotifications();
        const after = useAppStore.getState().notifications;
        for (const n of after) {
          if (!before.has(n.id) && !n.read) handleNew(n);
        }
      } catch {
        /* sieć chwilowo niedostępna — następna iteracja */
      }
    };

    const interval = window.setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [hydrated, handleNew]);

  /* ── Akcje ─────────────────────────────────────────────────────────── */

  const requestPermission = async (): Promise<boolean> => {
    if (!notifSupported) {
      toast("error", "Twoja przeglądarka nie wspiera powiadomień", "Użyj innej przeglądarki (Chrome, Edge, Firefox, Safari).");
      return false;
    }
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") {
      toast("error", "Powiadomienia zablokowane", "Odblokuj je w ustawieniach przeglądarki (ikona kłódki).");
      return false;
    }
    try {
      const p = await Notification.requestPermission();
      setPerm(p);
      return p === "granted";
    } catch {
      return false;
    }
  };

  const toggleBrowser = async () => {
    const next = !prefs.browserEnabled;
    if (next) {
      const granted = await requestPermission();
      if (!granted) return; // pozostaje wyłączone; użytkownik widzi komunikat
    }
    try {
      await useAppStore.getState().updateNotificationPrefs({ browserEnabled: next });
      toast("success", next ? "Powiadomienia przeglądarki włączone" : "Powiadomienia przeglądarki wyłączone");
    } catch (e) {
      toast("error", "Nie udało się zapisać preferencji", e instanceof Error ? e.message : undefined);
    }
  };

  const toggleSound = async () => {
    unlockAudio();
    const next = !prefs.soundEnabled;
    try {
      await useAppStore.getState().updateNotificationPrefs({ soundEnabled: next });
      if (next) playNotificationSound();
      toast("success", next ? "Dźwięk włączony" : "Dźwięk wyłączony");
    } catch (e) {
      toast("error", "Nie udało się zapisać preferencji", e instanceof Error ? e.message : undefined);
    }
  };

  const testNotification = async () => {
    setBusy(true);
    unlockAudio();
    try {
      const res = await fetch("/api/test/incoming", { method: "POST" });
      if (!res.ok) throw new Error("Błąd API");
      const data = (await res.json()) as { notification: AppNotification };
      // Natychmiastowe przetworzenie (bez czekania na poll).
      useAppStore.setState({ notifications: [data.notification, ...useAppStore.getState().notifications] });
      handleNew(data.notification);
      toast("success", "Wysłano testowe powiadomienie");
    } catch {
      toast("error", "Nie udało się wysłać testowego powiadomienia");
    } finally {
      setBusy(false);
    }
  };

  const markAllRead = async () => {
    const ids = notifications.filter((n) => !n.read).map((n) => n.id);
    await Promise.all(ids.map((id) => useAppStore.getState().markNotificationRead(id, true).catch(() => undefined)));
    toast("success", "Oznaczono jako przeczytane");
  };

  const markReadAndGo = (n: AppNotification) => {
    if (!n.read) void useAppStore.getState().markNotificationRead(n.id, true).catch(() => undefined);
    setOpen(false);
    if (n.link) router.push(n.link);
  };

  /* ── UI ────────────────────────────────────────────────────────────── */

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Powiadomienia${unread ? ` (${unread} nieprzeczytanych)` : ""}`}
        className="relative rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {unread > 0 ? <BellRing className="h-[18px] w-[18px] text-accent" /> : <Bell className="h-[18px] w-[18px]" />}
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              className="fixed inset-x-2.5 top-14 mx-auto w-auto max-w-[calc(100vw-20px)] sm:max-w-[380px] sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[380px] z-50 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <p className="text-[13px] font-semibold">Powiadomienia</p>
                <div className="flex items-center gap-1">
                  {unread > 0 && (
                    <button
                      onClick={markAllRead}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <CheckCheck className="h-3.5 w-3.5" /> Przeczytane
                    </button>
                  )}
                  <button
                    onClick={testNotification}
                    disabled={busy}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-medium text-accent hover:bg-accent/10"
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Test
                  </button>
                </div>
              </div>

              {/* Lista */}
              <div className="max-h-[300px] overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-4 py-10 text-center">
                    <Bell className="mx-auto h-8 w-8 text-muted-foreground/40" />
                    <p className="mt-2 text-[13px] font-medium">Brak powiadomień</p>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                      Nowe faktury zakupowe i statusy KSeF pojawią się tutaj.
                    </p>
                  </div>
                ) : (
                  notifications.slice(0, 20).map((n) => (
                    <button
                      key={n.id}
                      onClick={() => markReadAndGo(n)}
                      className={cn(
                        "flex w-full items-start gap-2.5 border-b border-border/60 px-4 py-2.5 text-left transition-colors hover:bg-muted/50",
                        !n.read && "bg-accent/[0.04]"
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                          n.read ? "bg-muted text-muted-foreground" : "bg-accent/15 text-accent"
                        )}
                      >
                        {kindIcon(n.kind)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className={cn("truncate text-[12.5px]", n.read ? "font-medium text-muted-foreground" : "font-semibold")}>
                            {n.title}
                          </span>
                          {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                        </span>
                        {n.body && <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground break-words">{n.body}</span>}
                        <span className="mt-0.5 block text-[10.5px] text-muted-foreground/70">
                          {formatDateTime(n.createdAt)}
                        </span>
                      </span>
                    </button>
                  ))
                )}
              </div>

              {/* Preferencje */}
              <div className="space-y-2.5 border-t border-border bg-muted/20 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Preferencje
                </p>

                <label className="flex cursor-pointer items-center justify-between gap-2 text-[12.5px]">
                  <span className="flex items-center gap-2">
                    <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
                    Dźwięk (Web Audio)
                    {!audioSupported() && <span className="text-[10.5px] text-amber-600">— brak wsparcia</span>}
                  </span>
                  <input
                    type="checkbox"
                    checked={prefs.soundEnabled}
                    onChange={toggleSound}
                    className="h-4 w-4 accent-[hsl(var(--primary))]"
                    aria-label="Dźwięk powiadomień"
                  />
                </label>

                <label className="flex cursor-pointer items-center justify-between gap-2 text-[12.5px]">
                  <span className="flex items-center gap-2">
                    {perm === "granted" ? (
                      <BellRing className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Bell className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    Powiadomienia przeglądarki
                  </span>
                  <input
                    type="checkbox"
                    checked={prefs.browserEnabled}
                    onChange={toggleBrowser}
                    className="h-4 w-4 accent-[hsl(var(--primary))]"
                    aria-label="Powiadomienia przeglądarki"
                  />
                </label>

                {perm === "unsupported" && (
                  <p className="text-[11px] text-muted-foreground">
                    Ta przeglądarka nie wspiera Notification API — dostępne są dzwonek, toast i dźwięk.
                  </p>
                )}
                {perm === "denied" && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    Przeglądarka zablokowała powiadomienia. Odblokuj je w ustawieniach strony (ikona kłódki).
                  </p>
                )}
                {perm === "default" && (
                  <p className="text-[11px] text-muted-foreground">
                    Zgoda wymagana — włącz przełącznik, a przeglądarka poprosi o pozwolenie (kliknięcie).
                  </p>
                )}
                {perm === "granted" && (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                    Zgoda udzielona. Powiadomienia działają przy otwartej karcie aplikacji.
                  </p>
                )}

                <div className="flex items-center gap-2">
                  <button
                    onClick={testNotification}
                    disabled={busy}
                    className="inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2 text-[11.5px] font-medium text-foreground transition-colors hover:bg-muted/60"
                  >
                    {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                    Wyślij testowe
                  </button>
                  <button
                    onClick={() => {
                      unlockAudio();
                      playNotificationSound();
                      toast("success", "Dźwięk testowy", "Jeśli nie słychać — kliknij najpierw gdziekolwiek na stronie.");
                    }}
                    disabled={!audioSupported()}
                    className="inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2 text-[11.5px] font-medium text-foreground transition-colors hover:bg-muted/60 disabled:opacity-50"
                  >
                    {prefs.soundEnabled ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
                    Test dźwięku
                  </button>
                </div>

                {prefs.browserEnabled && (
                  <p className="text-[10.5px] leading-snug text-muted-foreground">
                    Powiadomienia przeglądarki wymagają HTTPS i działają przy otwartej karcie. Pełne
                    powiadomienia przy zamkniętej aplikacji wymagają Web Push (VAPID) — patrz README.
                  </p>
                )}
                <p className="text-[10.5px] text-muted-foreground">
                  <Link href="/invoices" onClick={() => setOpen(false)} className="underline underline-offset-2 hover:text-foreground">
                    Przycisk „Symuluj FZ z KSeF” na liście faktur
                  </Link>{" "}
                  tworzy fakturę zakupową + powiadomienie do przetestowania.
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
