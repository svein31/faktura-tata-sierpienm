"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle2, Eye, EyeOff, Lock, Mail, ShieldCheck, UserPlus } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { useSession } from "@/lib/session-context";

const MIN_PASSWORD_LENGTH = 8;

function PasswordStrength({ password }: { password: string }) {
  const strength = password.length === 0 ? 0
    : password.length < 6 ? 1
    : password.length < MIN_PASSWORD_LENGTH ? 2
    : /[A-Z]/.test(password) && /[0-9]/.test(password) ? 4
    : 3;

  const bars = [1, 2, 3, 4];
  const colors = ["", "bg-rose-500", "bg-amber-500", "bg-sky-500", "bg-emerald-500"];
  const labels = ["", "Słabe", "Wymaga więcej", "Dobre", "Silne"];

  if (!password) return null;

  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex gap-1">
        {bars.map((b) => (
          <div
            key={b}
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${b <= strength ? colors[strength] : "bg-border"}`}
          />
        ))}
      </div>
      <p className={`text-[10.5px] font-medium ${strength >= 4 ? "text-emerald-500" : strength >= 3 ? "text-sky-500" : strength >= 2 ? "text-amber-500" : "text-rose-500"}`}>
        {labels[strength]}
      </p>
    </div>
  );
}

function RegisterForm() {
  const router = useRouter();
  const toast = useToast();
  const { status, refresh } = useSession();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [showPw, setShowPw] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (status === "authenticated") {
      router.replace("/");
    }
  }, [status, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
      setError("Podaj prawidłowy adres e-mail.");
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
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail, password }),
      });

      let data: { error?: string; user?: { name: string } } = {};
      try {
        const text = await res.text();
        try {
          data = JSON.parse(text);
        } catch {
          data = { error: text || `Błąd serwera (${res.status})` };
        }
      } catch {
        // ignore
      }

      if (!res.ok) {
        setError(data.error || "Nie udało się utworzyć konta. Sprawdź czy podany e-mail nie jest zajęty.");
        setBusy(false);
        return;
      }

      toast("success", `Konto utworzone — witaj!`, "Zacznij od uzupełnienia danych firmy.");
      try {
        await refresh();
      } catch {
        // ignore
      }
      window.location.href = "/";
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      setError(msg ? `Błąd połączenia: ${msg}` : "Błąd sieci — spróbuj ponownie za chwilę.");
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
        {/* Logo + heading */}
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo />
          <h1 className="mt-4 text-xl font-bold tracking-tight text-foreground">
            Stwórz konto
          </h1>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
            Bezpłatny start — Twoje dane są prywatne i bezpieczne.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4" noValidate>
          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="reg-email" className="text-xs font-medium">Adres e-mail</Label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="reg-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jan@firma.pl"
                className="h-11 pl-10 text-sm rounded-xl"
                autoComplete="email"
                required
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <Label htmlFor="reg-password" className="text-xs font-medium">Hasło (min. {MIN_PASSWORD_LENGTH} znaków)</Label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="reg-password"
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
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-muted-foreground transition-colors hover:text-foreground"
                aria-label={showPw ? "Ukryj hasło" : "Pokaż hasło"}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <PasswordStrength password={password} />
          </div>

          {/* Confirm */}
          <div className="space-y-1.5">
            <Label htmlFor="reg-confirm" className="text-xs font-medium">Powtórz hasło</Label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="reg-confirm"
                type={showPw ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                className="h-11 pl-10 text-sm rounded-xl"
                autoComplete="new-password"
                required
              />
              {confirm && password && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {confirm === password ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <span className="h-4 w-4 text-rose-500 text-[10px] font-bold">✕</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/8 px-3.5 py-2.5 text-[12.5px] text-rose-600 dark:text-rose-400">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
              {error}
            </div>
          )}

          <Button type="submit" className="mt-2 h-11 w-full text-[13.5px] font-semibold rounded-xl" loading={busy}>
            {!busy && <UserPlus className="h-4 w-4" />}
            {busy ? "Tworzenie konta…" : "Utwórz konto"}
          </Button>

          {/* Security badge */}
          <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-[11.5px] leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
            <span>
              Bezpieczne szyfrowanie i ochrona Twoich danych finansowych. Sesja pozostaje aktywna przez 30 dni.
            </span>
          </div>
        </form>

        <div className="mt-5 border-t border-border/60 pt-4">
          <p className="text-center text-[12.5px] text-muted-foreground">
            Masz konto?{" "}
            <Link
              href="/login"
              className="font-semibold text-primary underline-offset-4 hover:underline transition-colors"
            >
              Zaloguj się
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}

function RegisterFormSkeleton() {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-border/80 bg-card/90 p-7 shadow-2xl backdrop-blur-xl animate-pulse space-y-4">
      <div className="h-8 w-28 bg-muted/60 rounded-xl mx-auto" />
      <div className="h-4 w-44 bg-muted/40 rounded mx-auto mt-3" />
      <div className="h-11 w-full bg-muted/30 rounded-xl mt-6" />
      <div className="h-11 w-full bg-muted/30 rounded-xl mt-3" />
      <div className="h-11 w-full bg-muted/30 rounded-xl mt-3" />
      <div className="h-11 w-full bg-primary/20 rounded-xl mt-4" />
    </div>
  );
}

export default function RegisterPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="pointer-events-none absolute -top-24 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-indigo-500/8 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-24 h-[400px] w-[400px] rounded-full bg-emerald-500/8 blur-3xl" />
      <div className="pointer-events-none absolute top-1/2 -left-24 h-[300px] w-[300px] -translate-y-1/2 rounded-full bg-violet-500/6 blur-3xl" />
      <React.Suspense fallback={<RegisterFormSkeleton />}>
        <RegisterForm />
      </React.Suspense>
    </div>
  );
}
