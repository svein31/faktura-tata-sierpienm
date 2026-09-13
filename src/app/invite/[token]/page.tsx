"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Users2,
  Building2,
  CheckCircle2,
  ShieldCheck,
  Lock,
  User,
  ArrowRight,
  AlertCircle,
  LogOut,
  Mail,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/toast";
import { useSession } from "@/lib/session-context";
import { useAppStore } from "@/lib/store";

interface InviteData {
  invitation: {
    id: string;
    email: string;
    role: string;
    expiresAt: string;
  };
  company: {
    id: string;
    name: string;
    nip: string;
  };
  currentUser: {
    id: string;
    email: string;
    name: string;
  } | null;
  userExists: boolean;
  canAcceptDirectly: boolean;
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

  // Pobierz dane zaproszenia
  React.useEffect(() => {
    async function loadInvite() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/invite/${token}`);
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || "Nie udało się zweryfikować zaproszenia.");
        }
        setData(json);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    if (token) {
      loadInvite();
    }
  }, [token]);

  // Akceptacja zaproszenia
  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data) return;

    try {
      setBusy(true);
      setError(null);

      const payload: Record<string, string> = {};
      if (!data.canAcceptDirectly) {
        if (!password) {
          setError("Wpisz hasło do konta.");
          setBusy(false);
          return;
        }
        payload.password = password;
        if (!data.userExists) {
          if (!name.trim()) {
            setError("Wpisz swoje imię i nazwisko.");
            setBusy(false);
            return;
          }
          payload.name = name.trim();
        }
        // Nowi użytkownicy muszą zaakceptować regulamin
        if (!data.userExists && !acceptTerms) {
          setError("Akceptacja Regulaminu jest wymagana do utworzenia konta.");
          setBusy(false);
          return;
        }
        if (!data.userExists) {
          payload.acceptTerms = "true";
        }
      }

      const res = await fetch(`/api/invite/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || "Nie udało się przyjąć zaproszenia.");
      }

      toast(
        "success",
        "Witaj w zespole!",
        `Pomyślnie dołączono do firmy ${result.company?.companyName || result.company?.name || "firmy"}.`
      );

      // Odśwież sesję i dane aplikacji
      await refresh();
      await useAppStore.getState().bootstrap();

      // Ustaw aktywną firmę na tę nowo dodaną
      if (result.company?.id) {
        useAppStore.getState().setSelectedCompanyId(result.company.id);
      }

      router.push("/");
    } catch (err: any) {
      setError(err.message);
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
            <div className="py-16 text-center text-xs text-muted-foreground">
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
              <Link href="/login">
                <Button variant="outline" size="sm" className="mt-2 text-xs">
                  Wróć do logowania
                </Button>
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
                    <div>
                      <p className="text-xs font-bold text-foreground">{data.company.name}</p>
                      <p className="text-[11px] text-muted-foreground">NIP: {data.company.nip}</p>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-border/60 flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">Twoja rola:</span>
                    <Badge tone="default" className="text-[10px]">
                      {ROLE_LABELS[data.invitation.role] || data.invitation.role}
                    </Badge>
                  </div>
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* SCENARIUSZ A: Zalogowany z innym e-mailem */}
              {data.currentUser && data.currentUser.email.toLowerCase() !== data.invitation.email.toLowerCase() ? (
                <div className="space-y-4 text-xs">
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200">
                    <p className="font-semibold">Niezgodność adresu e-mail</p>
                    <p className="mt-1">
                      Jesteś obecnie zalogowany jako <b>{data.currentUser.email}</b>, natomiast to zaproszenie
                      zostało przypisane do adresu <b>{data.invitation.email}</b>.
                    </p>
                  </div>
                  <Button
                    onClick={handleLogoutAndRetry}
                    variant="outline"
                    className="w-full text-xs font-semibold gap-2 text-rose-500 hover:text-rose-600"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Wyloguj się i dołącz z właściwego konta</span>
                  </Button>
                </div>
              ) : (
                /* SCENARIUSZ B & C: Dołączenie bezpośrednie lub logowanie/rejestracja */
                <form onSubmit={handleAccept} className="space-y-4">
                  {data.canAcceptDirectly ? (
                    <div className="space-y-3 text-xs">
                      <p className="text-muted-foreground text-center">
                        Jesteś zalogowany jako <b>{data.currentUser?.email}</b>. Kliknij poniżej, aby natychmiast
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
                        Zaproszenie dla: <b>{data.invitation.email}</b>
                      </div>

                      {!data.userExists && (
                        <div>
                          <Label className="text-xs font-semibold">Twoje imię i nazwisko</Label>
                          <Input
                            type="text"
                            placeholder="Jan Kowalski"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            className="mt-1 text-xs"
                          />
                        </div>
                      )}

                      <div>
                        <Label className="text-xs font-semibold">
                          {data.userExists ? "Wpisz hasło do swojego konta" : "Utwórz hasło do nowego konta"}
                        </Label>
                        <Input
                          type="password"
                          placeholder="Min. 8 znaków"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          className="mt-1 text-xs"
                        />
                        {!data.userExists && (
                          <p className="text-[10.5px] text-muted-foreground mt-1">
                            Zostanie utworzone konto powiązane z tym adresem e-mail.
                          </p>
                        )}
                      </div>

                      {/* Akceptacja regulaminu dla nowych użytkowników */}
                      {!data.userExists && (
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
                              <Link href="/regulamin" target="_blank" className="text-primary font-semibold hover:underline">
                                Regulaminu serwisu
                              </Link>{" "}
                              i akceptuję jego postanowienia. <span className="text-rose-500">*</span>
                            </span>
                          </label>
                          <p className="text-[10px] text-muted-foreground/80 pl-6">
                            Informacje o przetwarzaniu danych:{" "}
                            <Link href="/polityka-prywatnosci" target="_blank" className="text-primary hover:underline">
                              Polityka prywatności
                            </Link>.
                          </p>
                        </div>
                      )}

                      <Button type="submit" disabled={busy} className="w-full text-xs font-semibold gap-2 h-10 mt-2">
                        <span>{busy ? "Przetwarzanie..." : data.userExists ? "Zaloguj się i dołącz" : "Załóż konto i dołącz"}</span>
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
