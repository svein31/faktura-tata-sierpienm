"use client";
import { MfaSettings } from "@/components/mfa-settings";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  FileText,
  Globe,
  KeyRound,
  Laptop,
  Lock,
  LogOut,
  Mail,
  Save,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Trash2,
  UserCheck,
  UserCog,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/toast";
import { useSessionUser } from "@/lib/session-context";
import { useAppStore } from "@/lib/store";
import { InfoTooltip, HelpTooltip } from "@/components/ui/tooltip";
import { TwoFactorAuthCard } from "@/components/security/two-factor-auth-card";

export default function AccountSettingsPage() {
  const toast = useToast();
  const router = useRouter();
  const sessionUser = useSessionUser();

  const [activeTab, setActiveTab] = React.useState("security");

  // ── 1. Zmiana Hasła ──
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showCurrentPass, setShowCurrentPass] = React.useState(false);
  const [showNewPass, setShowNewPass] = React.useState(false);
  const [showConfirmPass, setShowConfirmPass] = React.useState(false);
  const [savingPassword, setSavingPassword] = React.useState(false);

  // Wymagania siły hasła
  const passLengthOk = newPassword.length >= 8;
  const passNumberOk = /[0-9]/.test(newPassword);
  const passSpecialOk = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(newPassword);
  const passMatchOk = newPassword.length > 0 && newPassword === confirmPassword;
  const passScore = [passLengthOk, passNumberOk, passSpecialOk, passMatchOk].filter(Boolean).length;

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      toast("error", "Podaj aktualne hasło.");
      return;
    }
    if (!passLengthOk || !passNumberOk || !passSpecialOk) {
      toast("error", "Nowe hasło nie spełnia wymogów bezpieczeństwa.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast("error", "Hasła nie są identyczne.");
      return;
    }

    setSavingPassword(true);
    try {
      const res = await fetch("/api/user/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || "Nie udało się zmienić hasła.");
      }
      toast("success", "Hasło zostało zmienione", "Możesz teraz logować się nowym hasłem.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast("error", "Błąd zmiany hasła", err instanceof Error ? err.message : "Wystąpił błąd.");
    } finally {
      setSavingPassword(false);
    }
  };

  // ── 2. Zmiana E-maila i Danych Konta ──
  const [nameDraft, setNameDraft] = React.useState(sessionUser.name || "");
  const [savingProfile, setSavingProfile] = React.useState(false);

  const [newEmailDraft, setNewEmailDraft] = React.useState("");
  const [emailAuthPassword, setEmailAuthPassword] = React.useState("");
  const [savingEmail, setSavingEmail] = React.useState(false);

  const handleUpdateProfileName = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameDraft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Nie udało się zaktualizować profilu.");
      toast("success", "Zapisano dane profilu", `Nazwa: ${nameDraft}`);
    } catch (err) {
      toast("error", "Błąd zapisu", err instanceof Error ? err.message : "Wystąpił błąd.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmailDraft || !emailAuthPassword) {
      toast("error", "Wypełnij nowy e-mail oraz podaj hasło.");
      return;
    }

    setSavingEmail(true);
    try {
      const res = await fetch("/api/user/change-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail: newEmailDraft, currentPassword: emailAuthPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "Nie udało się zmienić adresu e-mail.");
      toast("success", "Adres e-mail został zmieniony", `Nowy e-mail: ${data.email}`);
      setNewEmailDraft("");
      setEmailAuthPassword("");
    } catch (err) {
      toast("error", "Błąd zmiany e-maila", err instanceof Error ? err.message : "Wystąpił błąd.");
    } finally {
      setSavingEmail(false);
    }
  };

  // ── 3. Personalizacja i Preferencje ──
  const [defaultCurrency, setDefaultCurrency] = React.useState("PLN");
  const [defaultPaymentTermDays, setDefaultPaymentTermDays] = React.useState(14);
  const [defaultVatRate, setDefaultVatRate] = React.useState("23");
  const [defaultLanguage, setDefaultLanguage] = React.useState("PL");

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      setDefaultCurrency(localStorage.getItem("pref_currency") || "PLN");
      setDefaultPaymentTermDays(Number(localStorage.getItem("pref_payment_terms")) || 14);
      setDefaultVatRate(localStorage.getItem("pref_vat_rate") || "23");
      setDefaultLanguage(localStorage.getItem("pref_language") || "PL");
    }
  }, []);

  const handleSavePreferences = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("pref_currency", defaultCurrency);
      localStorage.setItem("pref_payment_terms", String(defaultPaymentTermDays));
      localStorage.setItem("pref_vat_rate", defaultVatRate);
      localStorage.setItem("pref_language", defaultLanguage);
    }
    toast("success", "Zapisano preferencje fakturowania", "Nowe faktury będą domyślnie korzystać z wybranych ustawień.");
  };

  // ── 4. Sesje i Danger Zone ──
  const [sessionsCount, setSessionsCount] = React.useState(1);
  const [loadingSessions, setLoadingSessions] = React.useState(false);
  const [terminatingSessions, setTerminatingSessions] = React.useState(false);

  const [deleteConfirmation, setDeleteConfirmation] = React.useState("");
  const [deletePassword, setDeletePassword] = React.useState("");
  const [deletingAccount, setDeletingAccount] = React.useState(false);

  const fetchSessions = async () => {
    setLoadingSessions(true);
    try {
      const res = await fetch("/api/user/profile");
      const data = await res.json();
      if (res.ok && data.sessionsCount) {
        setSessionsCount(data.sessionsCount);
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingSessions(false);
    }
  };

  React.useEffect(() => {
    if (activeTab === "sessions") {
      fetchSessions();
    }
  }, [activeTab]);

  const handleLogoutAllOther = async () => {
    setTerminatingSessions(true);
    try {
      const res = await fetch("/api/user/logout-all", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Błąd podczas wylogowywania.");
      toast("success", "Wylogowano z innych urządzeń", data.message);
      setSessionsCount(1);
    } catch (err) {
      toast("error", "Błąd", err instanceof Error ? err.message : "Wystąpił błąd.");
    } finally {
      setTerminatingSessions(false);
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (deleteConfirmation.trim() !== "USUŃ") {
      toast("error", 'Wpisz dokładnie słowo "USUŃ", aby potwierdzić.');
      return;
    }
    if (!deletePassword) {
      toast("error", "Wprowadź hasło do konta.");
      return;
    }

    setDeletingAccount(true);
    try {
      const res = await fetch("/api/user/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: deleteConfirmation, password: deletePassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "Nie udało się usunąć konta.");
      toast("success", "Konto zostało usunięte", "Zostaniesz przekierowany do strony logowania.");
      useAppStore.getState().resetData();
      router.push("/login");
      router.refresh();
    } catch (err) {
      toast("error", "Błąd usuwania konta", err instanceof Error ? err.message : "Wystąpił błąd.");
      setDeletingAccount(false);
    }
  };

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        title="Ustawienia Konta"
        description="Bezpieczeństwo konta, dane logowania, preferencje fakturowania oraz aktywne sesje."
        actions={
          <Badge tone="accent" className="gap-1.5 py-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            {sessionUser.email}
          </Badge>
        }
      />

      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        items={[
          { value: "security", label: "Bezpieczeństwo i Hasło", icon: <Lock className="h-3.5 w-3.5" /> },
          { value: "email", label: "Dane Konta i E-mail", icon: <Mail className="h-3.5 w-3.5" /> },
          { value: "preferences", label: "Personalizacja i Preferencje", icon: <Sliders className="h-3.5 w-3.5" /> },
          { value: "sessions", label: "Sesje i Bezpieczeństwo", icon: <ShieldAlert className="h-3.5 w-3.5" /> },
          { value: "privacy", label: "Prywatność i zgody", icon: <Shield className="h-3.5 w-3.5" /> },
        ]}
      />

      {activeTab === "security" && <MfaSettings />}

      <AnimatePresence mode="wait">
        {/* ── 1. BEZPIECZEŃSTWO I HASŁO ── */}
        {activeTab === "security" && (
          <motion.div
            key="security"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            {/* Uwierzytelnianie dwuskładnikowe 2FA TOTP */}
            <TwoFactorAuthCard />

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-primary" />
                  Zmiana Hasła
                </CardTitle>
                <CardDescription>
                  Wprowadź swoje obecne hasło, a następnie podaj i potwierdź nowe hasło dostępowe.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="flex items-center">
                      Aktualne hasło
                      <HelpTooltip text="Hasło, którego aktualnie używasz do logowania w aplikacji." />
                    </Label>
                    <div className="relative">
                      <Input
                        type={showCurrentPass ? "text" : "password"}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="••••••••••••"
                        required
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPass(!showCurrentPass)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showCurrentPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="flex items-center">
                      Nowe hasło
                      <HelpTooltip text="Hasło musi mieć co najmniej 8 znaków, w tym cyfrę i znak specjalny." />
                    </Label>
                    <div className="relative">
                      <Input
                        type={showNewPass ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Wpisz nowe, silne hasło"
                        required
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPass(!showNewPass)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showNewPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Powtórz nowe hasło</Label>
                    <div className="relative">
                      <Input
                        type={showConfirmPass ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Wpisz ponownie nowe hasło"
                        required
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPass(!showConfirmPass)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showConfirmPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <Button type="submit" loading={savingPassword} className="mt-2 w-full gap-2">
                    <Save className="h-4 w-4" /> Zmień hasło
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="h-fit">
              <CardHeader>
                <CardTitle className="text-[14px]">Wymagania Siły Hasła</CardTitle>
                <CardDescription>Dbaj o bezpieczeństwo danych finansowych firmy</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11.5px] font-medium">
                    <span>Poziom bezpieczeństwa</span>
                    <span
                      className={
                        passScore === 4
                          ? "text-emerald-600 font-bold"
                          : passScore >= 2
                          ? "text-amber-600 font-bold"
                          : "text-muted-foreground"
                      }
                    >
                      {passScore === 4 ? "Bardzo silne" : passScore >= 2 ? "Średnie" : "Wymaga poprawy"}
                    </span>
                  </div>
                  <div className="flex h-2 gap-1 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full flex-1 rounded-full transition-colors ${passLengthOk ? "bg-emerald-500" : "bg-muted"}`} />
                    <div className={`h-full flex-1 rounded-full transition-colors ${passNumberOk ? "bg-emerald-500" : "bg-muted"}`} />
                    <div className={`h-full flex-1 rounded-full transition-colors ${passSpecialOk ? "bg-emerald-500" : "bg-muted"}`} />
                    <div className={`h-full flex-1 rounded-full transition-colors ${passMatchOk ? "bg-emerald-500" : "bg-muted"}`} />
                  </div>
                </div>

                <div className="divide-y divide-border/60 text-[12px]">
                  <div className="flex items-center gap-2 py-2">
                    {passLengthOk ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <span className={passLengthOk ? "text-foreground font-medium" : "text-muted-foreground"}>
                      Co najmniej 8 znaków
                    </span>
                  </div>
                  <div className="flex items-center gap-2 py-2">
                    {passNumberOk ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <span className={passNumberOk ? "text-foreground font-medium" : "text-muted-foreground"}>
                      Przynajmniej jedna cyfra (0-9)
                    </span>
                  </div>
                  <div className="flex items-center gap-2 py-2">
                    {passSpecialOk ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <span className={passSpecialOk ? "text-foreground font-medium" : "text-muted-foreground"}>
                      Znak specjalny (np. !@#$%)
                    </span>
                  </div>
                  <div className="flex items-center gap-2 py-2">
                    {passMatchOk ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <span className={passMatchOk ? "text-foreground font-medium" : "text-muted-foreground"}>
                      Zgodność obu haseł
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.div>
        )}

        {/* ── 2. DANE KONTA I E-MAIL ── */}
        {activeTab === "email" && (
          <motion.div
            key="email"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="grid gap-6 lg:grid-cols-2"
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-primary" />
                  Profil Użytkownika
                </CardTitle>
                <CardDescription>Twoja nazwa wyświetlana w systemie i na powiadomieniach.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleUpdateProfileName} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Nazwa użytkownika / Imię</Label>
                    <Input
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      placeholder="np. Jan Kowalski"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Aktualny adres e-mail</Label>
                    <Input value={sessionUser.email} disabled className="bg-muted/50 font-mono text-[13px]" />
                    <p className="text-[11.5px] text-muted-foreground">
                      Aby zmienić ten adres, skorzystaj z formularza obok.
                    </p>
                  </div>

                  <Button type="submit" loading={savingProfile} className="gap-2">
                    <Save className="h-4 w-4" /> Zapisz dane profilu
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-primary" />
                  Zmiana Adresu E-mail
                </CardTitle>
                <CardDescription>
                  Podaj nowy adres e-mail. Zmiana wymaga potwierdzenia aktualnym hasłem.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleChangeEmail} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Nowy adres e-mail</Label>
                    <Input
                      type="email"
                      value={newEmailDraft}
                      onChange={(e) => setNewEmailDraft(e.target.value)}
                      placeholder="nowy-adres@firma.pl"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Aktualne hasło (autoryzacja)</Label>
                    <Input
                      type="password"
                      value={emailAuthPassword}
                      onChange={(e) => setEmailAuthPassword(e.target.value)}
                      placeholder="Wpisz hasło do konta"
                      required
                    />
                  </div>

                  <Button type="submit" loading={savingEmail} variant="outline" className="w-full gap-2">
                    <Mail className="h-4 w-4" /> Zmień adres e-mail
                  </Button>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ── 3. PERSONALIZACJA I PREFERENCJE ── */}
        {activeTab === "preferences" && (
          <motion.div
            key="preferences"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-primary" />
                  Domyślne Preferencje Fakturowania
                </CardTitle>
                <CardDescription>
                  Wartości wybrane w tej sekcji będą automatycznie wstawiane przy tworzeniu nowych faktur.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="flex items-center">
                      Domyślna waluta
                      <HelpTooltip text="Waluta automatycznie wybierana przy nowej fakturze." />
                    </Label>
                    <Select value={defaultCurrency} onChange={(e) => setDefaultCurrency(e.target.value)}>
                      <option value="PLN">PLN (Polski Złoty)</option>
                      <option value="EUR">EUR (Euro)</option>
                      <option value="USD">USD (Dolar Amerykański)</option>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="flex items-center">
                      Domyślny termin płatności
                      <HelpTooltip text="Liczba dni na płatność liczona od daty wystawienia faktury." />
                    </Label>
                    <Select
                      value={String(defaultPaymentTermDays)}
                      onChange={(e) => setDefaultPaymentTermDays(Number(e.target.value))}
                    >
                      <option value="0">Płatność natychmiastowa (0 dni)</option>
                      <option value="7">7 dni</option>
                      <option value="14">14 dni (standard)</option>
                      <option value="21">21 dni</option>
                      <option value="30">30 dni</option>
                      <option value="60">60 dni</option>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="flex items-center">
                      Domyślna stawka VAT dla nowych pozycji
                      <HelpTooltip text="Stawka podatku VAT podpowiadana w kreatorze faktury." />
                    </Label>
                    <Select value={defaultVatRate} onChange={(e) => setDefaultVatRate(e.target.value)}>
                      <option value="23">23% (podstawowa)</option>
                      <option value="8">8% (obniżona)</option>
                      <option value="5">5% (żywność / książki)</option>
                      <option value="0">0%</option>
                      <option value="zw">zw. (zwolniony z VAT)</option>
                      <option value="np">np. (nie podlega opodatkowaniu)</option>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="flex items-center">
                      Domyślny język dokumentu
                      <HelpTooltip text="Język wydruku i szablonu faktury." />
                    </Label>
                    <Select value={defaultLanguage} onChange={(e) => setDefaultLanguage(e.target.value)}>
                      <option value="PL">Polski (PL)</option>
                      <option value="EN">Angielski (EN)</option>
                    </Select>
                  </div>
                </div>

                <div className="pt-2">
                  <Button onClick={handleSavePreferences} className="gap-2">
                    <Save className="h-4 w-4" /> Zapisz preferencje fakturowania
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ── 4. SESJE I DANGER ZONE ── */}
        {activeTab === "sessions" && (
          <motion.div
            key="sessions"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Laptop className="h-4 w-4 text-primary" />
                  Aktywne Sesje i Logowanie
                </CardTitle>
                <CardDescription>
                  Twoja sesja jest trwale zapisana w bezpiecznej bazie danych. W razie potrzeby możesz wylogować
                  pozostałe urządzenia.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-border/80 bg-muted/30 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Laptop className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[13.5px] font-semibold text-foreground">Bieżące urządzenie (Ta przeglądarka)</p>
                      <p className="text-[12px] text-muted-foreground">
                        Aktywna sesja · Liczba zarejestrowanych sesji w bazie: <b>{sessionsCount}</b>
                      </p>
                    </div>
                  </div>
                  <Badge tone="success">Aktywna</Badge>
                </div>

                <Button
                  onClick={handleLogoutAllOther}
                  loading={terminatingSessions}
                  variant="outline"
                  className="gap-2"
                >
                  <LogOut className="h-4 w-4" /> Wyloguj ze wszystkich pozostałych urządzeń
                </Button>
              </CardContent>
            </Card>

            {/* DANGER ZONE */}
            <Card className="border-destructive/40 bg-destructive/[0.02]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <ShieldAlert className="h-5 w-5" />
                  Strefa Nieodwracalnych Zmian (Danger Zone)
                </CardTitle>
                <CardDescription>
                  Trwałe usunięcie konta, wszystkich wystawionych faktur, bazy kontrahentów i profili firm.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleDeleteAccount} className="space-y-4">
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3.5 text-[12.5px] text-destructive">
                    <p className="font-semibold">Ostrzeżenie: Tej operacji nie można cofnąć!</p>
                    <p className="mt-1 opacity-90">
                      Wszystkie dane przypisane do Twojego konta (faktury, poświadczenia KSeF, baza klientów) zostaną
                      trwale skasowane.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-destructive font-medium">
                        Wpisz słowo <span className="font-mono font-bold">USUŃ</span>
                      </Label>
                      <Input
                        value={deleteConfirmation}
                        onChange={(e) => setDeleteConfirmation(e.target.value)}
                        placeholder="USUŃ"
                        required
                        className="font-mono border-destructive/50 focus-visible:ring-destructive"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-destructive font-medium">Potwierdź hasłem</Label>
                      <Input
                        type="password"
                        value={deletePassword}
                        onChange={(e) => setDeletePassword(e.target.value)}
                        placeholder="Wpisz hasło do konta"
                        required
                        className="border-destructive/50 focus-visible:ring-destructive"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    variant="destructive"
                    loading={deletingAccount}
                    disabled={deleteConfirmation.trim() !== "USUŃ" || !deletePassword}
                    className="gap-2"
                  >
                    <Trash2 className="h-4 w-4" /> Trwale usuń moje konto
                  </Button>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ── 5. PRYWATNOŚĆ I ZGODY PRAWNE ── */}
        {activeTab === "privacy" && (
          <motion.div
            key="privacy"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="grid gap-6"
          >
            {/* Dokumenty prawne */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Dokumenty prawne serwisu
                </CardTitle>
                <CardDescription>
                  Oficjalne dokumenty regulujące korzystanie z serwisu i ochronę danych osobowych.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    { href: "/regulamin", label: "Regulamin serwisu", desc: "Warunki korzystania z platformy" },
                    { href: "/polityka-prywatnosci", label: "Polityka prywatności", desc: "Przetwarzanie danych osobowych (RODO)" },
                    { href: "/polityka-cookies", label: "Polityka cookies", desc: "Pliki cookies i pamięć przeglądarki" },
                    { href: "/powierzenie-danych", label: "Umowa DPA (art. 28 RODO)", desc: "Powierzenie przetwarzania danych" },
                    { href: "/podwykonawcy", label: "Wykaz podwykonawców", desc: "Zewnętrzni podprocesorzy danych" },
                  ].map((doc) => (
                    <a
                      key={doc.href}
                      href={doc.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 rounded-xl border border-border/60 hover:border-primary/40 hover:bg-primary/5 transition-all group"
                    >
                      <FileText className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0" />
                      <div>
                        <div className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">{doc.label}</div>
                        <div className="text-[11px] text-muted-foreground">{doc.desc}</div>
                      </div>
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Zgody i preferencje */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  Twoje zgody i preferencje prywatności
                </CardTitle>
                <CardDescription>
                  Przeglądaj i zarządzaj swoimi zgodami. Regulamin jest wymagany do korzystania z serwisu. Zgody opcjonalne możesz wycofać w dowolnym momencie.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Akceptacja regulaminu */}
                <div className="flex items-center justify-between p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    <div>
                      <div className="text-xs font-semibold">Regulamin serwisu</div>
                      <div className="text-[11px] text-muted-foreground">
                        Zaakceptowano{sessionUser.termsAcceptedAt ? ` dnia ${new Date(sessionUser.termsAcceptedAt as string).toLocaleDateString("pl-PL")}` : ""}
                      </div>
                    </div>
                  </div>
                  <Badge tone="accent" className="text-[10px]">Wymagana</Badge>
                </div>

                {/* Preferencje cookies */}
                <div className="flex items-center justify-between p-3 rounded-xl border border-border/60">
                  <div className="flex items-center gap-3">
                    <Sliders className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <div className="text-xs font-semibold">Preferencje plików cookies</div>
                      <div className="text-[11px] text-muted-foreground">Zmień zgody dotyczące cookies funkcjonalnych i analitycznych</div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        window.dispatchEvent(new CustomEvent("open-cookie-preferences"));
                      }
                    }}
                    className="text-xs"
                  >
                    Zmień preferencje
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Eksport danych RODO */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="h-4 w-4 text-primary" />
                  Eksport danych (art. 20 RODO)
                </CardTitle>
                <CardDescription>
                  Pobierz kopię swoich danych osobowych w formacie JSON. Plik zawiera profil, firmy, historię zgód i podstawowe metadane.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    window.open("/api/user/export-data", "_blank");
                  }}
                  className="gap-2"
                >
                  <Download className="h-3.5 w-3.5" />
                  Pobierz kopię moich danych (JSON)
                </Button>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Dane zostaną pobrane jako plik JSON. Możesz go otworzyć w dowolnym edytorze tekstu lub programie obsługującym ten format.
                </p>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

