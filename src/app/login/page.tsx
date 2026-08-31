"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2, Lock, LogIn, Mail } from "lucide-react";
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

  // Jeśli użytkownik ma już aktywną sesję, automatycznie przekieruj do aplikacji
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
      const data = (await res.json()) as { error?: string; user?: { name: string } };
      if (!res.ok) {
        setError(data.error ?? "Nieprawidłowy e-mail lub hasło.");
        setBusy(false);
        return;
      }
      toast("success", `Witaj, ${data.user?.name ?? ""}`.trim(), "Logowanie powiodło się.");
      await refresh();
      window.location.href = nextUrl;
    } catch {
      setError("Błąd sieci — spróbuj ponownie.");
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="rounded-2xl border border-border bg-card/80 p-7 shadow-xl backdrop-blur"
      >
        <div className="mb-6 text-center">
          <div className="mb-3 flex justify-center">
            <Logo />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Zaloguj się</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Faktury VAT, kontrahenci i KSeF w jednym miejscu.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="email">Adres e-mail</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jan@firma.pl"
                className="pl-9"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Hasło</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="pl-9 pr-9"
                required
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label={showPw ? "Ukryj hasło" : "Pokaż hasło"}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-[12.5px] text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" loading={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            Zaloguj się
          </Button>
        </form>

        <p className="mt-5 text-center text-[13px] text-muted-foreground">
          Nie masz konta?{" "}
          <Link href="/register" className="font-semibold text-primary underline-offset-4 hover:underline">
            Zarejestruj się
          </Link>
        </p>
      </motion.div>

      <p className="mt-5 text-center text-[11.5px] leading-relaxed text-muted-foreground">
        Konta są izolowane — każdy użytkownik widzi wyłącznie własne faktury, kontrahentów
        i produkty.
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      {/* Dekoracyjne gradienty */}
      <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-indigo-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-20 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
