"use client";
import * as React from "react";
import { useSession } from "@/lib/session-context";

export function EmailVerificationNotice() {
  const { user, refresh } = useSession();
  const [busy, setBusy] = React.useState(false), [message, setMessage] = React.useState("");
  if (!user?.emailVerificationRequired || user.emailVerified) return null;
  async function resend() {
    setBusy(true);
    try {
      const response = await fetch("/api/auth/resend-verification", { method: "POST" });
      const body = await response.json();
      setMessage(body.message || body.error || "Spróbuj ponownie później.");
      if (body.delivery === "already-verified") await refresh();
    } catch { setMessage("Brak połączenia z serwerem. Spróbuj ponownie."); }
    finally { setBusy(false); }
  }
  return <section className="rounded-lg border border-warning/30 bg-warning/5 p-4 text-foreground" aria-label="Potwierdzenie adresu e-mail">
    <p className="break-words font-semibold">Potwierdź adres {user.email}</p>
    <p className="mt-1 text-sm">Możesz przygotowywać faktury i uzupełnić firmę. Wysyłka wiadomości do klientów będzie dostępna po potwierdzeniu adresu linkiem z e-maila.</p>
    {message && <p className="mt-2 text-sm" role="status">{message}</p>}
    <button onClick={resend} disabled={busy} className="mt-3 min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-50">{busy ? "Wysyłanie…" : "Wyślij link potwierdzający"}</button>
  </section>;
}
