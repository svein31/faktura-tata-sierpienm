"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, BellRing, CheckCheck, FlaskConical, Loader2, Megaphone, Receipt, Send, ShieldCheck, Volume2, VolumeX } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useToast } from "@/components/toast";
import { playNotificationSound, unlockAudio, audioSupported } from "@/lib/sound";
import { formatDateTime } from "@/lib/format";
import type { AppNotification } from "@/lib/types";
import { cn } from "@/lib/utils";

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


export function NotificationPanel({ notifSupported, handleNew, onClose, busy, setBusy, markingRead, setMarkingRead }: {
  notifSupported: boolean;
  handleNew: (notification: AppNotification) => void;
  onClose: () => void;
  busy: boolean;
  setBusy: React.Dispatch<React.SetStateAction<boolean>>;
  markingRead: boolean;
  setMarkingRead: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const router = useRouter();
  const toast = useToast();
  const notifications = useAppStore(s => s.notifications);
  const prefs = useAppStore(s => s.notificationPrefs);
  const unread = notifications.filter(notification => !notification.read).length;
  const [perm, setPerm] = React.useState<NotificationPermission | "unsupported">("unsupported");
  React.useEffect(() => {
    setPerm(notifSupported ? Notification.permission : "unsupported");
  }, [notifSupported]);

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
    if (markingRead) return;
    const ids = notifications.filter((n) => !n.read).map((n) => n.id);
    setMarkingRead(true);
    try {
      const results = await Promise.allSettled(ids.map(id => useAppStore.getState().markNotificationRead(id, true)));
      const failures = results.filter(result => result.status === "rejected").length;
      if (failures) toast("error", "Nie oznaczono wszystkich powiadomień", `Nie udało się zapisać ${failures} z ${ids.length} zmian. Spróbuj ponownie.`);
      else toast("success", "Oznaczono jako przeczytane");
    } finally { setMarkingRead(false); }
  };

  const markReadAndGo = (n: AppNotification) => {
    if (!n.read) void useAppStore.getState().markNotificationRead(n.id, true).catch(() => toast("error", "Nie oznaczono powiadomienia jako przeczytane", "Sprawdź połączenie i spróbuj ponownie."));
    onClose();
    if (n.link) router.push(n.link);
  };

  return <>
    <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
      <p className="text-[13px] font-semibold">Powiadomienia</p>
      <div className="flex items-center gap-1">
        {unread > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            disabled={markingRead}
            aria-busy={markingRead}
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
          <Bell className="mx-auto h-8 w-8 text-muted-foreground" />
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
              <span className="mt-0.5 block text-[10.5px] text-muted-foreground">
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
          {!audioSupported() && <span className="text-[10.5px] text-warning">— brak wsparcia</span>}
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
            <BellRing className="h-3.5 w-3.5 text-success" />
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
        <p className="text-[11px] text-warning dark:text-warning">
          Przeglądarka zablokowała powiadomienia. Odblokuj je w ustawieniach strony (ikona kłódki).
        </p>
      )}
      {perm === "default" && (
        <p className="text-[11px] text-muted-foreground">
          Zgoda wymagana — włącz przełącznik, a przeglądarka poprosi o pozwolenie (kliknięcie).
        </p>
      )}
      {perm === "granted" && (
        <p className="text-[11px] text-success dark:text-success">
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
        <Link prefetch={false} href="/invoices" onClick={onClose} className="underline underline-offset-2 hover:text-foreground">
          Przycisk „Symuluj FZ z KSeF” na liście faktur
        </Link>{" "}
        tworzy fakturę zakupową + powiadomienie do przetestowania.
      </p>
    </div>
  </>;
}
