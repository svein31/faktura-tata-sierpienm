"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Users2,
  Building2,
  CheckCircle2,
  ArrowRight,
  AlertCircle,
  LogOut,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/toast";
import { useSession } from "@/lib/session-context";
import { browserAppStore } from "@/lib/store";

interface InviteData {
  valid: true;
  email: string;
  role: string;
  companyName: string;
  companyNip?: string | null;
  expiresAt: string;
  hasExistingAccount: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Współwłaściciel firmy",
  accountant: "Księgowa / Biuro rachunkowe",
  employee: "Pracownik / Sprzedawca",
  viewer: "Podgląd / Audytor",
};

export default function InviteAcceptPage() {
  const params = useParams();
  const token = params.token as string;
  const router = useRouter();
  const toast = useToast();
  const { user, refresh } = useSession();

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<InviteData | null>(null);

  // Form states
  const [password, setPassword] = React.useState("");
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [acceptTerms, setAcceptTerms] = React.useState(false);
  const canAcceptDirectly = Boolean(user && data && user.email.toLowerCase() === data.email.toLowerCase());

  // Pobierz dane zaproszenia
  React.useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    async function loadInvite() {
      try {
        setLoading(true);
        setError(null);
        setData(null);
        setPassword("");
        setName("");
        setAcceptTerms(false);
        // The public provider skips session queries on informational pages.
        // Invitations need the actor to distinguish direct acceptance from a
        // different logged-in account, so refresh only for this workflow.
        const [res] = await Promise.all([fetch(`/api/invite/${token}`, { signal: controller.signal }), refresh()]);
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || "Nie udało się zweryfikować zaproszenia.");
        }
        if (json.valid !== true || typeof json.companyName !== "string" || typeof json.email !== "string" || typeof json.role !== "string" || typeof json.hasExistingAccount !== "boolean") {
          throw new Error("Nie udało się zweryfikować danych zaproszenia. Otwórz link ponownie.");
        }
        if (cancelled) return;
        setData(json);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Nie udało się zweryfikować zaproszenia.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (token) {
      void loadInvite();
    }
    return () => { cancelled = true; controller.abort(); };
  }, [token, refresh]);

  // Akceptacja zaproszenia
  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data) return;

    try {
      setBusy(true);
      setError(null);

      const payload: Record<string, string | boolean> = {};
      if (!canAcceptDirectly) {
        if (!password) {
          setError("Wpisz hasło do konta.");
          setBusy(false);
          return;
        }
        payload.password = password;
        if (!data.hasExistingAccount) {
          if (!name.trim()) {
            setError("Wpisz swoje imię i nazwisko.");
            setBusy(false);
            return;
          }
          payload.name = name.trim();
        }
        // Nowi użytkownicy muszą zaakceptować regulamin
        if (!data.hasExistingAccount && !acceptTerms) {
          setError("Akceptacja Regulaminu jest wymagana do utworzenia konta.");
          setBusy(false);
          return;
        }
        if (!data.hasExistingAccount) {
          payload.acceptTerms = true;
        }
      }

      const res = await fetch(`/api/invite/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (!res.ok) {
        if (result.code === "MFA_REQUIRED") { setPassword(""); router.push(`/login?next=${encodeURIComponent(`/invite/${token}`)}`); return; }
        throw new Error(result.error || "Nie udało się przyjąć zaproszenia.");
      }

      toast(
        "success",
        "Witaj w zespole!",
        `Pomyślnie dołączono do firmy ${data.companyName}.`
      );

      // The invitation can create/sign in a new actor. Bind the cache to the
      // confirmed session, rather than the user captured before acceptance.
      await refresh();
      const actorResponse = await fetch("/api/auth/me", { cache: "no-store" });
      const actorData = await actorResponse.json();
      if (!actorResponse.ok || typeof actorData.user?.id !== "string" || !actorData.user.id) {
        throw new Error("Nie udało się potwierdzić sesji. Zaloguj się ponownie, aby otworzyć firmę.");
      }
      const actorStore = browserAppStore(actorData.user.id, null);
      await actorStore.getState().bootstrap();

      // Ustaw aktywną firmę na tę nowo dodaną
      if (typeof result.companyId === "string") {
        actorStore.getState().setSelectedCompanyId(result.companyId);
      }

      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się przyjąć zaproszenia.");
    } finally {
      setBusy(false);
    }
  };

  const handleLogoutAndRetry = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      await refresh();
      window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-b from-background via-background to-muted/20 select-none">
      <div className="mb-6 flex items-center gap-2">
        <Logo />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md"
      >
        <Card className="p-6 bg-card border-border/80 shadow-xl rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500" />

          {loading ? (
            <div role="status" className="py-16 text-center text-xs text-muted-foreground">
              Weryfikacja zaproszenia...
            </div>
          ) : error && !data ? (
            <div className="py-8 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">Nieprawidłowe zaproszenie</h2>
                <p className="text-xs text-muted-foreground mt-1">{error}</p>
              </div>
              <Link href="/login" prefetch={false} className="mt-2 inline-flex min-h-8 items-center justify-center rounded-lg border border-border/70 bg-card px-3 py-2 text-xs font-medium text-foreground shadow-2xs transition-colors hover:border-border hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                Wróć do logowania
              </Link>
            </div>
          ) : data ? (
            <div className="space-y-5">
              <div className="text-center space-y-1.5 pb-3 border-b border-border/60">
                <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-2">
                  <Users2 className="w-5 h-5" />
                </div>
                <h1 className="text-base font-bold text-foreground">Zaproszenie do zespołu</h1>
                <p className="text-xs text-muted-foreground">
                  Zostałeś zaproszony do współpracy w firmie:
                </p>
                <div className="p-3 bg-muted/40 rounded-xl border border-border/80 mt-2 text-left">
                  <div className="flex items-center gap-2.5">
                    <Building2 className="w-4 h-4 text-primary shrink-0" />
                    <div className="min-w-0 break-words">
                      <p className="text-xs font-bold text-foreground">{data.companyName}</p>
                      {data.companyNip && <p className="text-[11px] text-muted-foreground">NIP: {data.companyNip}</p>}
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-border/60 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span className="text-muted-foreground">Twoja rola:</span>
                    <Badge tone="default" className="text-[10px]">
                      {ROLE_LABELS[data.role] || data.role}
                    </Badge>
                  </div>
                </div>
              </div>

              {error && (
                <div role="alert" className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* SCENARIUSZ A: Zalogowany z innym e-mailem */}
              {user && user.email.toLowerCase() !== data.email.toLowerCase() ? (
                <div className="space-y-4 text-xs">
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200">
                    <p className="font-semibold">Niezgodność adresu e-mail</p>
                    <p className="mt-1 break-words">
                      Jesteś obecnie zalogowany jako <b>{user.email}</b>, natomiast to zaproszenie
                      zostało przypisane do adresu <b>{data.email}</b>.
                    </p>
                  </div>
                  <Button
                    onClick={handleLogoutAndRetry}
                    variant="outline"
                    className="w-full text-xs font-semibold gap-2 text-rose-700 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Wyloguj się i dołącz z właściwego konta</span>
                  </Button>
                </div>
              ) : (
                /* SCENARIUSZ B & C: Dołączenie bezpośrednie lub logowanie/rejestracja */
                <form onSubmit={handleAccept} className="space-y-4">
                  {canAcceptDirectly ? (
                    <div className="space-y-3 text-xs">
                      <p className="text-muted-foreground text-center">
                        Jesteś zalogowany jako <b>{user?.email}</b>. Kliknij poniżej, aby natychmiast
                        dołączyć do zespołu.
                      </p>
                      <Button type="submit" disabled={busy} className="w-full text-xs font-semibold gap-2 h-10">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{busy ? "Dołączanie..." : "Dołącz do zespołu firmy"}</span>
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-xs text-muted-foreground">
                        Zaproszenie dla: <b>{data.email}</b>
                      </div>

                      {!data.hasExistingAccount && (
                        <div>
                          <Label htmlFor="invite-name" className="text-xs font-semibold">Twoje imię i nazwisko</Label>
                          <Input
                            id="invite-name"
                            type="text"
                            autoComplete="name"
                            maxLength={100}
                            placeholder="Jan Kowalski"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            className="mt-1 text-xs"
                          />
                        </div>
                      )}

                      <div>
                        <Label htmlFor="invite-password" className="text-xs font-semibold">
                          {data.hasExistingAccount ? "Wpisz hasło do swojego konta" : "Utwórz hasło do nowego konta"}
                        </Label>
                        <Input
                          id="invite-password"
                          type="password"
                          autoComplete={data.hasExistingAccount ? "current-password" : "new-password"}
                          minLength={data.hasExistingAccount ? undefined : 8}
                          placeholder="Min. 8 znaków"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          className="mt-1 text-xs"
                        />
                        {!data.hasExistingAccount && (
                          <p className="text-[10.5px] text-muted-foreground mt-1">
                            Zostanie utworzone konto powiązane z tym adresem e-mail.
                          </p>
                        )}
                      </div>

                      {/* Akceptacja regulaminu dla nowych użytkowników */}
                      {!data.hasExistingAccount && (
                        <div className="space-y-2 pt-1">
                          <label className="flex items-start gap-2.5 cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={acceptTerms}
                              onChange={(e) => setAcceptTerms(e.target.checked)}
                              className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary/50 shrink-0"
                              required
                            />
                            <span className="text-[11px] leading-relaxed text-muted-foreground group-hover:text-foreground transition-colors">
                              Zapoznałem/am się z treścią{" "}
                              <Link prefetch={false} href="/regulamin" target="_blank" className="text-primary font-semibold hover:underline">
                                Regulaminu serwisu
                              </Link>{" "}
                              i akceptuję jego postanowienia. <span className="text-rose-500">*</span>
                            </span>
                          </label>
                          <p className="text-[10px] text-muted-foreground pl-6">
                            Informacje o przetwarzaniu danych:{" "}
                            <Link prefetch={false} href="/polityka-prywatnosci" target="_blank" className="text-primary underline underline-offset-2">
                              Polityka prywatności
                            </Link>.
                          </p>
                        </div>
                      )}

                      <Button type="submit" disabled={busy} className="w-full text-xs font-semibold gap-2 h-10 mt-2">
                        <span>{busy ? "Przetwarzanie..." : data.hasExistingAccount ? "Zaloguj się i dołącz" : "Załóż konto i dołącz"}</span>
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </form>
              )}
            </div>
          ) : null}
        </Card>
      </motion.div>
    </div>
  );
}

