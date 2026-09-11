"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, Mail, Send } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
      setError("Podaj prawidłowy adres e-mail.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Wystąpił błąd. Spróbuj ponownie za chwilę.");
        setBusy(false);
        return;
      }

      setSent(true);
    } catch {
      setError("Błąd połączenia. Sprawdź dostęp do sieci.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      {/* Glow backgrounds */}
      <div className="pointer-events-none absolute -top-24 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-indigo-500/8 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-24 h-[400px] w-[400px] rounded-full bg-emerald-500/8 blur-3xl" />

      <div className="w-full max-w-sm">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-2xl border border-border/80 bg-card/90 p-7 shadow-2xl backdrop-blur-xl"
        >
          <div className="mb-6 flex flex-col items-center text-center">
            <Logo />
            <h1 className="mt-4 text-xl font-bold tracking-tight text-foreground">
              Resetowanie hasła
            </h1>
            <p className="mt-1.5 text-[12.5px] text-muted-foreground leading-relaxed">
              Wprowadź adres e-mail powiązany z kontem, a prześlemy bezpieczny link do zmiany hasła.
            </p>
          </div>

          {sent ? (
            <div className="space-y-5 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">Wiadomość została wysłana</h2>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Jeśli podany adres <strong className="text-foreground">{email}</strong> istnieje w
                  naszej bazie, przesłaliśmy link ważny przez 60 minut.
                </p>
              </div>
              <div className="pt-2">
                <Link
                  href="/login"
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border bg-muted/30 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Wróć do logowania</span>
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="forgot-email" className="text-xs font-medium">
                  Adres e-mail
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="forgot-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jan@firma.pl"
                    className="h-11 pl-10 text-sm rounded-xl"
                    required
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/8 px-3.5 py-2.5 text-[12.5px] text-rose-600 dark:text-rose-400">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="mt-2 h-11 w-full text-[13.5px] font-semibold rounded-xl"
                loading={busy}
              >
                {!busy && <Send className="h-4 w-4" />}
                {busy ? "Wysyłanie…" : "Wyślij link do resetu"}
              </Button>

              <div className="pt-3 text-center">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Wróć do logowania</span>
                </Link>
              </div>
            </form>
          )}
        </motion.div>
      </div>
    </div>
  );
}
