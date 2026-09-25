"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function MfaSettings() {
  const [enabled, setEnabled] = useState<boolean | null>(null), [remaining, setRemaining] = useState(0);
  const [password, setPassword] = useState(""), [code, setCode] = useState("");
  const [setup, setSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [codes, setCodes] = useState<string[]>([]), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => {
    // Remove the old browser-only 2FA flags; they never protected server logins.
    try {
      localStorage.removeItem("fakturo_2fa_enabled");
      localStorage.removeItem("fakturo_2fa_backup_codes");
    } catch { /* Browser storage may be disabled. */ }
    let live = true;
    fetch("/api/auth/mfa").then(async res => { const data = await res.json(); if (!res.ok) throw new Error(data.error); return data; })
      .then(data => { if (live) { setEnabled(data.enabled); setRemaining(data.recoveryRemaining); } })
      .catch(e => { if (live) setError(e.message || "Nie udało się pobrać ustawień 2FA."); });
    return () => { live = false; };
  }, []);
  async function submit(action: string) {
    setBusy(true); setError(""); setCodes([]);
    try {
      const res = await fetch("/api/auth/mfa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, password, code }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "Błąd ustawień 2FA.");
      if (action === "setup") { setSetup(data); setCode(""); }
      else { setEnabled(data.enabled); setSetup(null); setCodes(data.recoveryCodes); setRemaining(data.recoveryCodes.length); setPassword(""); setCode(""); }
    } catch (e) { setError(e instanceof Error ? e.message : "Błąd 2FA."); }
    finally { setBusy(false); }
  }
  return <Card className="mb-5 space-y-4 p-5">
    <div><h2 className="font-semibold">Weryfikacja dwuetapowa (2FA)</h2><p className="text-sm text-muted-foreground">{enabled === null ? "Sprawdzanie ustawień…" : enabled ? `Włączona. Pozostałe kody odzyskiwania: ${remaining}.` : "Dodaj kod z aplikacji uwierzytelniającej do logowania."}</p></div>
    {enabled !== null && <>
      <div><Label htmlFor="mfa-password">Aktualne hasło</Label><Input id="mfa-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} maxLength={128} /></div>
      {setup && <div className="space-y-2"><p className="text-sm">Zeskanuj kod w aplikacji uwierzytelniającej. Potwierdź kod poniżej, aby zapisać ochronę konta. Konfiguracja wygasa po 10 minutach.</p><img src={setup.qrDataUrl} width={200} height={200} alt="Kod QR do konfiguracji 2FA" /><p className="break-all font-mono text-sm">Klucz do ręcznego wpisania: {setup.secret}</p></div>}
      {(enabled || setup) && <div><Label htmlFor="mfa-confirm-code">{enabled ? "Kod 2FA lub kod odzyskiwania" : "Kod z aplikacji (6 cyfr)"}</Label><Input id="mfa-confirm-code" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} maxLength={40} /></div>}
      <div className="flex flex-wrap gap-2">
        {!enabled && <Button disabled={busy || !password || Boolean(setup && !code)} onClick={() => void submit(setup ? "enable" : "setup")}>{setup ? "Potwierdź i włącz 2FA" : "Skonfiguruj 2FA"}</Button>}
        {!enabled && setup && <Button variant="outline" disabled={busy || !password} onClick={() => void submit("setup")}>Ponownie pokaż lub odśwież QR</Button>}
        {enabled && <><Button disabled={busy || !password || !code} onClick={() => void submit("recovery")}>Nowe kody odzyskiwania</Button><Button variant="outline" disabled={busy || !password || !code} onClick={() => void submit("disable")}>Wyłącz 2FA</Button></>}
      </div>
    </>}
    {codes.length > 0 && <div className="space-y-2 rounded-lg border p-3"><p className="text-sm font-semibold">Zapisz kody w bezpiecznym miejscu. Każdy działa tylko raz; nie pokażemy ich ponownie.</p><pre className="overflow-auto text-xs">{codes.join("\n")}</pre><Button variant="outline" onClick={() => { void navigator.clipboard.writeText(codes.join("\n")).catch(() => setError("Nie udało się skopiować. Zaznacz i skopiuj kody ręcznie.")); }}>Kopiuj kody</Button><Button variant="outline" onClick={() => setCodes([])}>Kody zapisane — ukryj</Button></div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </Card>;
}
