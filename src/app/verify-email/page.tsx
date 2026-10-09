"use client";
import * as React from "react";
import Link from "next/link";

export default function VerifyEmailPage() {
  const [token, setToken] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ success?: boolean; emailChanged?: boolean; message: string } | null>(null);
  const linkCaptured = React.useRef(false);
  React.useEffect(() => {
    if (linkCaptured.current) return;
    linkCaptured.current = true;
    setToken(new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "");
    window.history.replaceState(window.history.state, "", "/verify-email");
  }, []);
  async function confirm() {
    setBusy(true);
    try {
      const response = await fetch("/api/auth/verify-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const body = await response.json();
      setResult({ success: response.ok, emailChanged: body.emailChanged, message: body.message || body.error || "Nie udało się potwierdzić adresu." });
    } catch { setResult({ message: "Nie udało się połączyć z serwerem. Spróbuj ponownie." }); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center gap-5 px-6 py-16">
    <h1 className="text-2xl font-bold">Potwierdź adres e-mail</h1>
    <p>{result?.message ?? "Potwierdzenie pozwoli wysyłać faktury do klientów. Kliknij przycisk, jeśli to Ty zamówiłeś wiadomość."}</p>
    {!result?.success && <button disabled={busy || !token} onClick={confirm} className="rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground disabled:opacity-50">{busy ? "Potwierdzanie…" : "Potwierdź adres"}</button>}
    {!token && !result && <p>Otwórz pełny link z wiadomości e-mail. Nowy link zamówisz w Ustawieniach konta.</p>}
    <Link prefetch={false} href={result?.emailChanged ? "/login" : "/settings/account"} className="underline">{result?.emailChanged ? "Zaloguj się nowym adresem" : "Przejdź do Ustawień konta"}</Link>
  </main>;
}
