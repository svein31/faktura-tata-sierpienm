"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle2, Eye, EyeOff, Lock, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/toast";

const MIN_PASSWORD_LENGTH = 8;

function PasswordStrength({ password }: { password: string }) {
  const strength =
    password.length === 0
      ? 0
      : password.length < 6
        ? 1
        : password.length < MIN_PASSWORD_LENGTH
          ? 2
          : /[A-Z]/.test(password) && /[0-9]/.test(password)
            ? 4
            : 3;

  const bars = [1, 2, 3, 4];
  const colors = ["", "bg-rose-500", "bg-amber-500", "bg-sky-500", "bg-emerald-500"];
  const labels = ["", "Słabe", "Wymaga więcej znaków", "Dobre", "Silne"];

  if (!password) return null;

  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex gap-1">
        {bars.map((b) => (
          <div
            key={b}
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
              b <= strength ? colors[strength] : "bg-border"
            }`}
          />
        ))}
      </div>
      <p
        className={`text-[10.5px] font-medium ${
          strength >= 4
            ? "text-emerald-500"
            : strength >= 3
              ? "text-sky-500"
              : strength >= 2
                ? "text-amber-500"
                : "text-rose-500"
        }`}
      >
        {labels[strength]}
      </p>
    </div>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const token = searchParams.get("token") || "";
  const emailParam = searchParams.get("email") || "";

  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [showPw, setShowPw] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("Brak tokena w adresie URL. Skorzystaj z linku otrzymanego w wiadomości e-mail.");
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków.`);
      return;
    }

    if (password !== confirm) {
      setError("Hasła nie są identyczne.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || "Nie udało się zresetować hasła. Link mógł wygasnąć.");
        setBusy(false);
        return;
      }

      setSuccess(true);
      toast("success", "Hasło zostało zmienione", "Możesz się teraz zalogować.");
      setTimeout(() => {
        router.push("/login");
      }, 2000);
    } catch {
      setError("Błąd połączenia. Spróbuj ponownie za chwilę.");
      setBusy(false);
    }
  };

  return (
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
            Ustaw nowe hasło
          </h1>
          {emailParam && (
            <p className="mt-1 text-xs text-muted-foreground">
              Dla konta: <strong className="text-foreground">{emailParam}</strong>
            </p>
          )}
        </div>

        {success ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold text-foreground">Hasło zostało pomyślnie zmienione!</p>
            <p className="text-xs text-muted-foreground">Przekierowywanie do strony logowania…</p>
            <Link
              href="/login"
              className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-xl bg-primary text-xs font-semibold text-primary-foreground"
            >
              Przejdź do logowania
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {!token && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-400">
                Brak tokena resetującego. Otwórz link bezpośrednio z otrzymanej wiadomości e-mail.
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="new-pw" className="text-xs font-medium">
                Nowe hasło (min. {MIN_PASSWORD_LENGTH} znaków)
              </Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="new-pw"
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-11 pl-10 pr-10 text-sm rounded-xl"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-muted-foreground hover:text-foreground"
                  aria-label={showPw ? "Ukryj hasło" : "Pokaż hasło"}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <PasswordStrength password={password} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-confirm" className="text-xs font-medium">
                Powtórz nowe hasło
              </Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="new-confirm"
                  type={showPw ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  className="h-11 pl-10 text-sm rounded-xl"
                  autoComplete="new-password"
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
              disabled={!token}
            >
              {!busy && <CheckCircle2 className="h-4 w-4" />}
              {busy ? "Zapisywanie…" : "Zapisz nowe hasło"}
            </Button>
          </form>
        )}
      </motion.div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="pointer-events-none absolute -top-24 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-indigo-500/8 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-24 h-[400px] w-[400px] rounded-full bg-emerald-500/8 blur-3xl" />
      <React.Suspense
        fallback={
          <div className="w-full max-w-sm rounded-2xl border border-border/80 bg-card/90 p-7 shadow-2xl backdrop-blur-xl animate-pulse space-y-4">
            <div className="h-8 w-28 bg-muted/60 rounded-xl mx-auto" />
            <div className="h-11 w-full bg-muted/30 rounded-xl mt-6" />
            <div className="h-11 w-full bg-muted/30 rounded-xl mt-3" />
          </div>
        }
      >
        <ResetPasswordForm />
      </React.Suspense>
    </div>
  );
}
