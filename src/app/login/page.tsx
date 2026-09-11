"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff, LogIn, Mail, Lock } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { useSession } from "@/lib/session-context";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const { status, refresh } = useSession();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPw, setShowPw] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  const expired = searchParams.get("expired");
  const already = searchParams.get("already");
  const nextUrl = searchParams.get("next") || "/";

  React.useEffect(() => {
    if (status === "authenticated" && !expired) {
      router.replace(nextUrl);
    }
  }, [status, expired, nextUrl, router]);

  React.useEffect(() => {
    if (expired === "1") toast("info", "Sesja wygasła", "Zaloguj się ponownie.");
    if (already === "1") toast("info", "Jesteś już zalogowany", "Kontynuujesz pracę.");
  }, [expired, already, toast]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      setError("Podaj e-mail i hasło.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
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
        setError(data.error || "Nieprawidłowy e-mail lub hasło.");
        setBusy(false);
        return;
      }

      toast("success", `Witaj, ${data.user?.name ?? ""}`.trim(), "Logowanie powiodło się.");
      try {
        await refresh();
      } catch {
        // ignore
      }
      window.location.href = nextUrl;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      setError(msg ? `Błąd połączenia: ${msg}` : "Błąd sieci lub połączenia — spróbuj ponownie.");
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
        {/* Logo */}
        <div className="mb-7 flex flex-col items-center text-center">
          <Logo />
          <h1 className="mt-4 text-xl font-bold tracking-tight text-foreground">
            Zaloguj się do Fakturo
          </h1>
          <p className="mt-1.5 text-[12.5px] text-muted-foreground leading-relaxed">
            Faktury VAT, kontrahenci i KSeF w jednym miejscu.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-medium">Adres e-mail</Label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
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

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-xs font-medium">Hasło</Label>
              <Link
                href="/forgot-password"
                className="text-[11.5px] font-medium text-primary hover:underline transition-colors"
              >
                Nie pamiętasz hasła?
              </Link>
            </div>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-11 pl-10 pr-10 text-sm rounded-xl"
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
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/8 px-3.5 py-2.5 text-[12.5px] text-rose-600 dark:text-rose-400">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
              {error}
            </div>
          )}

          <Button type="submit" className="mt-2 h-11 w-full text-[13.5px] font-semibold rounded-xl" loading={busy}>
            {!busy && <LogIn className="h-4 w-4" />}
            {busy ? "Logowanie…" : "Zaloguj się"}
          </Button>
        </form>

        <div className="mt-6 border-t border-border/60 pt-5">
          <p className="text-center text-[12.5px] text-muted-foreground">
            Nie masz konta?{" "}
            <Link
              href="/register"
              className="font-semibold text-primary underline-offset-4 hover:underline transition-colors"
            >
              Zarejestruj się
            </Link>
          </p>
        </div>
      </motion.div>

      <p className="mt-5 text-center text-[11px] leading-relaxed text-muted-foreground/70 px-4">
        Konta są izolowane — każdy użytkownik widzi wyłącznie własne faktury i dane.
      </p>
    </div>
  );
}

function LoginFormSkeleton() {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-border/80 bg-card/90 p-7 shadow-2xl backdrop-blur-xl animate-pulse space-y-4">
      <div className="h-8 w-28 bg-muted/60 rounded-xl mx-auto" />
      <div className="h-4 w-44 bg-muted/40 rounded mx-auto mt-3" />
      <div className="h-11 w-full bg-muted/30 rounded-xl mt-6" />
      <div className="h-11 w-full bg-muted/30 rounded-xl mt-3" />
      <div className="h-11 w-full bg-primary/20 rounded-xl mt-4" />
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      {/* Atmospheric gradients */}
      <div className="pointer-events-none absolute -top-24 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-indigo-500/8 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-24 h-[400px] w-[400px] rounded-full bg-emerald-500/8 blur-3xl" />
      <div className="pointer-events-none absolute top-1/2 -left-24 h-[300px] w-[300px] -translate-y-1/2 rounded-full bg-violet-500/6 blur-3xl" />
      <Suspense fallback={<LoginFormSkeleton />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
